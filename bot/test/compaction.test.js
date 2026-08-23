import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planCompaction } from '../handlers/mc.js';

function alternatingMessages(count) {
  return Array.from({ length: count }, (_, index) => ({
    role: index % 2 === 0 ? 'user' : 'assistant',
    content: `message ${index}`,
  }));
}

test('compaction retains a user-first recent window at the real 31-message boundary', () => {
  const plan = planCompaction(alternatingMessages(31), 8);
  assert.ok(plan);
  assert.equal(plan.head.role, 'user');
  assert.equal(plan.recent[0].role, 'user');
  assert.equal(plan.recent.at(-1).role, 'user');
  assert.equal(plan.middle.at(-1).role, 'assistant');
});

test('compaction does not create an unusable window when no later user turn exists', () => {
  const plan = planCompaction([
    { role: 'user', content: 'opening' },
    { role: 'assistant', content: 'only response' },
  ], 1);
  assert.equal(plan, null);
});
