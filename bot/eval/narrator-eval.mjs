import OpenAI from 'openai';
import { readFile } from 'node:fs/promises';

if (!process.env.DEEPSEEK_API_KEY) {
  console.error('DEEPSEEK_API_KEY is required for the opt-in narrator evaluation.');
  process.exit(2);
}

const root = new URL('../../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');
const [contract, instructions, sceneEngine, moves, personality, output, scenariosText] = await Promise.all([
  read('mc-reference/MECHANICS-CONTRACT.md'),
  read('mc-reference/mc-instructions.md'),
  read('mc-reference/scene-engine.md'),
  read('mc-reference/reference/basic-moves.md'),
  read('mc-reference/npc-personality-engine.md'),
  read('mc-reference/bot-output-format.md'),
  read('bot/eval/narrator-scenarios.json'),
]);
const scenarios = JSON.parse(scenariosText);
const system = [contract, instructions, sceneEngine, moves, personality, output].join('\n\n---\n\n');
const client = new OpenAI({
  baseURL: 'https://api.deepseek.com',
  apiKey: process.env.DEEPSEEK_API_KEY,
});

let failures = 0;
for (const scenario of scenarios) {
  const response = await client.chat.completions.create({
    model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
    temperature: 0,
    max_tokens: 1600,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: scenario.prompt },
    ],
  });
  const text = response.choices[0]?.message?.content || '';
  const missing = scenario.must_include.filter(value => !text.toLowerCase().includes(value.toLowerCase()));
  const forbidden = scenario.must_not_include.filter(value => text.toLowerCase().includes(value.toLowerCase()));
  const passed = missing.length === 0 && forbidden.length === 0;
  if (!passed) failures += 1;
  console.log(`${passed ? 'PASS' : 'FAIL'} ${scenario.id}`);
  if (missing.length) console.log(`  missing: ${missing.join(', ')}`);
  if (forbidden.length) console.log(`  forbidden: ${forbidden.join(', ')}`);
}

console.log(`Narrator eval: ${scenarios.length - failures}/${scenarios.length} passed.`);
if (failures) process.exitCode = 1;
