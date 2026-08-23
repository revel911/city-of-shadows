import { test } from 'node:test';
import assert from 'node:assert/strict';
import { playerFacingTurnLimit, responseSafetyProblems } from '../handlers/session.js';

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
