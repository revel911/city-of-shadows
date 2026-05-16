import { test } from 'node:test';
import assert from 'node:assert/strict';
import { profilePath, readProfile, writeProfile } from '../handlers/profile.js';

test('profilePath builds the GitHub-relative path for a snowflake', () => {
  assert.equal(
    profilePath('123456789012345678'),
    'players/by-id/123456789012345678/profile.json'
  );
});

test('profilePath coerces non-string discord ids', () => {
  assert.equal(profilePath(42), 'players/by-id/42/profile.json');
});

test('writeProfile rejects a profile missing discord_id', async () => {
  await assert.rejects(
    () => writeProfile({ safety: { hard_limits: [], soft_limits: [] } }, 'msg'),
    /discord_id/
  );
});

test('writeProfile rejects when the commit message is missing', async () => {
  await assert.rejects(
    () => writeProfile({ discord_id: '123' }),
    /commit message/
  );
});

test('readProfile is async (returns a Promise)', () => {
  // Round-trip read goes to the GitHub Contents API; integration-only.
  // Smoke-test the shape: callable, returns a thenable. Swallow the rejection —
  // without env vars set the promise rejects, and that's fine for this assertion.
  const r = readProfile('123');
  assert.ok(r && typeof r.then === 'function');
  r.catch(() => {});
});
