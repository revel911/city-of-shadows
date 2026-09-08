import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseSaveOnboardingBlock,
  missingSaveOnboardingFields,
} from '../handlers/session.js';

const SAMPLE = `Some narrative leading in.

<save_onboarding>
<character_id>joe-nakama</character_id>
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
<relationship_patch>
[]
</relationship_patch>
<debt_patch>
[]
</debt_patch>
</save_onboarding>

And then the first scene opens with rain on the James.`;

test('parses a save block embedded mid-message', () => {
  const save = parseSaveOnboardingBlock(SAMPLE);
  assert.ok(save);
  assert.equal(save.character_id, 'joe-nakama');
  assert.match(save.sheet, /Joe Nakama/);
  assert.match(save.state_patch, /"character_name": "Joe Nakama"/);
  assert.match(save.npc_patch, /ximena_reyes/);
});

test('returns null when no save block is present', () => {
  assert.equal(parseSaveOnboardingBlock('just narrative, no tags'), null);
});

test('returns null on close_session block (different tag)', () => {
  const onlyClose = `<close_session><character_id>x</character_id></close_session>`;
  assert.equal(parseSaveOnboardingBlock(onlyClose), null);
});

test('missingSaveOnboardingFields: complete block returns []', () => {
  const save = parseSaveOnboardingBlock(SAMPLE);
  assert.deepEqual(missingSaveOnboardingFields(save), []);
});

test('missingSaveOnboardingFields: missing character_id is flagged', () => {
  assert.deepEqual(
    missingSaveOnboardingFields({ character_id: null, sheet: '# Joe', relationship_patch: '[]', debt_patch: '[]' }),
    ['character_id']
  );
});

test('missingSaveOnboardingFields: "__new__" character_id is treated as missing', () => {
  assert.deepEqual(
    missingSaveOnboardingFields({ character_id: '__new__', sheet: '# Joe', relationship_patch: '[]', debt_patch: '[]' }),
    ['character_id']
  );
});

test('missingSaveOnboardingFields: whitespace character_id is flagged', () => {
  assert.deepEqual(
    missingSaveOnboardingFields({ character_id: '  ', sheet: '# Joe', relationship_patch: '[]', debt_patch: '[]' }),
    ['character_id']
  );
});

test('missingSaveOnboardingFields: missing sheet is flagged (the user-asked requirement)', () => {
  assert.deepEqual(
    missingSaveOnboardingFields({ character_id: 'joe-nakama', sheet: null, relationship_patch: '[]', debt_patch: '[]' }),
    ['sheet']
  );
});

test('missingSaveOnboardingFields: whitespace-only sheet is flagged', () => {
  assert.deepEqual(
    missingSaveOnboardingFields({ character_id: 'joe-nakama', sheet: '   \n  ', relationship_patch: '[]', debt_patch: '[]' }),
    ['sheet']
  );
});

test('missingSaveOnboardingFields: state_patch is NOT required at save time', () => {
  assert.deepEqual(
    missingSaveOnboardingFields({
      character_id: 'joe-nakama',
      sheet: '# Joe Nakama',
      state_patch: null,
      relationship_patch: '[]',
      debt_patch: '[]',
    }),
    []
  );
});

test('missingSaveOnboardingFields: all required fields missing returns all', () => {
  assert.deepEqual(
    missingSaveOnboardingFields({ character_id: null, sheet: null }),
    ['character_id', 'sheet', 'relationship_patch', 'debt_patch']
  );
});

test('missingSaveOnboardingFields: requires explicit relationship and Debt arrays', () => {
  assert.deepEqual(
    missingSaveOnboardingFields({ character_id: 'joe-nakama', sheet: '# Joe' }),
    ['relationship_patch', 'debt_patch']
  );
  assert.deepEqual(
    missingSaveOnboardingFields({
      character_id: 'joe-nakama', sheet: '# Joe', relationship_patch: '[]', debt_patch: '[]',
    }),
    []
  );
});

test('missingSaveOnboardingFields: rejects malformed or non-array world patches', () => {
  assert.deepEqual(
    missingSaveOnboardingFields({
      character_id: 'joe-nakama', sheet: '# Joe', relationship_patch: '{oops', debt_patch: '{}',
    }),
    ['relationship_patch (JSON array)', 'debt_patch (JSON array)']
  );
});
