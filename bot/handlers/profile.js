import { readJSON, writeFile } from './github.js';

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
