import { SlashCommandBuilder } from 'discord.js';
import { resolveSessionRoll } from '../handlers/session.js';

export const data = new SlashCommandBuilder()
  .setName('roll')
  .setDescription('Resolve the move the MC requested using your canonical character state.');

export async function execute(interaction) {
  await resolveSessionRoll(interaction);
}
