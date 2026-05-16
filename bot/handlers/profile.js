import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';

export function profilePath(repoRoot, discordId) {
  return join(repoRoot, 'players', 'by-id', String(discordId), 'profile.json');
}

export function readProfile(repoRoot, discordId) {
  const p = profilePath(repoRoot, discordId);
  if (!existsSync(p)) return null;
  const raw = readFileSync(p, 'utf8');
  return JSON.parse(raw);
}

export function writeProfile(repoRoot, profile) {
  if (!profile || typeof profile.discord_id !== 'string' || !profile.discord_id.trim()) {
    throw new Error('writeProfile: discord_id is required');
  }
  const p = profilePath(repoRoot, profile.discord_id);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(profile, null, 2) + '\n', 'utf8');
}
