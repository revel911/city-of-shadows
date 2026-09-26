import {
  SlashCommandBuilder,
  ChannelType,
  StringSelectMenuBuilder,
  ActionRowBuilder,
} from 'discord.js';
import { ensureSession, startSession, hasLiveSession } from '../handlers/session.js';
import { listPlayers, readJSON, updateJSON } from '../handlers/github.js';
import { canPlayCharacter, resolveCharacterFromList } from '../handlers/read-utils.js';

export { canPlayCharacter };

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
      description: 'Create someone new. Save a draft and return anytime.',
      value: NEW_CHARACTER_VALUE,
    },
    ...players.filter(p => canPlayCharacter(p, interaction.user.id)).slice(0, 24).map(p => ({
      label: p.name,
      description: p.creation_status === 'draft' ? 'Resume character creation' : 'Continue or start your next session',
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
    const checkpoint = await readJSON(`players/${chosen.id}/checkpoint.json`);
    const savedThreadId = chosen.thread_id || checkpoint?.thread_id;
    let active = savedThreadId ? await channel.guild.channels.fetch(savedThreadId).catch(() => null) : null;
    // Name lookup is only a migration fallback for sessions created before stable IDs.
    if (!active) active = await findActiveSessionThread(channel.guild, threadName);
    if (active && (!active.archived || checkpoint?.active || chosen.creation_status === 'draft')) {
      if (active.archived) await active.setArchived(false);
      await active.members.add(interaction.user.id);
      await interaction.editReply({ content: `Continue **${chosen.name}**: <#${active.id}>`, components: [] });
      if (!hasLiveSession(active.id)) {
        // Prefer the exact runtime snapshot; fall back to a fresh opening.
        const { session } = await ensureSession(active, interaction.user.id, { snapshotOnly: true });
        if (session) await active.send('— *Welcome back. Picking up exactly where you left off.* —').catch(() => {});
        else await startSession(active, chosen);
      }
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
  if (!isNew) await updateJSON('players/index.json', current => (current || []).map(item => item.id === chosen.id ? { ...item, thread_id: thread.id } : item), `[session] thread for ${chosen.id}`);

  await interaction.editReply({ content: `Session opened: <#${thread.id}>`, components: [] });
  await startSession(thread, chosen);
}

async function findActiveSessionThread(guild, threadName) {
  const { threads } = await guild.channels.fetchActiveThreads();
  return threads.find(t => t.name === threadName && !t.archived) || null;
}
