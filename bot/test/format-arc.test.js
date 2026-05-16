import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatArc } from '../handlers/read-utils.js';

const hubsIndex = [
  { id: 'hub_shockoe_bottom', name: 'Shockoe Bottom' },
  { id: 'hub_downtown', name: 'Downtown' },
];

const npcsById = {
  npc_maren_voss: { id: 'npc_maren_voss', name: 'Maren Voss' },
};

const playersIndex = [
  { id: 'chris-caustes', name: 'Chris Caustes' },
];

test('renders arc with all ID lists resolved', () => {
  const arc = {
    id: 'arc-001',
    title: 'The Collector',
    hub_ids: ['hub_shockoe_bottom', 'hub_downtown'],
    npc_ids: ['npc_maren_voss'],
    character_ids: ['chris-caustes'],
    summary: 'An entity that catalogs things-that-remember.',
  };
  const out = formatArc(arc, hubsIndex, npcsById, playersIndex);
  assert.equal(
    out,
    '**The Collector**\n' +
    'Hubs: Shockoe Bottom, Downtown\n' +
    'NPCs: Maren Voss\n' +
    'PCs: Chris Caustes\n' +
    'An entity that catalogs things-that-remember.'
  );
});

test('empty ID lists render as —', () => {
  const arc = {
    title: 'Floating',
    hub_ids: [],
    npc_ids: [],
    character_ids: [],
    summary: 'Nowhere yet.',
  };
  const out = formatArc(arc, hubsIndex, npcsById, playersIndex);
  assert.ok(out.includes('Hubs: —'));
  assert.ok(out.includes('NPCs: —'));
  assert.ok(out.includes('PCs: —'));
});

test('unknown IDs in lists are skipped silently', () => {
  const arc = {
    title: 'Partial',
    hub_ids: ['hub_shockoe_bottom', 'hub_unknown'],
    npc_ids: ['npc_unknown'],
    character_ids: ['ghost-player'],
    summary: 'Some known, some not.',
  };
  const out = formatArc(arc, hubsIndex, npcsById, playersIndex);
  assert.ok(out.includes('Hubs: Shockoe Bottom'));
  assert.ok(!out.includes('hub_unknown'));
  assert.ok(out.includes('NPCs: —'));
  assert.ok(out.includes('PCs: —'));
});

test('missing summary omits the trailing line', () => {
  const arc = {
    title: 'No Summary',
    hub_ids: [],
    npc_ids: [],
    character_ids: [],
  };
  const out = formatArc(arc, hubsIndex, npcsById, playersIndex);
  const lines = out.split('\n');
  assert.equal(lines.length, 4);
});
