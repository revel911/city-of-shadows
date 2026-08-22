import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildKeeperProjection } from '../../scripts/keeper-projection.mjs';

test('keeper projection excludes private and unapproved fields', () => {
  const projection = buildKeeperProjection({
    phase: 'reconcile',
    meta: { revision: 4, private: 'no' },
    hubs: [{ id: 'hub_one', name: 'One', file: 'secret.md' }],
    hubState: { hubs: [{ id: 'hub_one', pressure: 2, mc_notes: 'no' }] },
    npcs: { npcs: [{
      id: 'npc_one', name: 'One', status: 'active', role: 'Witness',
      hub_id: 'hub_one', personality: { voice_note: 'no' }, notes: 'no',
    }] },
    locations: { locations: [{ id: 'loc_one', name: 'One', hub_id: 'hub_one', notes: 'no' }] },
    relationships: { relationships: [
      { id: 'rel_public', source: 'npc_one', target: 'loc_one', visibility: 'public' },
      { id: 'rel_private', source: 'npc_one', target: 'loc_one', visibility: 'private' },
    ] },
    arcs: { arcs: [{ id: 'arc-001', summary: 'Public', mc_notes: 'no', character_ids: ['private-pc'] }] },
    debts: { debts: [] },
    interactions: { interactions: [] },
    conflicts: { conflicts: [{
      id: 'conflict_one', status: 'pending', entity_id: 'npc_one', fields: ['status'],
      proposed_changes: { status: 'dead' }, evidence_session_ids: ['private-session'],
    }] },
    events: '## Public\nEvent',
    ledger: [{ name: 'private-name.json', data: {
      character_id: 'private-pc', session_id: 'private-session',
      world_impact: { level: 'shared', summary: 'Public' }, touched: ['npc_patch'],
    } }],
  });
  const serialized = JSON.stringify(projection);
  for (const forbidden of [
    'voice_note', 'mc_notes', 'personality', 'private-pc', 'private-session',
    'proposed_changes', 'secret.md', 'rel_private',
  ]) {
    assert.equal(serialized.includes(forbidden), false, forbidden);
  }
  assert.equal(projection.npcs[0].role, 'Witness');
  assert.equal(projection.conflicts[0].actual_revision, undefined);
  assert.equal(projection.session_evidence[0].world_impact.summary, 'Public');
});
