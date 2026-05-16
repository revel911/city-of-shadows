import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseSavePlayerBlock,
  missingSavePlayerFields,
} from '../handlers/session.js';

const SAMPLE = `Welcome, Tommy. A few questions before we start.

<save_player>
<discord_id>123456789012345678</discord_id>
<display_name>Tommy</display_name>
<safety>
{
  "hard_limits": ["sexual assault"],
  "soft_limits": ["graphic torture"]
}
</safety>
</save_player>

Let's begin with your first character.`;

test('parses a save_player block embedded mid-message', () => {
  const save = parseSavePlayerBlock(SAMPLE);
  assert.ok(save);
  assert.equal(save.discord_id, '123456789012345678');
  assert.equal(save.display_name, 'Tommy');
  assert.match(save.safety, /hard_limits/);
});

test('returns null when no save_player block is present', () => {
  assert.equal(parseSavePlayerBlock('just narrative, no tags'), null);
});

test('missingSavePlayerFields: complete block returns []', () => {
  const save = parseSavePlayerBlock(SAMPLE);
  assert.deepEqual(missingSavePlayerFields(save), []);
});

test('missingSavePlayerFields: missing discord_id is flagged', () => {
  assert.deepEqual(
    missingSavePlayerFields({ discord_id: null, safety: '{}' }),
    ['discord_id']
  );
});

test('missingSavePlayerFields: whitespace discord_id is flagged', () => {
  assert.deepEqual(
    missingSavePlayerFields({ discord_id: '   ', safety: '{}' }),
    ['discord_id']
  );
});

test('missingSavePlayerFields: missing safety is flagged', () => {
  assert.deepEqual(
    missingSavePlayerFields({ discord_id: '123', safety: null }),
    ['safety']
  );
});

test('missingSavePlayerFields: display_name is optional', () => {
  assert.deepEqual(
    missingSavePlayerFields({ discord_id: '123', safety: '{}', display_name: null }),
    []
  );
});
