import { SlashCommandBuilder } from 'discord.js';
import { readJSON } from '../handlers/github.js';
import { formatNpc, sendChunked } from '../handlers/read-utils.js';

export const data = new SlashCommandBuilder()
  .setName('npc')
  .setDescription('Look up an NPC.')
  .addStringOption(o => o
    .setName('name')
    .setDescription('NPC id or name (substring OK).')
    .setRequired(true));

export async function execute(interaction) {
  await interaction.deferReply();
  try {
    const query = interaction.options.getString('name').trim();
    const doc = await readJSON('game/npcs.json');
    const list = doc?.npcs || [];
    const matches = findNpcs(list, query);
    if (matches.length === 0) {
      await interaction.editReply(`No NPC matches "${query}".`);
      return;
    }
    if (matches.length > 1) {
      const names = matches.slice(0, 10).map(n => `• ${n.name}`).join('\n');
      await interaction.editReply(`Multiple NPCs match "${query}":\n${names}\nBe more specific.`);
      return;
    }
    await sendChunked(interaction, formatNpc(matches[0]));
  } catch (err) {
    console.error('/npc failed:', err);
    const msg = err.message?.startsWith('GitHub')
      ? 'GitHub is unreachable right now — try again in a moment.'
      : 'Something went wrong. Check the bot logs.';
    await interaction.editReply({ content: msg });
  }
}

function findNpcs(list, query) {
  const q = query.toLowerCase();
  const byId = list.find(n => n.id === query);
  if (byId) return [byId];
  const byName = list.find(n => n.name.toLowerCase() === q);
  if (byName) return [byName];
  return list.filter(n => n.name.toLowerCase().includes(q));
}
