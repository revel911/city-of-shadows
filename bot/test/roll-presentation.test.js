import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatMoveNames, buildMechanicsFallback } from '../handlers/mechanics.js';

test('move labels are consistently bold without doubling existing Markdown', () => {
  const text = 'That triggers Figure Someone Out. **Keep Your Cool** follows. Persuade an NPC.';
  const expected = 'That triggers **Figure Someone Out**. **Keep Your Cool** follows. **Persuade an NPC**.';
  assert.equal(formatMoveNames(text), expected);
  assert.equal(formatMoveNames(expected), expected);
  assert.equal(formatMoveNames('Use Custom Move.', ['Custom Move']), 'Use **Custom Move**.');
  assert.equal(formatMoveNames('Try to keep your cool. `Figure Someone Out`'), 'Try to keep your cool. `Figure Someone Out`');
});

test('fallback names the move and leaves the roll prompt to the bot without suggesting a result', () => {
  const reply = buildMechanicsFallback({ move: 'Figure Someone Out', modifier_type: 'stat', modifier_key: 'Mind' });
  assert.match(reply, /\*\*Figure Someone Out\*\*/);
  assert.match(reply, /<roll_request>/);
  assert.doesNotMatch(reply, /I rolled an 8|before modifiers/);
});
