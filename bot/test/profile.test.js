import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readProfile, writeProfile, profilePath } from '../handlers/profile.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('profilePath builds the correct path', () => {
  const root = '/tmp/repo';
  const p = profilePath(root, '123456789012345678');
  // Normalize separators for cross-platform compatibility
  assert.equal(p.replace(/\\/g, '/'), '/tmp/repo/players/by-id/123456789012345678/profile.json');
});

test('readProfile returns null when the file does not exist', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cos-'));
  try {
    const p = readProfile(dir, '123456789012345678');
    assert.equal(p, null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('writeProfile creates the directory and file; readProfile returns the parsed object', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cos-'));
  try {
    const profile = {
      discord_id: '123456789012345678',
      display_name: 'Tommy',
      safety: { hard_limits: [], soft_limits: [] },
      mechanics_depth: 3,
      mechanics_depth_set: false,
      characters: [],
    };
    writeProfile(dir, profile);
    const round = readProfile(dir, '123456789012345678');
    assert.deepEqual(round, profile);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('writeProfile rejects a profile missing discord_id', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cos-'));
  try {
    assert.throws(
      () => writeProfile(dir, { safety: { hard_limits: [], soft_limits: [] } }),
      /discord_id/
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
