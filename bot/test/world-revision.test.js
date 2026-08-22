import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyInteractionOperations, mergeCanonicalPatches } from '../handlers/world-state.js';

test('matching entity revision applies changes and increments revision', () => {
  const result = mergeCanonicalPatches(
    { npcs: [{ id: 'npc_ada', name: 'Ada', revision: 3, status: 'active' }] },
    [{ id: 'npc_ada', expected_revision: 3, changes: { status: 'gone' } }],
    { collection: 'npcs', idPrefix: 'npc_', sessionId: 'pc:session_2', stamp: '2026-08-22' }
  );
  assert.equal(result.doc.npcs[0].status, 'gone');
  assert.equal(result.doc.npcs[0].revision, 4);
  assert.deepEqual(result.conflicts, []);
});

test('stale scalar change becomes a conflict while additive IDs merge', () => {
  const result = mergeCanonicalPatches(
    { npcs: [{ id: 'npc_ada', name: 'Ada', revision: 4, status: 'gone', arc_ids: ['arc-001'] }] },
    [{ id: 'npc_ada', expected_revision: 3, changes: { status: 'active', arc_ids: ['arc-002'] } }],
    { collection: 'npcs', idPrefix: 'npc_', sessionId: 'pc:session_2', stamp: '2026-08-22' }
  );
  assert.equal(result.doc.npcs[0].status, 'gone');
  assert.deepEqual(result.doc.npcs[0].arc_ids, ['arc-001', 'arc-002']);
  assert.deepEqual(result.conflicts[0].fields, ['status']);
});

test('interaction operations preserve unrelated concurrent entries', () => {
  const result = applyInteractionOperations(
    { interactions: [{ id: 'interaction_a', to: 'pc-a', effect: 'A', status: 'pending' }] },
    [{ op: 'add', interaction: { id: 'interaction_b', to: 'pc-b', effect: 'B' } }],
    { stamp: '2026-08-22', sessionId: 'pc:session_2' }
  );
  assert.deepEqual(result.doc.interactions.map(item => item.id), ['interaction_a', 'interaction_b']);
});
