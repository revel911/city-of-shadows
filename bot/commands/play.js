import {
  SlashCommandBuilder,
  ChannelType,
  StringSelectMenuBuilder,
  ActionRowBuilder,
} from 'discord.js';
import { startSession } from '../handlers/session.js';
import { listPlayers } from '../handlers/github.js';
import { resolveCharacterFromList } from '../handlers/read-utils.js';

const NEW_CHARACTER_VALUE = '__new__';
export const SELECT_CUSTOM_ID = 'play:select';

export const data = new SlashCommandBuilder()
  .setName('play')
  .setDescription('Start or resume a session.')
  .addStringOption(o => o
    .setName('character')
    .setDescription('Character id (skip the menu). Use "new" to start onboarding.')
    .setRequired(false));

export async function execute(interaction) {
  await interaction.deferReply({ ephemeral: true });

  const channel = interaction.channel;
  if (!channel || !('threads' in channel)) {
    await interaction.editReply('Run /play in a server text channel.');
    return;
  }

  const requested = interaction.options.getString('character');
  const players = await listPlayers();

  if (requested) {
    const chosen = resolveCharacter(requested, players, interaction.user.username);
    if (!chosen) {
      await interaction.editReply(`No character "${requested}" found.`);
      return;
    }
    if (!canPlayCharacter(chosen, interaction.user.id)) {
      await interaction.editReply(`**${chosen.name}** belongs to another player.`);
      return;
    }
    chosen.discord_id = interaction.user.id;
    await openSession(interaction, channel, chosen);
    return;
  }

  const options = [
    {
      label: '+ New character',
      description: 'Start onboarding for a new character.',
      value: NEW_CHARACTER_VALUE,
    },
    ...players.filter(p => canPlayCharacter(p, interaction.user.id)).slice(0, 24).map(p => ({
      label: p.name,
      value: p.id,
    })),
  ];

  const menu = new StringSelectMenuBuilder()
    .setCustomId(SELECT_CUSTOM_ID)
    .setPlaceholder('Choose a character…')
    .addOptions(options);

  await interaction.editReply({
    content: 'Who are you playing?',
    components: [new ActionRowBuilder().addComponents(menu)],
  });
}

export async function handleSelect(interaction) {
  await interaction.deferUpdate();

  const channel = interaction.channel;
  if (!channel || !('threads' in channel)) {
    await interaction.editReply({ content: 'Run /play in a server text channel.', components: [] });
    return;
  }

  const value = interaction.values[0];
  const players = await listPlayers();
  const chosen = resolveCharacter(value, players, interaction.user.username);
  if (!chosen) {
    await interaction.editReply({ content: `No character "${value}" found.`, components: [] });
    return;
  }
  if (!canPlayCharacter(chosen, interaction.user.id)) {
    await interaction.editReply({ content: `**${chosen.name}** belongs to another player.`, components: [] });
    return;
  }
  chosen.discord_id = interaction.user.id;
  await openSession(interaction, channel, chosen);
}

function resolveCharacter(value, players, fallbackName) {
  if (value === 'new' || value === NEW_CHARACTER_VALUE) {
    return { id: NEW_CHARACTER_VALUE, name: fallbackName };
  }
  return resolveCharacterFromList(value, fallbackName, players);
}

export function canPlayCharacter(character, discordId, operatorIds = process.env.OPERATOR_DISCORD_IDS || '') {
  if (!character || character.id === NEW_CHARACTER_VALUE) return true;
  if (character.shared === true || !character.owner_id) return true;
  if (String(character.owner_id) === String(discordId)) return true;
  const operators = String(operatorIds).split(',').map(value => value.trim()).filter(Boolean);
  return operators.includes(String(discordId));
}

async function openSession(interaction, channel, chosen) {
  // A new character has no character id yet (the MC mints the kebab id partway
  // through onboarding), so its thread can't yet be named per-character — it
  // launches titled "<username> — new character" and is renamed to
  // "<character name> — session" once <save_onboarding>/<close_session> lands
  // the id+name (see renameSessionThread in session.js). We never block a new
  // character: each launch is a genuinely distinct character, and the old
  // name-based block collapsed them all under the player's Discord username.
  const isNew = chosen.id === NEW_CHARACTER_VALUE;
  const threadName = isNew
    ? `${chosen.name} — new character`
    : `${chosen.name} — session`;

  if (!isNew) {
    const active = await findActiveSessionThread(channel.guild, threadName);
    if (active) {
      await interaction.editReply({
        content: `**${chosen.name}** is currently in a session: <#${active.id}>. Try again once it's archived.`,
        components: [],
      });
      return;
    }
  }

  const thread = await channel.threads.create({
    name: threadName,
    type: ChannelType.PrivateThread,
    invitable: false,
    autoArchiveDuration: 1440,
  });
  await thread.members.add(interaction.user.id);

  await interaction.editReply({ content: `Session opened: <#${thread.id}>`, components: [] });
  await startSession(thread, chosen);
}

async function findActiveSessionThread(guild, threadName) {
  const { threads } = await guild.channels.fetchActiveThreads();
  return threads.find(t => t.name === threadName && !t.archived) || null;
}
