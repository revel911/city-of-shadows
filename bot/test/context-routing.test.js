import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractPlaybookSection, selectInteractionEcho } from '../handlers/mc.js';
import { selectRelevantWorld } from '../handlers/world-state.js';

test('returning prompt extracts only the active playbook section', () => {
  const source = [
    '# Playbooks',
    '## The Veteran',
    'Veteran rules.',
    '### Moves',
    'Workshop.',
    '## The Wizard',
    'Wizard rules.',
  ].join('\n');
  const section = extractPlaybookSection(source, 'The Veteran');
  assert.match(section, /Veteran rules/);
  assert.match(section, /Workshop/);
  assert.doesNotMatch(section, /Wizard rules/);
});

test('only one pending echo addressed to the active character is selected', () => {
  const echo = selectInteractionEcho({ interactions: [
    { id: 'interaction_other', to: 'someone-else', effect: 'noise' },
    { id: 'interaction_one', to: 'jacob-boone', effect: 'a sealed letter' },
    { id: 'interaction_two', to: 'jacob-boone', effect: 'a second event' },
  ] }, 'jacob-boone');
  assert.equal(echo.id, 'interaction_one');
});

test('relevant world routing keeps detailed neighbors and an identity directory', () => {
  const world = {
    hubs: [{ id: 'hub_oregon_hill', name: 'Oregon Hill' }, { id: 'hub_far', name: 'Far' }],
    npcs: [
      { id: 'npc_dara', name: 'Dara', hub_id: 'hub_oregon_hill' },
      { id: 'npc_far', name: 'Far NPC', hub_id: 'hub_far' },
    ],
    locations: [],
    relationships: [
      { id: 'rel_dara_jacob', source: 'npc_dara', target: 'jacob-boone' },
    ],
    arcs: [
      { id: 'arc-001', title: 'Near Arc', status: 'active', escalation: 2, character_ids: ['jacob-boone'], npc_ids: ['npc_dara'], hub_ids: ['hub_oregon_hill'] },
      { id: 'arc-002', title: 'Far Arc', status: 'active', escalation: 1, character_ids: [], npc_ids: ['npc_far'], hub_ids: ['hub_far'] },
    ],
    debts: [{ id: 'debt_dara_jacob', creditor_id: 'npc_dara', debtor_id: 'jacob-boone', amount: 1 }],
  };
  const selected = selectRelevantWorld(world, { characterId: 'jacob-boone', state: {}, handoff: '' });
  assert.deepEqual(selected.npcs.map(npc => npc.id), ['npc_dara']);
  assert.deepEqual(selected.arcs.map(arc => arc.id), ['arc-001']);
  assert.equal(selected.debts.length, 1);
  assert.deepEqual(selected.directory.npcs.map(npc => npc.id), ['npc_dara', 'npc_far']);
});
