import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseCheckpointBlock,
  sanitizePlayerFacingText,
  stripCheckpointBlock,
} from '../handlers/session.js';

test('parses and bounds a public-safe checkpoint', () => {
  const text = `A door opens.
<checkpoint>
{
  "summary": "The crew reached the archive.",
  "location_id": "loc_archive",
  "present_entity_ids": ["npc_ada", "npc_ada"],
  "open_threads": ["The alarm is counting down."],
  "pending_mechanics": ["Resolve escape choice."]
}
</checkpoint>`;
  assert.deepEqual(parseCheckpointBlock(text), {
    summary: 'The crew reached the archive.',
    location_id: 'loc_archive',
    present_entity_ids: ['npc_ada'],
    open_threads: ['The alarm is counting down.'],
    pending_mechanics: ['Resolve escape choice.'],
  });
  assert.equal(stripCheckpointBlock(text), 'A door opens.');
});

test('rejects invalid checkpoints and sanitizer strips their structured payload', () => {
  const text = 'Visible.\n<checkpoint>{"location_id":"loc_archive"}</checkpoint>';
  assert.equal(parseCheckpointBlock(text), null);
  const result = sanitizePlayerFacingText(text);
  assert.equal(result.cleaned, 'Visible.');
  assert.equal(result.leakDetected, true);
});
