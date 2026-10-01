import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCloseBlock, parseSaveOnboardingBlock, sanitizePlayerFacingText } from '../handlers/session.js';

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

test('close parser extracts faction patches', () => {
  const parsed = parseCloseBlock(`<close_session>
<character_id>ada</character_id>
<faction_patch>[{"id":"faction_test","changes":{"stance":"striving"}}]</faction_patch>
</close_session>`);
  assert.match(parsed.faction_patch, /faction_test/);
});

test('onboarding parser extracts faction patches', () => {
  const parsed = parseSaveOnboardingBlock(`<save_onboarding>
<character_id>ada</character_id><sheet># Ada</sheet>
<faction_patch>[{"id":"faction_test"}]</faction_patch>
</save_onboarding>`);
  assert.match(parsed.faction_patch, /faction_test/);
});

test('sanitizer strips bare faction patches from player-facing output', () => {
  const { cleaned } = sanitizePlayerFacingText('Visible.\n<faction_patch>[{"id":"faction_test"}]</faction_patch>');
  assert.equal(cleaned, 'Visible.');
});
