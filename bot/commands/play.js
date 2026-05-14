import { SlashCommandBuilder, ChannelType } from 'discord.js';
import { startSession } from '../handlers/session.js';
import { listPlayers } from '../handlers/github.js';

export const data = new SlashCommandBuilder()
  .setName('play')
  .setDescription('Start or resume a session.')
  .addStringOption(o => o
    .setName('character')
    .setDescription('Character id (only needed if you have multiple).')
    .setRequired(false));

export async function execute(interaction) {
  await interaction.deferReply({ ephemeral: true });

  const userId = interaction.user.id;
  const players = await listPlayers();
  const owned = players.filter(p => p.discord_user_id === userId);
  const requested = interaction.options.getString('character');

  let chosen = null;
  if (requested) {
    chosen = (requested === 'new')
      ? { id: '__new__', name: interaction.user.username }
      : owned.find(p => p.id === requested || p.name.toLowerCase() === requested.toLowerCase());
    if (!chosen) {
      await interaction.editReply(`No character "${requested}" linked to your Discord account.`);
      return;
    }
  } else if (owned.length === 0) {
    await interaction.editReply(
      'No character is linked to your Discord account. Ask the architect to add your Discord ID to `players/index.json`, or run `/play character:new` to create one.'
    );
    return;
  } else if (owned.length === 1) {
    chosen = owned[0];
  } else {
    const list = owned.map(p => `• \`${p.id}\` — ${p.name}`).join('\n');
    await interaction.editReply(`You have multiple characters. Use \`/play character:<id>\`:\n${list}`);
    return;
  }

  const channel = interaction.channel;
  if (!channel || !('threads' in channel)) {
    await interaction.editReply('Run /play in a server text channel.');
    return;
  }

  const thread = await channel.threads.create({
    name: `${chosen.name} — session`,
    type: ChannelType.PrivateThread,
    invitable: false,
    autoArchiveDuration: 1440,
  });
  await thread.members.add(userId);

  await interaction.editReply(`Session opened: <#${thread.id}>`);
  await startSession(thread, chosen);
}
