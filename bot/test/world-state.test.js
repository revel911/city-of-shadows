import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatCanonicalWorldContext, mergeCanonicalPatches } from '../handlers/world-state.js';

test('canonical world context includes IDs and NPC voice guidance', () => {
  const result = formatCanonicalWorldContext({
    hubs: [{ id: 'hub_test', name: 'Test Hub' }],
    npcs: [{ id: 'npc_ada', name: 'Ada', personality: { voice_note: 'Never wastes a word.' } }],
    locations: [{ id: 'loc_archive', name: 'Archive', hub_id: 'hub_test' }],
    relationships: [{ id: 'rel_1', source: 'npc_ada', target: 'loc_archive', label: 'Works at' }]
  });
  assert.match(result, /CANONICAL WORLD INDEX/);
  assert.match(result, /Never wastes a word/);
  assert.match(result, /loc_archive/);
  assert.match(result, /rel_1/);
});

test('canonical patch merge resolves duplicate NPC names to the existing ID', () => {
  const result = mergeCanonicalPatches(
    { npcs: [{ id: 'npc_ada_lovelace', name: 'Ada Lovelace', notes: 'existing' }] },
    [{ id: 'npc_ada', name: 'Ada Lovelace', status: 'gone' }],
    { collection: 'npcs', idPrefix: 'npc_', sessionId: 'session_9', stamp: '2026-08-21', allowNameMatch: true }
  );
  assert.equal(result.doc.npcs.length, 1);
  assert.equal(result.doc.npcs[0].id, 'npc_ada_lovelace');
  assert.equal(result.doc.npcs[0].status, 'gone');
});

test('private relationships are rejected from public relationship files', () => {
  const result = mergeCanonicalPatches(
    { relationships: [] },
    [{ id: 'rel_secret', source: 'npc_a', target: 'npc_b', label: 'Secret', visibility: 'mc' }],
    { collection: 'relationships', idPrefix: 'rel_', sessionId: 'session_9', stamp: '2026-08-21', publicOnly: true }
  );
  assert.equal(result.doc.relationships.length, 0);
  assert.equal(result.rejected.length, 1);
});
