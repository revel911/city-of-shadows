import { SlashCommandBuilder } from 'discord.js';
import { readProfile, writeProfile } from '../handlers/profile.js';

const REPO_ROOT = process.env.COS_REPO_ROOT || process.cwd();

export const data = new SlashCommandBuilder()
  .setName('prefs')
  .setDescription('View or update your player preferences (safety, mechanics depth)')
  .addSubcommand((sc) =>
    sc.setName('view').setDescription('DM your current profile')
  )
  .addSubcommand((sc) =>
    sc
      .setName('mechanics')
      .setDescription('Set mechanics depth (1 = surface most, 5 = hide most)')
      .addIntegerOption((o) =>
        o
          .setName('level')
          .setDescription('1 through 5')
          .setRequired(true)
          .setMinValue(1)
          .setMaxValue(5)
      )
  )
  .addSubcommand((sc) =>
    sc.setName('safety').setDescription('Instructions for editing hard/soft limits')
  );

export async function execute(interaction) {
  const sub = interaction.options.getSubcommand();
  const discordId = interaction.user.id;
  const profile = readProfile(REPO_ROOT, discordId);

  if (!profile) {
    await interaction.reply({
      content:
        "You don't have a player profile yet. Start a session in your private thread and the MC will run player-onboarding.",
      ephemeral: true,
    });
    return;
  }

  if (sub === 'view') {
    const text =
      `**Your profile**\n` +
      `**Hard limits:** ${profile.safety.hard_limits.join('; ') || '(none)'}\n` +
      `**Soft limits:** ${profile.safety.soft_limits.join('; ') || '(none)'}\n` +
      `**Mechanics depth:** ${profile.mechanics_depth} (1 = surface most, 5 = hide most)\n` +
      `**Characters:** ${profile.characters.join(', ') || '(none yet)'}`;
    try {
      await interaction.user.send(text);
      await interaction.reply({ content: 'Sent to your DMs.', ephemeral: true });
    } catch (err) {
      // DMs disabled — fall back to ephemeral reply
      await interaction.reply({ content: text, ephemeral: true });
    }
    return;
  }

  if (sub === 'mechanics') {
    const level = interaction.options.getInteger('level');
    profile.mechanics_depth = level;
    profile.mechanics_depth_set = true;
    writeProfile(REPO_ROOT, profile);
    await interaction.reply({
      content: `Mechanics depth set to **${level}**. (1 = surface most mechanics; 5 = hide most.)`,
      ephemeral: true,
    });
    return;
  }

  if (sub === 'safety') {
    const text =
      `Your current safety limits:\n` +
      `**Hard limits:** ${profile.safety.hard_limits.join('; ') || '(none)'}\n` +
      `**Soft limits:** ${profile.safety.soft_limits.join('; ') || '(none)'}\n\n` +
      `**v1 note:** Rich DM-driven editing is not implemented yet. To change limits, ` +
      `either tell the MC in your next session (during the carryover-confirm beat at character creation) ` +
      `or edit \`players/by-id/${profile.discord_id}/profile.json\` directly in the repo.`;
    try {
      await interaction.user.send(text);
      await interaction.reply({ content: 'Check your DMs.', ephemeral: true });
    } catch (err) {
      await interaction.reply({ content: text, ephemeral: true });
    }
    return;
  }
}
