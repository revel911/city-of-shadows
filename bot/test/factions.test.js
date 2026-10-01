import { test } from 'node:test';
import assert from 'node:assert/strict';
import { factionProblems, compactFaction } from '../handlers/factions.js';

const ids = { npc: new Set(['npc_olave']), hub: new Set(['hub_university']), pc: new Set(['jacob-boone']) };
const good = {
  id: 'faction_richmond_consilium', name: 'Richmond Consilium', circle: 'Power', size: 3, strength: 3,
  assets: ['VCU archives'], stance: 'striving', hub_ids: ['hub_university'], leader_npc_id: 'npc_olave',
  member_npc_ids: [], character_ids: [], public_summary: 'Mages who govern magic in Richmond.', revision: 0,
};

test('a well-formed faction has no problems', () => {
  assert.deepEqual(factionProblems(good, ids), []);
});

test('faction validation names every broken field', () => {
  const problems = factionProblems({ ...good, id: 'consilium', circle: 'Vampires', size: 9, strength: 0, stance: 'winning', leader_npc_id: 'npc_ghost', hub_ids: ['hub_nowhere'], character_ids: ['nobody'] }, ids);
  for (const fragment of ['faction_', 'circle', 'size', 'strength', 'stance', 'npc_ghost', 'hub_nowhere', 'nobody']) {
    assert.ok(problems.some(p => p.includes(fragment)), `expected a problem mentioning ${fragment}`);
  }
});

test('a faction owned by more than one character is rejected', () => {
  assert.ok(factionProblems({ ...good, character_ids: ['jacob-boone', 'jacob-boone'] }, ids).some(p => /one owning character/.test(p)));
});

test('compact faction carries play-relevant fields only', () => {
  assert.deepEqual(Object.keys(compactFaction(good)).sort(), ['assets', 'character_ids', 'circle', 'hub_ids', 'id', 'leader_npc_id', 'name', 'public_summary', 'revision', 'size', 'stance', 'strength'].sort());
});
