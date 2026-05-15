import { SlashCommandBuilder } from 'discord.js';
import { readFile, listPlayers } from '../handlers/github.js';
import { resolveCharacterFromList, sendChunked } from '../handlers/read-utils.js';

export const data = new SlashCommandBuilder()
  .setName('sheet')
  .setDescription('Show a character sheet.')
  .addStringOption(o => o
    .setName('character')
    .setDescription('Character id or name (defaults to yours).')
    .setRequired(false));

export async function execute(interaction) {
  await interaction.deferReply({ ephemeral: true });
  try {
    const arg = interaction.options.getString('character');
    const players = await listPlayers();
    const player = resolveCharacterFromList(arg, interaction.user.username, players);
    if (!player) {
      const known = players.map(p => p.id).join(', ');
      await interaction.editReply(`No character found. Try \`character:<id>\` — known: ${known}`);
      return;
    }
    const content = await readFile(`players/${player.id}/sheet.md`);
    if (!content) {
      await interaction.editReply(`No sheet found for **${player.name}**.`);
      return;
    }
    await sendChunked(interaction, content);
  } catch (err) {
    console.error('/sheet failed:', err);
    const msg = err.message?.startsWith('GitHub')
      ? 'GitHub is unreachable right now — try again in a moment.'
      : 'Something went wrong. Check the bot logs.';
    await interaction.editReply({ content: msg });
  }
}
