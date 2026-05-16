import { readJSON, writeFile, updateJSON } from './github.js';

export function profilePath(discordId) {
  return `players/by-id/${String(discordId)}/profile.json`;
}

export async function readProfile(discordId) {
  return await readJSON(profilePath(discordId));
}

export async function writeProfile(profile, message) {
  if (!profile || typeof profile.discord_id !== 'string' || !profile.discord_id.trim()) {
    throw new Error('writeProfile: discord_id is required');
  }
  if (!message || typeof message !== 'string') {
    throw new Error('writeProfile: commit message is required');
  }
  const path = profilePath(profile.discord_id);
  const content = JSON.stringify(profile, null, 2) + '\n';
  return await writeFile(path, content, message);
}

// Read-modify-write helper. Use this for any mutation of an existing profile
// so concurrent writers merge against fresh state instead of clobbering each
// other (two open sessions for one player, or /prefs racing a close-session
// profile_patch). The transform receives the current profile (or null if the
// file doesn't exist yet) and must return the next profile — or return null /
// undefined to abort the write entirely (e.g., "the profile doesn't exist,
// don't create one here").
const ABORT = Symbol('updateProfile.abort');

export async function updateProfile(discordId, transform, message) {
  if (!message || typeof message !== 'string') {
    throw new Error('updateProfile: commit message is required');
  }
  let written = null;
  try {
    await updateJSON(profilePath(discordId), async (current) => {
      const next = await transform(current);
      if (next === null || next === undefined) throw ABORT;
      if (typeof next.discord_id !== 'string' || !next.discord_id.trim()) {
        throw new Error('updateProfile: transform must return a profile with discord_id');
      }
      written = next;
      return next;
    }, message);
  } catch (err) {
    if (err === ABORT) return null;
    throw err;
  }
  return written;
}
