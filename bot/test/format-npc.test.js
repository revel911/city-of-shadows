import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatNpc } from '../handlers/read-utils.js';

test('renders full NPC', () => {
  const npc = {
    id: 'npc_det_okafor',
    name: 'Det. Sgt. Paulette Okafor',
    faction: 'Mortalis',
    hub: 'Shockoe Bottom',
    role: 'RPD cold case detective; unofficial breach manager for supernatural incidents',
  };
  const out = formatNpc(npc);
  assert.equal(
    out,
    '**Det. Sgt. Paulette Okafor**\n' +
    'Faction: Mortalis  ·  Location: Shockoe Bottom\n' +
    'RPD cold case detective; unofficial breach manager for supernatural incidents'
  );
});

test('missing hub renders Location: —', () => {
  const out = formatNpc({ name: 'X', faction: 'Y', role: 'Z' });
  assert.ok(out.includes('Location: —'));
});

test('missing faction renders Faction: —', () => {
  const out = formatNpc({ name: 'X', hub: 'Y', role: 'Z' });
  assert.ok(out.includes('Faction: —'));
});

test('missing role omits the third line', () => {
  const out = formatNpc({ name: 'X', faction: 'Y', hub: 'Z' });
  assert.equal(out.split('\n').length, 2);
  assert.equal(out, '**X**\nFaction: Y  ·  Location: Z');
});
