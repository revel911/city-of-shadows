import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseSavePlayerBlock,
  missingSavePlayerFields,
  stripSavePlayerBlock,
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

test('stripSavePlayerBlock: removes the block and preserves surrounding prose', () => {
  const cleaned = stripSavePlayerBlock(SAMPLE);
  assert.match(cleaned, /^Welcome, Tommy\./);
  assert.match(cleaned, /Let's begin with your first character\.$/);
  assert.equal(cleaned.includes('<save_player>'), false);
  assert.equal(cleaned.includes('</save_player>'), false);
  assert.equal(cleaned.includes('hard_limits'), false);
});

test('stripSavePlayerBlock: returns input unchanged when no block present', () => {
  const input = 'Just narrative, no tags here.';
  assert.equal(stripSavePlayerBlock(input), input);
});

test('stripSavePlayerBlock: handles block at start of message', () => {
  const input = '<save_player><discord_id>1</discord_id><safety>{}</safety></save_player>\n\nNow let\'s play.';
  const cleaned = stripSavePlayerBlock(input);
  assert.equal(cleaned, "Now let's play.");
});

test('stripSavePlayerBlock: handles block at end of message', () => {
  const input = 'Opening narrative.\n\n<save_player><discord_id>1</discord_id><safety>{}</safety></save_player>';
  const cleaned = stripSavePlayerBlock(input);
  assert.equal(cleaned, 'Opening narrative.');
});

// ── Optional mechanics_depth field ────────────────────────────────────
// New players can either pick a mechanics depth (1-5) during onboarding
// or defer the choice. Deferral is signaled by omitting the field; the
// bot then keeps the default of 3 with mechanics_depth_set=false so the
// post-first-session calibration prompt still fires.

const SAMPLE_WITH_MECH = `Welcome.

<save_player>
<discord_id>123456789012345678</discord_id>
<safety>
{ "hard_limits": [], "soft_limits": [] }
</safety>
<mechanics_depth>4</mechanics_depth>
</save_player>

Onward.`;

test('parseSavePlayerBlock: extracts mechanics_depth when present', () => {
  const save = parseSavePlayerBlock(SAMPLE_WITH_MECH);
  assert.equal(save.mechanics_depth, 4);
});

test('parseSavePlayerBlock: mechanics_depth is null when absent (deferred)', () => {
  const save = parseSavePlayerBlock(SAMPLE);
  assert.equal(save.mechanics_depth, null);
});

test('parseSavePlayerBlock: non-numeric mechanics_depth becomes null', () => {
  const input = SAMPLE_WITH_MECH.replace('<mechanics_depth>4', '<mechanics_depth>later');
  const save = parseSavePlayerBlock(input);
  assert.equal(save.mechanics_depth, null);
});

test('parseSavePlayerBlock: out-of-range mechanics_depth becomes null', () => {
  // The MC might emit 0 or 7 by mistake; treat invalid same as absent so
  // the bot falls back to the default+calibration path instead of writing
  // a garbage value.
  const high = SAMPLE_WITH_MECH.replace('<mechanics_depth>4', '<mechanics_depth>7');
  assert.equal(parseSavePlayerBlock(high).mechanics_depth, null);
  const low = SAMPLE_WITH_MECH.replace('<mechanics_depth>4', '<mechanics_depth>0');
  assert.equal(parseSavePlayerBlock(low).mechanics_depth, null);
});

test('missingSavePlayerFields: mechanics_depth is not required', () => {
  // Defer-by-omission must not be flagged as a missing field — it is the
  // valid "decide later" signal from player-onboarding.
  assert.deepEqual(
    missingSavePlayerFields({ discord_id: '1', safety: '{}', mechanics_depth: null }),
    []
  );
});
