import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizePlayerFacingText } from '../handlers/session.js';

test('returns unchanged on pure narrative with no tags', () => {
  const input = 'Rain on Maymont Road. Jacob stands outside the gym.';
  const { cleaned, leakDetected } = sanitizePlayerFacingText(input);
  assert.equal(cleaned, input);
  assert.equal(leakDetected, false);
});

test('returns unchanged when no structured leftovers remain after upstream strip', () => {
  const input = 'opener prose\nphase 13 narrative continues';
  const { cleaned, leakDetected } = sanitizePlayerFacingText(input);
  assert.equal(cleaned, input);
  assert.equal(leakDetected, false);
});

test('strips unterminated <save_onboarding> from open tag to end of string', () => {
  const input = [
    'Some opener prose.',
    '',
    '<save_onboarding>',
    '<character_id>jacob-brooks</character_id>',
    '<sheet>',
    '... long sheet content ...',
    '</sheet>',
    '<state_patch>',
    '{ "character_name": "Jacob Brooks" }',
    '</state_patch>',
    '<npc_patch>',
    '[{ "id": "npc_darius_webb"',
  ].join('\n');
  const { cleaned, leakDetected } = sanitizePlayerFacingText(input);
  assert.equal(cleaned, 'Some opener prose.');
  assert.equal(leakDetected, true);
});

test('strips unterminated <close_session> from open tag to end of string', () => {
  const input = 'Final narrative.\n\n<close_session>\n<character_id>x</character_id>\n<handoff>partial';
  const { cleaned, leakDetected } = sanitizePlayerFacingText(input);
  assert.equal(cleaned, 'Final narrative.');
  assert.equal(leakDetected, true);
});

test('strips bare <state_patch> with JSON body floating in prose', () => {
  const input = 'before\n<state_patch>{ "character_name": "X" }</state_patch>\nafter';
  const { cleaned, leakDetected } = sanitizePlayerFacingText(input);
  assert.equal(cleaned, 'before\n\nafter');
  assert.equal(leakDetected, true);
});

test('strips bare <npc_patch> with array body floating in prose', () => {
  const input = 'before\n<npc_patch>[{ "id": "npc_x", "name": "X" }]</npc_patch>\nafter';
  const { cleaned, leakDetected } = sanitizePlayerFacingText(input);
  assert.equal(cleaned, 'before\n\nafter');
  assert.equal(leakDetected, true);
});

test('strips bare <sheet> with known-schema-key body floating in prose', () => {
  const input = 'before\n<sheet>"character_name": "X"\nstats: ...</sheet>\nafter';
  const { cleaned, leakDetected } = sanitizePlayerFacingText(input);
  assert.equal(cleaned, 'before\n\nafter');
  assert.equal(leakDetected, true);
});

test('preserves literal <sheet> with non-JSON in-fiction body', () => {
  const input = 'Marcus glanced at the <sheet>blank paper on the table</sheet>, said nothing.';
  const { cleaned, leakDetected } = sanitizePlayerFacingText(input);
  assert.equal(cleaned, input);
  assert.equal(leakDetected, false);
});

test('strips orphan </sheet> closing tag with no opener', () => {
  const input = 'narrative continues</sheet>\nmore narrative';
  const { cleaned, leakDetected } = sanitizePlayerFacingText(input);
  assert.equal(cleaned, 'narrative continues\nmore narrative');
  assert.equal(leakDetected, true);
});

test('strips orphan <character_id> open tag with no closer', () => {
  const input = 'narrative <character_id>somewhere and then more text';
  const { cleaned, leakDetected } = sanitizePlayerFacingText(input);
  assert.equal(cleaned, 'narrative somewhere and then more text');
  assert.equal(leakDetected, true);
});

test('reproduces the failure pattern from the Jacob Brooks incident', () => {
  // The real-world leak: orphan </sheet>, then a complete <state_patch>{json}</state_patch>,
  // then a <npc_patch> that was truncated mid-NPC (no closing </npc_patch>).
  const input = [
    '</sheet>',
    '',
    '<state_patch>',
    '{ "character_name": "Jacob Brooks", "harm": 0 }',
    '</state_patch>',
    '',
    '<npc_patch>',
    '[{ "id": "npc_darius_webb", "name": "Darius Webb"',
  ].join('\n');
  const { cleaned, leakDetected } = sanitizePlayerFacingText(input);
  // All three structured fragments removed; only whitespace remains, which is trimmed.
  assert.equal(cleaned, '');
  assert.equal(leakDetected, true);
});
