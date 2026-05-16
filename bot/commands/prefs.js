import { SlashCommandBuilder } from 'discord.js';
import { readProfile, updateProfile } from '../handlers/profile.js';

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

// Field accessors are defensive: a hand-edited profile.json (the `/prefs safety`
// help text explicitly tells players this is a valid way to edit) may be missing
// some fields. Don't crash the slash command on that.
function hardLimits(profile) {
  return Array.isArray(profile?.safety?.hard_limits) ? profile.safety.hard_limits : [];
}
function softLimits(profile) {
  return Array.isArray(profile?.safety?.soft_limits) ? profile.safety.soft_limits : [];
}
function characters(profile) {
  return Array.isArray(profile?.characters) ? profile.characters : [];
}
function mechanicsDepth(profile) {
  const n = profile?.mechanics_depth;
  return typeof n === 'number' && n >= 1 && n <= 5 ? n : 3;
}

export async function execute(interaction) {
  const sub = interaction.options.getSubcommand();
  const discordId = interaction.user.id;
  const profile = await readProfile(discordId);

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
      `**Hard limits:** ${hardLimits(profile).join('; ') || '(none)'}\n` +
      `**Soft limits:** ${softLimits(profile).join('; ') || '(none)'}\n` +
      `**Mechanics depth:** ${mechanicsDepth(profile)} (1 = surface most, 5 = hide most)\n` +
      `**Characters:** ${characters(profile).join(', ') || '(none yet)'}`;
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
    // RMW so a concurrent close-session profile_patch or onboarding write
    // doesn't get clobbered by this update.
    try {
      await updateProfile(
        discordId,
        (current) => {
          if (!current) return null;
          return { ...current, mechanics_depth: level, mechanics_depth_set: true };
        },
        `[/prefs] set mechanics_depth=${level} for ${discordId}`
      );
    } catch (err) {
      console.error(`[/prefs] failed to set mechanics_depth for ${discordId}: ${err.message}`);
      await interaction.reply({
        content: `Couldn't save your preference right now: ${err.message}`,
        ephemeral: true,
      });
      return;
    }
    await interaction.reply({
      content: `Mechanics depth set to **${level}**. (1 = surface most mechanics; 5 = hide most.)`,
      ephemeral: true,
    });
    return;
  }

  if (sub === 'safety') {
    const text =
      `Your current safety limits:\n` +
      `**Hard limits:** ${hardLimits(profile).join('; ') || '(none)'}\n` +
      `**Soft limits:** ${softLimits(profile).join('; ') || '(none)'}\n\n` +
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
