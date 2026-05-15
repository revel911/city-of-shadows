import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseSaveOnboardingBlock,
  missingSaveOnboardingFields,
} from '../handlers/session.js';

const fullBlock = `
Some narrative.

<save_onboarding>
<player_id>joe-nakama</player_id>
<sheet>
# Joe Nakama — Character Sheet
stats: Blood 0, Heart 1, Mind 2, Spirit -1
</sheet>
<state_patch>
{ "character_name": "Joe Nakama", "stats": { "Blood": 0, "Heart": 1, "Mind": 2, "Spirit": -1 }, "harm": 0 }
</state_patch>
<npc_patch>
[{ "id": "npc_ximena_reyes", "name": "Ximena Reyes" }]
</npc_patch>
<events_append>
Joe arrived in Shockoe Bottom.
</events_append>
</save_onboarding>

More narrative after the block.
`;

test('parseSaveOnboardingBlock extracts all tagged fields', () => {
  const save = parseSaveOnboardingBlock(fullBlock);
  assert.ok(save, 'expected a parsed block');
  assert.equal(save.player_id, 'joe-nakama');
  assert.match(save.sheet, /Joe Nakama — Character Sheet/);
  assert.match(save.state_patch, /"character_name": "Joe Nakama"/);
  assert.match(save.npc_patch, /npc_ximena_reyes/);
  assert.match(save.events_append, /Shockoe Bottom/);
});

test('parseSaveOnboardingBlock returns null when no block present', () => {
  assert.equal(parseSaveOnboardingBlock('just narrative, no block'), null);
});

test('parseSaveOnboardingBlock works mid-message (not just trailing)', () => {
  // Save block can appear ANYWHERE in the response — unlike close_session,
  // which must be the trailing content. This is essential because the MC
  // emits the save mid-message and follows it with Phase 13 narrative.
  const mid = 'opener prose\n<save_onboarding>\n<player_id>x</player_id>\n<sheet>s</sheet>\n</save_onboarding>\nphase 13 narrative continues';
  const save = parseSaveOnboardingBlock(mid);
  assert.ok(save);
  assert.equal(save.player_id, 'x');
});

test('missing player_id is flagged', () => {
  assert.deepEqual(
    missingSaveOnboardingFields({ player_id: null, sheet: 'something' }),
    ['player_id']
  );
});

test('player_id of "__new__" is treated as missing', () => {
  assert.deepEqual(
    missingSaveOnboardingFields({ player_id: '__new__', sheet: 'something' }),
    ['player_id']
  );
});

test('whitespace-only player_id is flagged', () => {
  assert.deepEqual(
    missingSaveOnboardingFields({ player_id: '   ', sheet: 'something' }),
    ['player_id']
  );
});

test('missing sheet is flagged', () => {
  assert.deepEqual(
    missingSaveOnboardingFields({ player_id: 'joe-nakama', sheet: null }),
    ['sheet']
  );
});

test('whitespace-only sheet is flagged', () => {
  assert.deepEqual(
    missingSaveOnboardingFields({ player_id: 'joe-nakama', sheet: '   \n  ' }),
    ['sheet']
  );
});

test('valid minimal save (id + sheet) reports no missing fields', () => {
  // Save is more lenient than close: stats are NOT required at save time
  // because trigger 2 ("save") or trigger 3 ("start the story") may fire
  // before Phase 6. Stats can be filled in later via state_patch.
  assert.deepEqual(
    missingSaveOnboardingFields({ player_id: 'joe-nakama', sheet: '# Joe Nakama\nTBD' }),
    []
  );
});

test('state_patch without stats is OK for save (unlike close)', () => {
  const save = {
    player_id: 'joe-nakama',
    sheet: '# Joe Nakama\nTBD',
    state_patch: JSON.stringify({ character_name: 'Joe Nakama' }),
  };
  assert.deepEqual(missingSaveOnboardingFields(save), []);
});

test('multiple missing fields are all reported', () => {
  assert.deepEqual(
    missingSaveOnboardingFields({ player_id: null, sheet: null }),
    ['player_id', 'sheet']
  );
});
