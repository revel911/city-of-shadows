import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRecentEvents } from '../handlers/read-utils.js';

const sample = `# Header

Some intro text.

---

<!-- MC: append above this line -->

## [2026-04-24] Newest Event

First paragraph of newest.

Second paragraph of newest.

## [2026-04-20] Middle Event

Middle event body.

## [2026-04-15] Oldest Event

Oldest body.
`;

test('returns first N H2 sections (newest first)', () => {
  const result = parseRecentEvents(sample, 2);
  assert.equal(result.length, 2);
  assert.ok(result[0].startsWith('## [2026-04-24] Newest Event'));
  assert.ok(result[0].includes('Second paragraph of newest.'));
  assert.ok(result[1].startsWith('## [2026-04-20] Middle Event'));
});

test('returns all when N exceeds available', () => {
  const result = parseRecentEvents(sample, 99);
  assert.equal(result.length, 3);
});

test('returns empty array when no H2 sections exist', () => {
  const result = parseRecentEvents('# Title only\n\nNo sections here.', 3);
  assert.deepEqual(result, []);
});

test('returns empty array for empty input', () => {
  assert.deepEqual(parseRecentEvents('', 3), []);
});

test('strips trailing whitespace on each section', () => {
  const result = parseRecentEvents(sample, 1);
  assert.equal(result[0].endsWith('\n'), false);
});
