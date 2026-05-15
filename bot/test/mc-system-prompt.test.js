import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile as fsReadFile } from 'node:fs/promises';

test('loadSystemPrompt reads the canonical new-layout paths', async () => {
  const src = await fsReadFile(new URL('../handlers/mc.js', import.meta.url), 'utf8');

  const expectedPaths = [
    'mc-reference/mc-instructions.md',
    'mc-reference/reference/rules.md',
    'mc-reference/reference/basic-moves.md',
    'mc-reference/reference/mc-moves.md',
    'mc-reference/reference/playbooks.md',
    'mc-reference/reference/world-of-darkness/changeling.md',
    'mc-reference/reference/world-of-darkness/demon.md',
    'mc-reference/reference/world-of-darkness/hunter.md',
    'mc-reference/reference/world-of-darkness/mage.md',
    'mc-reference/reference/world-of-darkness/orpheus.md',
    'mc-reference/reference/world-of-darkness/slasher.md',
    'mc-reference/reference/world-of-darkness/vampire.md',
    'mc-reference/reference/world-of-darkness/werewolf.md',
    'mc-reference/character-creation.md',
    'mc-reference/npc-personality-engine.md',
    'mc-reference/state-schema.md',
    'mc-reference/bot-output-format.md',
  ];

  for (const path of expectedPaths) {
    assert.ok(
      src.includes(`'${path}'`),
      `mc.js does not reference path: ${path}`
    );
  }
});

test('loadSystemPrompt does not reference removed paths', async () => {
  const src = await fsReadFile(new URL('../handlers/mc.js', import.meta.url), 'utf8');

  const removed = [
    'mc-reference/rules-reference.md',
    'mc-reference/wod-supplement.md',
  ];

  for (const path of removed) {
    assert.ok(
      !src.includes(`'${path}'`),
      `mc.js still references removed path: ${path}`
    );
  }
});
