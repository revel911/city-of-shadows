import { SlashCommandBuilder } from 'discord.js';
import { readFile, readJSON } from '../handlers/github.js';
import { sendChunked } from '../handlers/read-utils.js';

export const data = new SlashCommandBuilder()
  .setName('hub')
  .setDescription('Show the doc for a hub.')
  .addStringOption(o => o
    .setName('name')
    .setDescription('Hub id or name (e.g. "shockoe bottom").')
    .setRequired(true));

export async function execute(interaction) {
  await interaction.deferReply();
  try {
    const query = interaction.options.getString('name').trim();
    const index = await readJSON('hubs/index.json');
    if (!Array.isArray(index)) {
      await interaction.editReply('Hub index missing or malformed.');
      return;
    }
    const hub = findHub(index, query);
    if (!hub) {
      const names = index.map(h => h.name).join(', ');
      await interaction.editReply(`No hub matches "${query}". Known hubs: ${names}`);
      return;
    }
    const content = await readFile(`hubs/${hub.file}`);
    if (!content) {
      await interaction.editReply(`Hub doc for **${hub.name}** is missing on GitHub.`);
      return;
    }
    await sendChunked(interaction, content);
  } catch (err) {
    console.error('/hub failed:', err);
    const msg = err.message?.startsWith('GitHub')
      ? 'GitHub is unreachable right now — try again in a moment.'
      : 'Something went wrong. Check the bot logs.';
    await interaction.editReply({ content: msg });
  }
}

function findHub(index, query) {
  const q = query.toLowerCase();
  const slug = q.replace(/\s+/g, '-');
  return index.find(h => h.id === query)
    || index.find(h => h.name.toLowerCase() === q)
    || index.find(h => h.id.toLowerCase().endsWith(`_${slug}`) || h.id.toLowerCase().endsWith(`-${slug}`))
    || null;
}
