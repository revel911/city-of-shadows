import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  playerFacingTurnLimit,
  pendingRollGuard,
  proseQualityProblems,
  recoverPendingRoll,
  responseSafetyProblems,
} from '../handlers/session.js';

test('accepts a concise player-facing opening', () => {
  const response = 'Rain ticks against the warehouse windows.\n\nSomeone knocks three times. What do you do?';
  assert.deepEqual(responseSafetyProblems(response, { opening: true }), []);
});

test('rejects internal thinking tags even when they are unclosed', () => {
  const response = '1. <thinking>I need to decide what the player sees next.\n2. Draft an opener.';
  assert.ok(responseSafetyProblems(response, { opening: true }).includes('internal thinking tag'));
});

test('rejects oversized opening scenes before Discord posting', () => {
  const response = 'x'.repeat(1401);
  assert.ok(responseSafetyProblems(response, { opening: true }).includes('opening exceeds 1400 characters'));
});

test('rejects known internal planning markers on every turn', () => {
  assert.ok(responseSafetyProblems('THOUGHTS APPLIED, now draft it.').includes('internal planning marker'));
});

test('normal player-facing turns have a hard visible length limit', () => {
  assert.ok(responseSafetyProblems('x'.repeat(1401)).includes('visible turn exceeds 1400 characters'));
});

test('short player input receives the stricter turn limit', () => {
  assert.equal(playerFacingTurnLimit('I open the door.'), 900);
  assert.equal(playerFacingTurnLimit('x'.repeat(121)), 1400);
});

test('short OOC character recap receives the dedicated recap allowance', () => {
  const original = 'OOO … it’s been awhile since I played Jacob, tell me a little about him';
  assert.equal(playerFacingTurnLimit(original), 1800);
  assert.equal(playerFacingTurnLimit('Break it up', original), 1800);
});

test('rejects the leaked system preference observation from the reported incident', () => {
  const leaked = '--- SYSTEM PREFERENCE OBSERVATION locked: player asking for mechanism/vibe difference — DO NOT prompt decision';
  assert.ok(responseSafetyProblems(leaked).includes('internal planning marker'));
  assert.ok(responseSafetyProblems('[SYSTEM — SILENT SCENE DIRECTOR]\nCurrent mode: social.').includes('internal planning marker'));
});

test('ordinary prose using the word system is not treated as an internal marker', () => {
  assert.deepEqual(responseSafetyProblems('The city transit system stops running at midnight.'), []);
});

test('machine-only close data does not count against the visible turn limit', () => {
  const response = [
    'The rain stops. What do you do?',
    '<close_session>',
    '<character_id>jacob-boone</character_id>',
    `<handoff>${'x'.repeat(3000)}</handoff>`,
    '</close_session>',
  ].join('\n');
  assert.deepEqual(responseSafetyProblems(response), []);
});

test('rejects repeated words and contradictory physical details', () => {
  assert.ok(proseQualityProblems('They, they know the way inside.').includes('accidental adjacent word repetition'));
  assert.ok(proseQualityProblems(
    'The windows are up. You circle the truck and reach through the open window.'
  ).includes('contradictory window state'));
});

test('rejects plainly broken pronoun clauses while allowing clean prose', () => {
  assert.ok(proseQualityProblems('He is his right and they are they waiting.').includes('broken pronoun clause'));
  assert.deepEqual(proseQualityProblems(
    'You reach the truck’s blind side. The driver shifts before you touch the door.'
  ), []);
});

test('/roll recovery restores an obvious missed move but does not invent one', () => {
  const session = {
    pendingRoll: null,
    lastPlayerText: 'I sneak behind the truck and then pull him out to question him.',
  };
  assert.equal(recoverPendingRoll(session)?.move, 'Turn to Violence');
  assert.equal(session.pendingRoll.modifier_key, 'Blood');

  const quietSession = { pendingRoll: null, lastPlayerText: 'I watch the truck and wait.' };
  assert.equal(recoverPendingRoll(quietSession), null);
  assert.equal(quietSession.pendingRoll, null);
});

test('pending move blocks narrative bypass while allowing explicit cancellation', () => {
  const visibleSession = {
    mechanicsDepth: 2,
    pendingRoll: { move: 'Keep Your Cool' },
  };
  assert.match(pendingRollGuard(visibleSession, 'I pull the rope again.'), /Keep Your Cool/);
  assert.ok(visibleSession.pendingRoll);

  const hiddenSession = {
    mechanicsDepth: 5,
    pendingRoll: { move: 'Turn to Violence' },
  };
  assert.doesNotMatch(pendingRollGuard(hiddenSession, 'What happens?'), /Turn to Violence/);

  assert.match(pendingRollGuard(visibleSession, 'cancel that'), /canceled/i);
  assert.equal(visibleSession.pendingRoll, null);
  assert.equal(visibleSession.turnsWithoutRoll, 0);
  assert.equal(pendingRollGuard(visibleSession, 'I leave.'), null);
});
