import { SlashCommandBuilder } from 'discord.js';
import { readFile } from '../handlers/github.js';
import { parseRecentEvents, sendChunked } from '../handlers/read-utils.js';

export const data = new SlashCommandBuilder()
  .setName('events')
  .setDescription('Show the most recent public events.')
  .addIntegerOption(o => o
    .setName('n')
    .setDescription('How many entries (1–10, default 3).')
    .setMinValue(1)
    .setMaxValue(10)
    .setRequired(false));

export async function execute(interaction) {
  await interaction.deferReply();
  try {
    const n = interaction.options.getInteger('n') ?? 3;
    const md = await readFile('game/events-log.md');
    const sections = parseRecentEvents(md || '', n);
    if (sections.length === 0) {
      await interaction.editReply('No events logged yet.');
      return;
    }
    const body = sections.join('\n\n---\n\n');
    await sendChunked(interaction, body);
  } catch (err) {
    console.error('/events failed:', err);
    const msg = err.message?.startsWith('GitHub')
      ? 'GitHub is unreachable right now — try again in a moment.'
      : 'Something went wrong. Check the bot logs.';
    await interaction.editReply({ content: msg });
  }
}
