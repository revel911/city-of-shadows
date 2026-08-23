import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSceneDirectorContext,
  detectRepeatedDevices,
  inferPlaySignals,
  isCharacterRecapRequest,
  mergePlaystyleObservations,
  normalizePlaystyleSignals,
  updatePlaystyleSignals,
} from '../handlers/scene-director.js';

test('player actions produce broad observable play signals', () => {
  assert.equal(inferPlaySignals('I search the office and inspect the ledger.').investigation, 2);
  assert.equal(inferPlaySignals('I tackle him before he reaches the door.').action, 2);
  assert.equal(inferPlaySignals('I ask Mara what she really wants.').social, 2);
});

test('signals accumulate without storing romance or consent categories', () => {
  const next = updatePlaystyleSignals(null, 'I flirt with Mara and ask what she wants.');
  assert.equal(next.scores.social > 0, true);
  assert.equal(Object.hasOwn(next.scores, 'romance'), false);
  assert.equal(Object.hasOwn(next, 'consent'), false);
});

test('current declared action overrides the strongest historical tendency', () => {
  const history = normalizePlaystyleSignals({
    scores: { action: 40, investigation: 0, social: 0, exploration: 0, reflection: 0 },
  });
  const direction = buildSceneDirectorContext({
    playerText: 'I search the records for who authorized the transfer.',
    playstyleSignals: history,
  });
  assert.match(direction, /Current mode: investigation/);
  assert.match(direction, /current declared action always overrides/i);
});

test('romantic wording triggers only a present-turn consent guard', () => {
  const direction = buildSceneDirectorContext({
    playerText: 'I lean in and kiss her.',
    playstyleSignals: null,
  });
  assert.match(direction, /not blanket consent/i);
  assert.match(direction, /check before escalation/i);
});

test('repeated stock devices are placed on cooldown', () => {
  assert.deepEqual(
    detectRepeatedDevices('Your phone buzzes. An unknown number sends a cryptic warning.'),
    ['anonymous_message', 'cryptic_warning'],
  );
});

test('simultaneous sessions merge only their newly observed choices', () => {
  const baseline = normalizePlaystyleSignals({ scores: { action: 2 }, observed_choices: 1, recent_modes: ['action'] });
  const thisSession = updatePlaystyleSignals(baseline, 'I search the archive.');
  const concurrentlyUpdated = updatePlaystyleSignals(baseline, 'I ask Mara for help.');
  const merged = mergePlaystyleObservations(concurrentlyUpdated, baseline, thisSession);
  assert.equal(merged.scores.action, 2);
  assert.equal(merged.scores.investigation, 2);
  assert.equal(merged.scores.social, 2);
  assert.equal(merged.observed_choices, 3);
  assert.deepEqual(merged.recent_modes, ['action', 'social', 'investigation']);
});

test('character refresher pauses fiction and concise retry inherits that mode', () => {
  const original = 'OOO … it’s been awhile since I played Jacob, tell me a little about him';
  assert.equal(isCharacterRecapRequest(original), true);
  assert.equal(isCharacterRecapRequest('Break it up', original), true);
  const direction = buildSceneDirectorContext({ playerText: original });
  assert.match(direction, /OUT-OF-CHARACTER CHARACTER RECAP/);
  assert.match(direction, /Pause the fiction/);
  assert.match(direction, /at most five compact bullets/);
  assert.match(direction, /Do not advance time/);
});
