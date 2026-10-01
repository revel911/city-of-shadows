import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { budgetLimit, dialogueWeight, talkativeness, turnBudget } from '../handlers/npc-personality.js';
import { findScenePresentNpcs } from '../handlers/world-state.js';
import { creationTurnLimit, playerFacingTurnLimit, responseSafetyProblems, sceneLength } from '../handlers/session.js';
import { buildSceneDirectorContext, typicalNarrationRange } from '../handlers/scene-director.js';

const npcs = JSON.parse(readFileSync(new URL('../../game/npcs.json', import.meta.url), 'utf8')).npcs;

test('Y is verbosity + order + humor', () => {
  assert.equal(dialogueWeight({ verbosity: 1, order: 1, humor_frequency: 1 }), 3);
  assert.equal(dialogueWeight({ verbosity: 5, order: 5, humor_frequency: 5 }), 15);
});

test('the turn ceiling is 100 + 150Y, split between narration and dialogue', () => {
  assert.deepEqual(turnBudget(3), { total: 550, dialogue: 183, narration: 367 });
  assert.deepEqual(turnBudget(6), { total: 1000, dialogue: 500, narration: 500 });
  assert.deepEqual(turnBudget(15), { total: 2350, dialogue: 1679, narration: 671 });
  for (let weight = 3; weight <= 15; weight += 1) {
    const budget = turnBudget(weight);
    assert.equal(budget.dialogue + budget.narration, budget.total);
  }
  assert.ok(turnBudget(10).dialogue > turnBudget(6).dialogue);
});

test('the usual narration band sits well under the narration budget', () => {
  const [low, high] = typicalNarrationRange('x'.repeat(200), 600);
  assert.ok(low < high && high < 600);
  const [, shortHigh] = typicalNarrationRange('We wait', 600);
  assert.ok(shortHigh < high);
});

test('shared first names resolve to the NPC already met this session', () => {
  const text = 'Tommy looks at Jacob. Waiting.';
  assert.deepEqual(findScenePresentNpcs(text, npcs).map(npc => npc.id), []);
  assert.deepEqual(findScenePresentNpcs(text, npcs, ['npc_tommy_greer']).map(npc => npc.id), ['npc_tommy_greer']);
});

test('the chattiest present NPC sets the budget, and a long last reply steers shorter', () => {
  const session = { npcCatalog: npcs, hydratedNpcIds: new Set(['npc_tommy_greer']) };
  const scene = sceneLength(session, 'Dara Shin watches Tommy.', 'short');
  assert.deepEqual(scene.npcVoices.map(v => v.name), ['Tommy Greer', 'Dara Shin']);
  assert.deepEqual(scene.budget, turnBudget(10));
  assert.equal(scene.lastRanLong, false);
  assert.equal(sceneLength(session, 'Dara Shin watches Tommy.', 'x'.repeat(1300)).lastRanLong, true);
  assert.equal(talkativeness(6), 'measured');
});

test('scene director describes speakers without showing the dialogue ceiling', () => {
  const text = buildSceneDirectorContext({
    playerText: 'We wait',
    length: { budget: turnBudget(10), npcVoices: [{ name: 'Tommy Greer', talk: 'talkative' }, { name: 'Dara Shin', talk: 'measured' }], lastRanLong: true },
  });
  assert.match(text, /Tommy Greer \(talkative\); Dara Shin \(measured\)/);
  assert.match(text, /never over 600/);
  assert.match(text, /The last reply ran long/);
  assert.doesNotMatch(text, /1000|1600/);
});

test('narration and dialogue are enforced separately with slack', () => {
  const budget = turnBudget(10);
  const narrationCap = playerFacingTurnLimit('We wait', '', budget);
  assert.equal(narrationCap, budgetLimit(600));
  const speech = `He shrugs. "${'y'.repeat(1000)}"`;
  assert.ok(!responseSafetyProblems(speech, { maxVisibleChars: narrationCap, maxDialogueChars: budgetLimit(budget.dialogue) }).some(p => p.includes('exceeds')));
  assert.ok(responseSafetyProblems(`"${'y'.repeat(1200)}"`, { maxVisibleChars: narrationCap, maxDialogueChars: budgetLimit(budget.dialogue) }).includes('dialogue exceeds 1100 characters'));
});

test('character creation keeps whole-reply limits', () => {
  assert.equal(creationTurnLimit('Witch'), 900);
  assert.equal(creationTurnLimit('x'.repeat(121)), 1400);
  assert.ok(!responseSafetyProblems('x'.repeat(1300), { maxVisibleChars: 1400, wholeTurn: true }).some(p => p.includes('exceeds')));
});
