import { test } from 'node:test';
import assert from 'node:assert/strict';
import { responseSafetyProblems } from '../handlers/session.js';

test('accepts a concise player-facing opening', () => {
  const response = 'Rain ticks against the warehouse windows.\n\nSomeone knocks three times. What do you do?';
  assert.deepEqual(responseSafetyProblems(response, { opening: true }), []);
});

test('rejects internal thinking tags even when they are unclosed', () => {
  const response = '1. <thinking>I need to decide what the player sees next.\n2. Draft an opener.';
  assert.ok(responseSafetyProblems(response, { opening: true }).includes('internal thinking tag'));
});

test('rejects oversized opening scenes before Discord posting', () => {
  const response = 'x'.repeat(1801);
  assert.ok(responseSafetyProblems(response, { opening: true }).includes('opening exceeds 1800 characters'));
});

test('rejects known internal planning markers on every turn', () => {
  assert.ok(responseSafetyProblems('THOUGHTS APPLIED, now draft it.').includes('internal planning marker'));
});
