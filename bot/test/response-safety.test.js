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

test('ordinary OOC questions get the bounded OOC response budget', () => {
  assert.equal(playerFacingTurnLimit('OOC: can we pause here?'), 1800);
  assert.equal(playerFacingTurnLimit('What does this move mean?'), 1800);
});

test('OOC replies cannot emit roll or persistence blocks', () => {
  const problems = responseSafetyProblems(
    'Sure.\n<roll_request><move>Keep Your Cool</move></roll_request>',
    { oocMode: true },
  );
  assert.ok(problems.includes('out-of-character response attempts to advance or persist state'));
  assert.deepEqual(responseSafetyProblems('Spirit measures willpower.', { oocMode: true }), []);
});

test('OOC replies must answer instead of echoing or returning another bare question', () => {
  const playerContent = 'What time is it now?';
  assert.ok(responseSafetyProblems(playerContent, {
    oocMode: true,
    playerContent,
  }).includes('out-of-character response merely repeats the player'));

  assert.ok(responseSafetyProblems('What time is it now in the game?', {
    oocMode: true,
    playerContent: 'Yes, in game?',
  }).includes('out-of-character response asks a question without answering'));

  assert.deepEqual(responseSafetyProblems(
    'The exact minute was not established. It is late evening, with roughly two hours before midnight.',
    { oocMode: true, playerContent },
  ), []);
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
  assert.ok(proseQualityProblems(
    'The envelope is gone. Be there before midnight if you want to see who picks it up.'
  ).includes('object is already gone but is also awaiting pickup'));
});

test('opening deadlines require current in-fiction time', () => {
  const missingTime = 'The courier leaves at midnight. Get there before midnight. What do you do?';
  assert.ok(responseSafetyProblems(missingTime, { opening: true })
    .includes('opening deadline lacks the current in-fiction time'));

  const usable = 'It is 10:15 PM. The courier leaves at midnight, so get there before midnight. What do you do?';
  assert.deepEqual(responseSafetyProblems(usable, { opening: true }), []);
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
  assert.match(pendingRollGuard(visibleSession, 'I pull the rope again.'), /regular 3, instinct 1/);
  assert.ok(visibleSession.pendingRoll);
  assert.equal(pendingRollGuard(
    visibleSession,
    'I rolled a 3, instinct dice was a 1'
  ), null);
  assert.equal(pendingRollGuard(visibleSession, 'I roll an 8'), null);
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
