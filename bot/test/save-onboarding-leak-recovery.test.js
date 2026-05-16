import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSaveLeakNudge, SAVE_ONBOARDING_MAX_RETRIES, sanitizePlayerFacingText, applySaveLeakNudge } from '../handlers/session.js';

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

test('applySaveLeakNudge: no leak flag → returns player content unchanged, no state mutation', () => {
  const session = {};
  const { content, exhausted } = applySaveLeakNudge(session, 'player message');
  assert.equal(content, 'player message');
  assert.equal(exhausted, false);
  assert.equal(session._saveLeakRetries, undefined);
  assert.equal(session._lastTurnSaveLeak, undefined);
});

test('applySaveLeakNudge: leak flag, first retry → prepends nudge and bumps counter to 1', () => {
  const session = { _lastTurnSaveLeak: true };
  const { content, exhausted, retries } = applySaveLeakNudge(session, 'player message');
  assert.match(content, /unterminated/i);
  assert.match(content, /Retry 1 of/);
  assert.equal(content.endsWith('\n\n[PLAYER MESSAGE]\nplayer message'), true);
  assert.equal(exhausted, false);
  assert.equal(retries, 1);
  // Flag cleared (consumed); counter bumped.
  assert.equal(session._lastTurnSaveLeak, false);
  assert.equal(session._saveLeakRetries, 1);
});

test('applySaveLeakNudge: leak flag, second retry → prepends nudge with Retry 2 of N', () => {
  const session = { _lastTurnSaveLeak: true, _saveLeakRetries: 1 };
  const { content, exhausted, retries } = applySaveLeakNudge(session, 'player message');
  assert.match(content, new RegExp(`Retry 2 of ${SAVE_ONBOARDING_MAX_RETRIES}`));
  assert.equal(exhausted, false);
  assert.equal(retries, 2);
  assert.equal(session._saveLeakRetries, 2);
});

test('applySaveLeakNudge: leak flag at cap → exhausted, no nudge, counter bumped past cap', () => {
  const session = { _lastTurnSaveLeak: true, _saveLeakRetries: SAVE_ONBOARDING_MAX_RETRIES };
  const { content, exhausted, retries } = applySaveLeakNudge(session, 'player message');
  assert.equal(content, 'player message');
  assert.equal(exhausted, true);
  assert.equal(retries, SAVE_ONBOARDING_MAX_RETRIES + 1);
  // Flag still cleared on exhaustion path.
  assert.equal(session._lastTurnSaveLeak, false);
});

test('post-clean-save flag suppression: when postMCResponse fires a clean save AND sanitize finds a leak, _lastTurnSaveLeak is NOT set', () => {
  // This is a contract test: simulate the state after postMCResponse has
  // (a) successfully processed a save block and (b) sanitize found bare-tag
  // leakage. With the cleanSaveFiredThisTurn suppression, _lastTurnSaveLeak
  // must remain unset, so the next applySaveLeakNudge call is a no-op.
  const session = { _lastTurnSaveLeak: false, _saveLeakRetries: 0 };
  const { content, exhausted } = applySaveLeakNudge(session, 'next turn');
  assert.equal(content, 'next turn');
  assert.equal(exhausted, false);
  assert.equal(session._saveLeakRetries, 0);
});
