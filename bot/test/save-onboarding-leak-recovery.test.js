import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSaveLeakNudge, SAVE_ONBOARDING_MAX_RETRIES, sanitizePlayerFacingText } from '../handlers/session.js';

test('buildSaveLeakNudge mentions unterminated block and asks for first-content re-emit', () => {
  const nudge = buildSaveLeakNudge(1);
  assert.match(nudge, /unterminated/i);
  assert.match(nudge, /<save_onboarding>/);
  assert.match(nudge, /first content/i);
  assert.match(nudge, /Retry 1 of/);
});

test('buildSaveLeakNudge includes the retry counter against the shared cap', () => {
  const nudge = buildSaveLeakNudge(2);
  assert.match(nudge, new RegExp(`Retry 2 of ${SAVE_ONBOARDING_MAX_RETRIES}`));
});

test('sanitizer-then-nudge: a leaked turn produces leakDetected=true so the next-turn nudge fires', () => {
  // This isn't a full handler integration (handleMessage requires a Discord
  // message object), but it pins down the contract: sanitize must signal a
  // leak when the MC produces an unterminated save block, and the nudge
  // builder must produce text the MC can act on.
  const leakedTurn = [
    'opener prose',
    '<save_onboarding>',
    '<character_id>jacob-brooks</character_id>',
    '<sheet>incomplete...',
  ].join('\n');
  const { cleaned, leakDetected } = sanitizePlayerFacingText(leakedTurn);
  assert.equal(cleaned, 'opener prose');
  assert.equal(leakDetected, true);

  // The nudge for retry 1 should reference the failure mode and the cap.
  const nudge = buildSaveLeakNudge(1);
  assert.match(nudge, /unterminated/i);
  assert.match(nudge, /first content/i);
});
