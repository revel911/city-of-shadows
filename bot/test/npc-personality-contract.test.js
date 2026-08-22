import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');

test('all narrator personality instructions agree on the Violence scale', async () => {
  const [engine, instructions] = await Promise.all([
    read('mc-reference/npc-personality-engine.md'),
    read('mc-reference/mc-instructions.md'),
  ]);
  const combined = `${engine}\n${instructions}`;

  assert.match(combined, /violence-first at the low end and violence-averse at the high end/i);
  assert.match(instructions, /violence: 1_violence_first_to_5_violence_averse/);
  assert.match(instructions, /Violence ≤ 2/);
  assert.doesNotMatch(combined, /1_peaceful_to_5_violent/i);
  assert.doesNotMatch(combined, /Violence ≥ 4/);
});

test('the personality engine is part of the core prompt for every session', async () => {
  const source = await read('bot/handlers/mc.js');
  const coreStart = source.indexOf('async function loadCoreSystemPrompt()');
  const referenceStart = source.indexOf('async function loadReferencePack');
  const coreLoader = source.slice(coreStart, referenceStart);

  assert.match(coreLoader, /mc-reference\/npc-personality-engine\.md/);
});
