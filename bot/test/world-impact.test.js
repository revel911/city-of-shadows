import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseWorldImpact, prependPublicEvent, validateWorldImpact } from '../handlers/session.js';

test('shared world impact requires a matching shared patch', () => {
  const close = { world_impact: JSON.stringify({ level: 'shared', summary: 'The city noticed.', affected_ids: ['arc-001'] }) };
  assert.equal(validateWorldImpact(close).length, 1);
  close.arc_patch = '[]';
  assert.deepEqual(validateWorldImpact(close), []);
  assert.equal(parseWorldImpact(close).level, 'shared');
});

test('new public events are inserted newest-first', () => {
  const current = '# Events\n\n## Old\nOld event.\n';
  assert.equal(prependPublicEvent(current, '## New\nNew event.'), '# Events\n\n## New\nNew event.\n\n## Old\nOld event.\n');
});
