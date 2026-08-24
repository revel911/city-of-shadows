import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizePlayerFacingText } from '../handlers/session.js';

test('normalizes em dash sentence construction before posting', () => {
  const emDash = String.fromCodePoint(0x2014);
  const enDash = String.fromCodePoint(0x2013);
  const input = 'left ' + emDash + ' right and 1' + enDash + '3';
  const result = sanitizePlayerFacingText(input);
  assert.equal(result.cleaned, 'left, right and 1' + enDash + '3');
  assert.equal(result.leakDetected, false);
  assert.equal(result.cleaned.includes(emDash), false);
});
