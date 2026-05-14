import { SlashCommandBuilder } from 'discord.js';
import { readJSON, listPlayers } from '../handlers/github.js';
import { formatArc, sendChunked } from '../handlers/read-utils.js';

export const data = new SlashCommandBuilder()
  .setName('arcs')
  .setDescription('List active arcs (or filter by status).')
  .addStringOption(o => o
    .setName('status')
    .setDescription('Filter by status (default: active).')
    .addChoices(
      { name: 'active',     value: 'active' },
      { name: 'escalating', value: 'escalating' },
      { name: 'resolved',   value: 'resolved' },
      { name: 'all',        value: 'all' },
    )
    .setRequired(false));

export async function execute(interaction) {
  await interaction.deferReply();
  try {
    const status = interaction.options.getString('status') ?? 'active';

    const [arcsDoc, npcsDoc, hubsIndex, playersIndex] = await Promise.all([
      readJSON('game/arcs.json'),
      readJSON('game/npcs.json'),
      readJSON('hubs/index.json'),
      listPlayers(),
    ]);

    const all = arcsDoc?.arcs || [];
    const filtered = status === 'all' ? all : all.filter(a => a.status === status);

    if (filtered.length === 0) {
      await interaction.editReply(`No arcs with status "${status}".`);
      return;
    }

    const npcsById = Object.fromEntries((npcsDoc?.npcs || []).map(n => [n.id, n]));
    const body = filtered
      .map(a => formatArc(a, hubsIndex || [], npcsById, playersIndex || []))
      .join('\n\n');

    await sendChunked(interaction, body);
  } catch (err) {
    console.error('/arcs failed:', err);
    const msg = err.message?.startsWith('GitHub')
      ? 'GitHub is unreachable right now — try again in a moment.'
      : 'Something went wrong. Check the bot logs.';
    await interaction.editReply({ content: msg });
  }
}
