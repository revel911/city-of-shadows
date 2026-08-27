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
  assert.match(engine, /deadline, expiring opportunity, scheduled meeting/i);
  assert.match(engine, /current in-fiction time/i);
});

test('top-level Discord handlers never expose raw exception messages to players', async () => {
  const index = await readFile(new URL('../index.js', import.meta.url), 'utf8');
  assert.doesNotMatch(index, /content:\s*`Error:\s*\$\{err\.message\}/);
  assert.doesNotMatch(index, /channel\.send\(`[^`]*\$\{err\.message\}/);
});

test('returning-character openings recap personal continuity before play', async () => {
  const mc = await readFile(new URL('../handlers/mc.js', import.meta.url), 'utf8');
  assert.match(mc, /Previously in City of Shadows/);
  assert.match(mc, /one or two short paragraphs \(700 characters maximum combined\)/i);
  assert.match(mc, /present state of mind/i);
  assert.match(mc, /current or last-known location/i);
  assert.match(mc, /most recent meaningful NPC interactions/i);
  assert.match(mc, /character-specific NPC memory/i);
  assert.match(mc, /Do not invent missing history, emotions, locations, or meetings/i);
  assert.match(mc, /Do not infer that a canonical NPC employs, funds, contacts, trains, or knows this character/i);
  assert.match(mc, /verify its timeline and object state/i);
  assert.match(mc, /continue at the immediate playable moment/i);

  const session = await readFile(new URL('../handlers/session.js', import.meta.url), 'utf8');
  assert.match(session, /Preserve the required \*\*Previously in City of Shadows/);
});

test('character creation uses a consistent guided flow and canonical save', async () => {
  const creation = await readFile(new URL('../../mc-reference/character-creation.md', import.meta.url), 'utf8');
  assert.match(creation, /Character Creation - Phase X\/12: Name/);
  assert.match(creation, /one primary decision per reply/i);
  assert.match(creation, /Confirm newly locked choices/i);
  assert.match(creation, /compact final preview/i);
  assert.match(creation, /every remaining TBD/i);
  assert.match(creation, /Do not add new facts during serialization/i);
  assert.match(creation, /question or out-of-character comment is not a character choice/i);
  assert.match(creation, /Never recommend \*\*Slasher\*\* merely because the playbook is Mortalis/i);
  assert.match(creation, /Never reuse an existing NPC name for a new role/i);
  assert.match(creation, /must not overwrite its established controller, owner, role, or history/i);

  const session = await readFile(new URL('../handlers/session.js', import.meta.url), 'utf8');
  assert.match(session, /characterSheetProblems\(save\.sheet\)/);
  assert.match(session, /characterSheetProblems\(close\.sheet\)/);
});

test('opt-in narrator eval fixtures cover mechanics and both ends of NPC Violence', async () => {
  const instructions = await readFile(new URL('../../mc-reference/mc-instructions.md', import.meta.url), 'utf8');
  assert.match(instructions, /casual, plainspoken, and natural/i);
  assert.match(instructions, /Never use an em dash in player-facing narration or dialogue/i);
  assert.match(instructions, /canonical background, personality scores, or voice note/i);
  assert.match(instructions, /not the narrator's default voice/i);

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
