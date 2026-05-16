import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshCharacterState, applyPatch } from '../handlers/session.js';

const REQUIRED_FIELDS = [
  'character_id', 'character_name', 'playbook', 'wod_extension',
  'stats', 'harm', 'corrupt', 'xp', 'advances',
  'circle_ratings', 'circle_status',
  'gear', 'active_arc_ids', 'last_session', 'notes',
];

test('freshCharacterState: returns full schema with id wired in', () => {
  const s = freshCharacterState('jacob-rivers');
  for (const k of REQUIRED_FIELDS) assert.ok(k in s, `missing field: ${k}`);
  assert.equal(s.character_id, 'jacob-rivers');
  assert.deepEqual(s.stats, { Blood: 0, Heart: 0, Mind: 0, Spirit: 0 });
  assert.deepEqual(s.circle_ratings, { Mortalis: 0, Night: 0, Power: 0, Wild: 0 });
  assert.deepEqual(s.circle_status,  { Mortalis: 0, Night: 0, Power: 0, Wild: 0 });
  assert.equal(s.last_session, 'session_000');
});

test('applyPatch over empty patch keeps full schema (the original bug)', () => {
  const persisted = applyPatch(freshCharacterState('jacob-rivers'), {});
  for (const k of REQUIRED_FIELDS) assert.ok(k in persisted, `lost field: ${k}`);
});

test('applyPatch: sparse MC patch (only stats + name) still leaves circles, harm, xp populated', () => {
  // Reproduction of the original bug: MC sends a minimal state_patch and we
  // need to confirm the persisted state.json still has every field.
  const patch = {
    character_name: 'Jacob Rivers',
    stats: { Blood: 2, Heart: 2, Mind: 1, Spirit: 0 },
  };
  const persisted = applyPatch(freshCharacterState('jacob-rivers'), patch);

  assert.equal(persisted.character_name, 'Jacob Rivers');
  assert.deepEqual(persisted.stats, { Blood: 2, Heart: 2, Mind: 1, Spirit: 0 });
  assert.deepEqual(persisted.circle_ratings, { Mortalis: 0, Night: 0, Power: 0, Wild: 0 });
  assert.deepEqual(persisted.circle_status,  { Mortalis: 0, Night: 0, Power: 0, Wild: 0 });
  assert.equal(persisted.harm, 0);
  assert.equal(persisted.corrupt, 0);
  assert.equal(persisted.xp, 0);
  assert.equal(persisted.advances, 0);
  assert.deepEqual(persisted.gear, []);
  assert.deepEqual(persisted.active_arc_ids, []);
  assert.equal(persisted.last_session, 'session_000');
  assert.equal(persisted.notes, '');
});

test('applyPatch: partial stats patch merges one level deep, does not blow away other stats', () => {
  const persisted = applyPatch(freshCharacterState('x'), { stats: { Mind: 3 } });
  assert.deepEqual(persisted.stats, { Blood: 0, Heart: 0, Mind: 3, Spirit: 0 });
});

test('applyPatch: scalar fields replace; arrays replace whole', () => {
  const persisted = applyPatch(freshCharacterState('x'), {
    harm: 2,
    gear: ['knife', 'lighter'],
  });
  assert.equal(persisted.harm, 2);
  assert.deepEqual(persisted.gear, ['knife', 'lighter']);
});
