import { SlashCommandBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('roll')
  .setDescription('Roll 2d6. The left die is the Instinct Die. MC applies the modifier.');

export async function execute(interaction) {
  const d6 = () => 1 + Math.floor(Math.random() * 6);
  const instinct = d6();
  const other = d6();
  const total = instinct + other;
  await interaction.reply(
    `🎲  **${instinct}** (Instinct)  **${other}**  →  raw total **${total}**\n` +
    `${interaction.user} rolled — MC applies the stat modifier.`
  );
}
