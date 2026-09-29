import assert from 'node:assert/strict';
import { getSystemPrompt } from '../handlers/mc.js';
import { readJSON } from '../handlers/github.js';
import { guardCityTurnOutput, buildScenePressureCandidates } from '../handlers/narrative-state.js';
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
assert.ok(core.includes('pressure_stage'), 'live references lack concrete arc-stage guidance');
const [arcs, mysteries, memories] = await Promise.all([
  readJSON('game/arcs.json'), readJSON('game/mysteries.json'), readJSON('game/npc-character-memory.json'),
]);
assert.ok(arcs.arcs.every(arc => arc.pressure_stage && arc.next_pressure), 'live arcs lack reviewed opportunities');
assert.ok(mysteries.mysteries.some(item => item.id === 'mystery_creighton_pantry_records'), 'live mystery missing');
assert.ok(memories.memories.some(item => item.id === 'memory_aldridge__cristoff_lepierre'), 'live recovered memory missing');
assert.equal(guardCityTurnOutput({events_append:'unexpected'}, null).events_append, null);
assert.ok(buildScenePressureCandidates({arcs:arcs.arcs}).length);
console.log(JSON.stringify({ revision: process.env.APP_REVISION, github_branch: process.env.GITHUB_BRANCH, authorship: true, creation: true, lifecycle: true, clarification: true, pressure_stages: true, mystery: true, npc_memory: true, keeper_guard: true }));
