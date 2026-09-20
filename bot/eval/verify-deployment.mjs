import assert from 'node:assert/strict';
import { getSystemPrompt } from '../handlers/mc.js';
import { lifecycleIntent } from '../handlers/lifecycle.js';

const expected = process.argv[2];
if (expected) assert.equal(process.env.APP_REVISION, expected, 'deployed image revision differs from Git');
const core = await getSystemPrompt({});
const creation = await getSystemPrompt({ isNew: true });
assert.ok(core.includes('Authorship and follow-through'), 'live Git references lack MC authorship update');
assert.ok(creation.includes('Player-facing creation flow'), 'live Git references lack creation update');
assert.equal(lifecycleIntent('done for tonight'), 'end');
assert.equal(lifecycleIntent('save progress'), 'save');
console.log(JSON.stringify({ revision: process.env.APP_REVISION, github_branch: process.env.GITHUB_BRANCH, authorship: true, creation: true, lifecycle: true }));
