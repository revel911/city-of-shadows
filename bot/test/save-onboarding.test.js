import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseSaveOnboardingBlock,
  missingSaveOnboardingFields,
} from '../handlers/session.js';

const SAMPLE = `Some narrative leading in.

<save_onboarding>
<player_id>joe-nakama</player_id>
<sheet>
# Joe Nakama — Character Sheet

Stats: Blood 1, Heart 2, Mind 0, Spirit -1
</sheet>
<state_patch>
{ "character_name": "Joe Nakama", "stats": { "Blood": 1, "Heart": 2, "Mind": 0, "Spirit": -1 } }
</state_patch>
<npc_patch>
[ { "id": "npc_ximena_reyes", "name": "Ximena Reyes" } ]
</npc_patch>
</save_onboarding>

And then the first scene opens with rain on the James.`;

test('parses a save block embedded mid-message', () => {
  const save = parseSaveOnboardingBlock(SAMPLE);
  assert.ok(save);
  assert.equal(save.player_id, 'joe-nakama');
  assert.match(save.sheet, /Joe Nakama/);
  assert.match(save.state_patch, /"character_name": "Joe Nakama"/);
  assert.match(save.npc_patch, /ximena_reyes/);
});

test('returns null when no save block is present', () => {
  assert.equal(parseSaveOnboardingBlock('just narrative, no tags'), null);
});

test('returns null on close_session block (different tag)', () => {
  const onlyClose = `<close_session><player_id>x</player_id></close_session>`;
  assert.equal(parseSaveOnboardingBlock(onlyClose), null);
});

test('missingSaveOnboardingFields: complete block returns []', () => {
  const save = parseSaveOnboardingBlock(SAMPLE);
  assert.deepEqual(missingSaveOnboardingFields(save), []);
});

test('missingSaveOnboardingFields: missing player_id is flagged', () => {
  assert.deepEqual(
    missingSaveOnboardingFields({ player_id: null, sheet: '# Joe' }),
    ['player_id']
  );
});

test('missingSaveOnboardingFields: "__new__" player_id is treated as missing', () => {
  assert.deepEqual(
    missingSaveOnboardingFields({ player_id: '__new__', sheet: '# Joe' }),
    ['player_id']
  );
});

test('missingSaveOnboardingFields: whitespace player_id is flagged', () => {
  assert.deepEqual(
    missingSaveOnboardingFields({ player_id: '  ', sheet: '# Joe' }),
    ['player_id']
  );
});

test('missingSaveOnboardingFields: missing sheet is flagged (the user-asked requirement)', () => {
  assert.deepEqual(
    missingSaveOnboardingFields({ player_id: 'joe-nakama', sheet: null }),
    ['sheet']
  );
});

test('missingSaveOnboardingFields: whitespace-only sheet is flagged', () => {
  assert.deepEqual(
    missingSaveOnboardingFields({ player_id: 'joe-nakama', sheet: '   \n  ' }),
    ['sheet']
  );
});

test('missingSaveOnboardingFields: state_patch is NOT required at save time', () => {
  assert.deepEqual(
    missingSaveOnboardingFields({
      player_id: 'joe-nakama',
      sheet: '# Joe Nakama',
      state_patch: null,
    }),
    []
  );
});

test('missingSaveOnboardingFields: both fields missing returns both', () => {
  assert.deepEqual(
    missingSaveOnboardingFields({ player_id: null, sheet: null }),
    ['player_id', 'sheet']
  );
});
