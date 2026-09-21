import assert from 'node:assert/strict';
import { getSystemPrompt } from '../handlers/mc.js';
import { lifecycleIntent } from '../handlers/lifecycle.js';
import { buildClarificationAdjudicationText } from '../handlers/move-adjudicator.js';

const expected = process.argv[2];
if (expected) assert.equal(process.env.APP_REVISION, expected, 'deployed image revision differs from Git');
const core = await getSystemPrompt({});
const creation = await getSystemPrompt({ isNew: true });
assert.ok(core.includes('Authorship and follow-through'), 'live Git references lack MC authorship update');
assert.ok(creation.includes('Player-facing creation flow'), 'live Git references lack creation update');
assert.equal(lifecycleIntent('done for tonight'), 'end');
assert.equal(lifecycleIntent('save progress'), 'save');
const clarification = buildClarificationAdjudicationText({
  originalPlayerText: 'I actively read one of them.',
  exchanges: [
    { question: 'What do you want to learn?', answer: 'Whether they are involved.' },
    { question: 'Which person?', answer: 'The one closest.' },
  ],
});
assert.match(clarification, /Whether they are involved/);
assert.match(clarification, /The one closest/);
console.log(JSON.stringify({ revision: process.env.APP_REVISION, github_branch: process.env.GITHUB_BRANCH, authorship: true, creation: true, lifecycle: true, clarification: true }));
