import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSaveOnboardingBlock, sanitizePlayerFacingText } from '../handlers/session.js';

test('onboarding parser extracts location and relationship patches', () => {
  const parsed = parseSaveOnboardingBlock(`<save_onboarding>
<character_id>ada</character_id><sheet># Ada</sheet>
<location_patch>[{"id":"loc_archive"}]</location_patch>
<relationship_patch>[{"id":"rel_ada_archive"}]</relationship_patch>
</save_onboarding>`);
  assert.match(parsed.location_patch, /loc_archive/);
  assert.match(parsed.relationship_patch, /rel_ada_archive/);
});

test('sanitizer strips bare world patches from player-facing output', () => {
  const input = 'Visible.\n<location_patch>[{"id":"loc_archive"}]</location_patch>\n<relationship_patch>[{"id":"rel_1"}]</relationship_patch>\n<mystery_patch>[{"id":"mystery_one"}]</mystery_patch>\n<npc_memory_patch>[{"npc_id":"npc_one"}]</npc_memory_patch>';
  const { cleaned } = sanitizePlayerFacingText(input);
  assert.equal(cleaned, 'Visible.');
});
