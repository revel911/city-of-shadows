import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveCharacterFromList } from '../handlers/read-utils.js';

const players = [
  { id: 'chris-caustes', name: 'Chris Caustes' },
  { id: 'johan-van-axel', name: 'Johan van Axel' },
];

test('arg matches by id', () => {
  const result = resolveCharacterFromList('chris-caustes', 'someone-else', players);
  assert.equal(result?.id, 'chris-caustes');
});

test('arg matches by name case-insensitive', () => {
  const result = resolveCharacterFromList('CHRIS CAUSTES', 'someone-else', players);
  assert.equal(result?.id, 'chris-caustes');
});

test('no arg falls back to discord username match', () => {
  const result = resolveCharacterFromList(null, 'Chris Caustes', players);
  assert.equal(result?.id, 'chris-caustes');
});

test('no arg, no username match returns null', () => {
  const result = resolveCharacterFromList(null, 'nobody', players);
  assert.equal(result, null);
});

test('arg with no match returns null', () => {
  const result = resolveCharacterFromList('made-up-id', 'whoever', players);
  assert.equal(result, null);
});
