import { readFile } from 'node:fs/promises';
import { adjudicateMove } from '../handlers/mc.js';

if (!process.env.DEEPSEEK_API_KEY) {
  console.error('DEEPSEEK_API_KEY is required for the opt-in move adjudicator evaluation.');
  process.exit(2);
}

const root = new URL('../../', import.meta.url);
const [sheet, scenariosText] = await Promise.all([
  readFile(new URL('players/jacob-boone/sheet.md', root), 'utf8'),
  readFile(new URL('bot/eval/move-adjudicator-scenarios.json', root), 'utf8'),
]);
const scenarios = JSON.parse(scenariosText);
let failures = 0;

for (const scenario of scenarios) {
  const actual = await adjudicateMove({
    playerText: scenario.player_text,
    lastAssistant: scenario.last_assistant,
    sheet,
  });
  const expected = scenario.expected;
  const expectation = actual.expectation || {};
  const passed = actual.decision === expected.decision
    && (!expected.move || expectation.move === expected.move)
    && (!expected.circle || expectation.circle === expected.circle);
  if (!passed) failures += 1;
  console.log(`${passed ? 'PASS' : 'FAIL'} ${scenario.id}`);
  if (!passed) console.log('  expected:', expected, 'actual:', actual);
}

console.log(`Move adjudicator eval: ${scenarios.length - failures}/${scenarios.length} passed.`);
if (failures) process.exitCode = 1;
