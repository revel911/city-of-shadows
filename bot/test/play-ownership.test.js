import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canPlayCharacter } from '../commands/play.js';

test('character owner, shared character, and operator can play', () => {
  assert.equal(canPlayCharacter({ id: 'pc', owner_id: '1' }, '1', ''), true);
  assert.equal(canPlayCharacter({ id: 'pc', owner_id: '1', shared: true }, '2', ''), true);
  assert.equal(canPlayCharacter({ id: 'pc', owner_id: '1' }, '2', '2,3'), true);
});

test('non-owner cannot play an owned character', () => {
  assert.equal(canPlayCharacter({ id: 'pc', owner_id: '1' }, '2', ''), false);
});
