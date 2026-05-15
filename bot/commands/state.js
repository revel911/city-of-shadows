import { SlashCommandBuilder } from 'discord.js';
import { readJSON, listPlayers } from '../handlers/github.js';
import { resolveCharacterFromList, sendChunked } from '../handlers/read-utils.js';

export const data = new SlashCommandBuilder()
  .setName('state')
  .setDescription('Show a character state JSON.')
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
    let state;
    try {
      state = await readJSON(`players/${player.id}/state.json`);
    } catch (parseErr) {
      await interaction.editReply(`state.json for **${player.name}** is malformed: ${parseErr.message}`);
      return;
    }
    if (!state) {
      await interaction.editReply(`No state found for **${player.name}**.`);
      return;
    }
    const body = '```json\n' + JSON.stringify(state, null, 2) + '\n```';
    await sendChunked(interaction, body);
  } catch (err) {
    console.error('/state failed:', err);
    const msg = err.message?.startsWith('GitHub')
      ? 'GitHub is unreachable right now — try again in a moment.'
      : 'Something went wrong. Check the bot logs.';
    await interaction.editReply({ content: msg });
  }
}
