import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  findMentionedNpcs,
  formatCanonicalWorldContext,
  formatNpcHydrationContext,
  mergeCanonicalPatches,
  npcBehaviorCard,
} from '../handlers/world-state.js';

test('canonical world context includes IDs and NPC voice guidance', () => {
  const result = formatCanonicalWorldContext({
    hubs: [{ id: 'hub_test', name: 'Test Hub' }],
    npcs: [{ id: 'npc_ada', name: 'Ada', personality: { voice_note: 'Never wastes a word.' } }],
    locations: [{ id: 'loc_archive', name: 'Archive', hub_id: 'hub_test' }],
    relationships: [{ id: 'rel_1', source: 'npc_ada', target: 'loc_archive', label: 'Works at' }]
  });
  assert.match(result, /CANONICAL WORLD INDEX/);
  assert.match(result, /Never wastes a word/);
  assert.match(result, /NPC BEHAVIOR CARDS/);
  assert.match(result, /loc_archive/);
  assert.match(result, /rel_1/);
});

test('NPC behavior cards preserve voice while producing distinct speech and conflict instincts', () => {
  const dangerous = npcBehaviorCard({
    id: 'npc_general',
    personality: {
      moral: 1,
      order: 5,
      manner: 1,
      violence: 1,
      voice_note: 'Commands, never bargains.',
    },
  });
  const conciliatory = npcBehaviorCard({
    id: 'npc_priest',
    personality: {
      moral: 5,
      order: 4,
      manner: 5,
      violence: 5,
      voice_note: 'Names the fear before offering help.',
    },
  });

  assert.equal(dangerous.voice_note, 'Commands, never bargains.');
  assert.match(dangerous.dialogue_register, /One to three words/);
  assert.match(dangerous.conflict_instinct, /attacks early/);
  assert.match(conciliatory.dialogue_register, /Warm and disarming/);
  assert.match(conciliatory.conflict_instinct, /off the table/);
  assert.notEqual(dangerous.conflict_instinct, conciliatory.conflict_instinct);
});

test('newly mentioned NPCs are found by full name, unique alias, or canonical ID', () => {
  const npcs = [
    { id: 'npc_dara', name: 'Dara Singh' },
    { id: 'npc_ada_one', name: 'Ada Mercer' },
    { id: 'npc_ada_two', name: 'Ada Price' },
  ];

  assert.deepEqual(findMentionedNpcs('I call Dara.', npcs).map(npc => npc.id), ['npc_dara']);
  assert.deepEqual(findMentionedNpcs('Ada Mercer walks in.', npcs).map(npc => npc.id), ['npc_ada_one']);
  assert.deepEqual(findMentionedNpcs('Find npc_ada_two.', npcs).map(npc => npc.id), ['npc_ada_two']);
  assert.deepEqual(findMentionedNpcs('I ask Ada.', npcs), []);
  assert.deepEqual(findMentionedNpcs('I call Dara.', npcs, ['npc_dara']), []);
  assert.deepEqual(findMentionedNpcs('I speak generally.', [{ id: 'npc_general', name: 'The General' }]), []);
});

test('NPC hydration carries the complete authoritative record and binding behavior', () => {
  const result = formatNpcHydrationContext([{
    id: 'npc_dara',
    name: 'Dara Singh',
    role: 'Fixer',
    personality: {
      moral: 3,
      order: 2,
      manner: 2,
      violence: 2,
      voice_note: 'Answers questions with prices.',
    },
  }]);

  assert.match(result, /NPC PERSONALITY HYDRATION/);
  assert.match(result, /Answers questions with prices/);
  assert.match(result, /Short transactional sentences/);
  assert.match(result, /follows through quickly/);
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
