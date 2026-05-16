import { test } from 'node:test';
import assert from 'node:assert/strict';
import { missingNewCharCloseFields } from '../handlers/session.js';

function completeClose() {
  return {
    character_id: 'jacob-brooks',
    sheet: '# Jacob Brooks — Character Sheet\n\nStuff',
    state_patch: JSON.stringify({
      character_name: 'Jacob Brooks',
      stats: { Blood: 1, Heart: 0, Mind: -1, Spirit: 2 },
      harm: 0, xp: 0,
    }),
    handoff: '## HANDOFF',
  };
}

test('complete close returns no missing fields', () => {
  assert.deepEqual(missingNewCharCloseFields(completeClose()), []);
});

test('missing character_id is flagged', () => {
  const c = completeClose();
  c.character_id = null;
  assert.deepEqual(missingNewCharCloseFields(c), ['character_id']);
});

test('character_id of "__new__" is treated as missing', () => {
  const c = completeClose();
  c.character_id = '__new__';
  assert.deepEqual(missingNewCharCloseFields(c), ['character_id']);
});

test('whitespace-only character_id is flagged', () => {
  const c = completeClose();
  c.character_id = '   ';
  assert.deepEqual(missingNewCharCloseFields(c), ['character_id']);
});

test('missing sheet is flagged', () => {
  const c = completeClose();
  c.sheet = null;
  assert.deepEqual(missingNewCharCloseFields(c), ['sheet']);
});

test('whitespace-only sheet is flagged', () => {
  const c = completeClose();
  c.sheet = '   \n\n  ';
  assert.deepEqual(missingNewCharCloseFields(c), ['sheet']);
});

test('missing state_patch is flagged', () => {
  const c = completeClose();
  c.state_patch = null;
  assert.deepEqual(missingNewCharCloseFields(c), ['state_patch (with stats)']);
});

test('state_patch without stats is flagged (the Jacob Brooks failure mode)', () => {
  const c = completeClose();
  c.state_patch = JSON.stringify({ last_session: 'session_001', notes: 'foo' });
  assert.deepEqual(missingNewCharCloseFields(c), ['state_patch (with stats)']);
});

test('state_patch with empty stats object is flagged', () => {
  const c = completeClose();
  c.state_patch = JSON.stringify({ stats: {} });
  assert.deepEqual(missingNewCharCloseFields(c), ['state_patch (with stats)']);
});

test('unparseable state_patch is flagged', () => {
  const c = completeClose();
  c.state_patch = '{ this is not json';
  assert.deepEqual(missingNewCharCloseFields(c), ['state_patch (with stats)']);
});

test('multiple missing fields are all reported', () => {
  const c = { handoff: 'just a handoff', character_id: null, sheet: null, state_patch: null };
  assert.deepEqual(
    missingNewCharCloseFields(c),
    ['character_id', 'sheet', 'state_patch (with stats)']
  );
});
