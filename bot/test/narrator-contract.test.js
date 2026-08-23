import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('mechanics contract assigns arithmetic and close invariants to the bot', async () => {
  const contract = await readFile(new URL('../../mc-reference/MECHANICS-CONTRACT.md', import.meta.url), 'utf8');
  assert.match(contract, /The bot owns dice/);
  assert.match(contract, /<roll_request>/);
  assert.match(contract, /increments `last_session` exactly once/);
  assert.match(contract, /game\/debts\.json/);
  assert.match(contract, /at most one pending cross-player interaction/i);
});

test('MC instructions do not import an unsupported XP-on-miss rule', async () => {
  const instructions = await readFile(new URL('../../mc-reference/mc-instructions.md', import.meta.url), 'utf8');
  assert.doesNotMatch(instructions, /mark_xp:\s*true/);
  assert.match(instructions, /bot_integrated_roll/);
  assert.match(instructions, /player still uses `\/roll`/);
});

test('output contract includes roll and Debt patches in machine-only blocks', async () => {
  const output = await readFile(new URL('../../mc-reference/bot-output-format.md', import.meta.url), 'utf8');
  assert.match(output, /<roll_request>/);
  assert.match(output, /<debt_patch>/);
  assert.match(output, /Do not emit bot-owned `last_session`/);
  assert.match(output, /<mystery_patch>/);
  assert.match(output, /<npc_memory_patch>/);
});

test('scene engine protects agency while varying action, mystery, urban fantasy, and romance', async () => {
  const engine = await readFile(new URL('../../mc-reference/scene-engine.md', import.meta.url), 'utf8');
  assert.match(engine, /player's current declared action always overrides history/i);
  assert.match(engine, /three independently discoverable clues/i);
  assert.match(engine, /weak roll or risky method adds cost/i);
  assert.match(engine, /contest of objectives/i);
  assert.match(engine, /recognizable city life/i);
  assert.match(engine, /consent as ongoing and reversible/i);
  assert.match(engine, /do not name or apply a playbook-specific intimacy move/i);
  assert.match(engine, /one universal personality and a separate relationship memory for each/i);
  assert.match(engine, /do not put formal Debts in memory/i);
});

test('opt-in narrator eval fixtures cover mechanics and both ends of NPC Violence', async () => {
  const raw = await readFile(new URL('../eval/narrator-scenarios.json', import.meta.url), 'utf8');
  const scenarios = JSON.parse(raw);
  assert.ok(scenarios.some(item => item.id.includes('move_trigger')));
  assert.ok(scenarios.some(item => item.id.includes('debt')));
  assert.ok(scenarios.some(item => item.id.includes('extreme_failure')));
  assert.ok(scenarios.some(item => item.id === 'violence_one_means_violence_first'));
  assert.ok(scenarios.some(item => item.id === 'violence_five_means_violence_averse'));
  assert.ok(scenarios.some(item => item.id === 'mystery_failure_preserves_core_clue'));
  assert.ok(scenarios.some(item => item.id === 'romance_history_is_not_consent'));
  assert.ok(scenarios.some(item => item.id === 'action_is_objective_driven'));
});
