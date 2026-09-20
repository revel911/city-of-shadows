import OpenAI from 'openai';
import { readFile, writeFile } from 'node:fs/promises';

const arg = name => { const index = process.argv.indexOf(name); return index < 0 ? null : process.argv[index + 1]; };
let bundle;
if (arg('--bundle')) {
  bundle = JSON.parse(await readFile(arg('--bundle'), 'utf8'));
} else {
  const root = new URL('../../', import.meta.url);
  const read = path => readFile(new URL(path, root), 'utf8');
  const corePaths = ['MECHANICS-CONTRACT.md', 'mc-instructions.md', 'scene-engine.md', 'reference/basic-moves.md', 'npc-personality-engine.md', 'bot-output-format.md'];
  const core = (await Promise.all(corePaths.map(path => read(`mc-reference/${path}`)))).join('\n\n---\n\n');
  const creation = (await Promise.all(['character-creation.md', 'character-sheet-template.md', 'reference/playbooks.md'].map(path => read(`mc-reference/${path}`)))).join('\n\n---\n\n');
  const scenarios = JSON.parse(await read('bot/eval/narrator-scenarios.json'));
  const { buildSceneDirectorContext } = await import('../handlers/scene-director.js');
  for (const scenario of scenarios) {
    const messages = scenario.messages || [{ role: 'user', content: scenario.prompt }];
    const last = messages.at(-1);
    // Historical mechanics classification fixtures have their own routing contract.
    if (scenario.id.startsWith('envelope_')) last.content = buildSceneDirectorContext({ playerText: last.content }) + '\n\n' + last.content;
    scenario.messages = messages;
  }
  bundle = { core, creation, scenarios };
}
if (arg('--export-bundle')) {
  await writeFile(arg('--export-bundle'), JSON.stringify(bundle));
  console.log(`Exported ${bundle.scenarios.length} evaluation scenarios.`);
  process.exit(0);
}
if (!process.env.DEEPSEEK_API_KEY) {
  console.error('DEEPSEEK_API_KEY is required for the opt-in narrator evaluation.');
  process.exit(2);
}
const client = new OpenAI({ baseURL: 'https://api.deepseek.com', apiKey: process.env.DEEPSEEK_API_KEY });
function assess(scenario, text) {
  const missing = scenario.must_include.filter(value => !text.toLowerCase().includes(value.toLowerCase()));
  const visible = text.replace(/<(save_onboarding|close_session|checkpoint)>[\s\S]*?<\/\1>/g, '').trim();
  const forbidden = scenario.must_not_include.filter(value => (['Saved.', 'Session saved'].includes(value) ? visible : text).toLowerCase().includes(value.toLowerCase()));
  for (const pattern of scenario.must_match || []) if (!new RegExp(pattern, 'i').test(text)) missing.push(`pattern ${pattern}`);
  if (scenario.max_characters && visible.length > scenario.max_characters) forbidden.push(`visible text exceeds ${scenario.max_characters} characters`);
  if (scenario.id.startsWith('end_')) {
    try {
      const impact = JSON.parse(text.match(/<world_impact>([\s\S]*?)<\/world_impact>/)?.[1] || 'null');
      if (!impact || !['none', 'personal', 'shared'].includes(impact.level)) missing.push('world_impact.level must be none, personal, or shared');
      if (!/<\/close_session>\s*$/.test(text)) missing.push('trailing close_session');
    } catch { missing.push('valid world_impact JSON'); }
  }
  if (scenario.check_draft) {
    for (const section of ['IDENTITY', 'ARCHETYPE / PLAYBOOK', 'STATS', 'MOVES', 'CIRCLES & STATUS', 'DEBTS', 'ANCHORS', 'GEAR & RESOURCES', 'ADVANCEMENT', 'SPECIAL TRIGGERS', 'NOTES & OPEN QUESTIONS']) {
      if (!text.includes(`## ${section}`)) missing.push(section);
    }
  }
  return { missing, forbidden, passed: Boolean(text.trim()) && !missing.length && !forbidden.length };
}
const report = [];
for (const scenario of bundle.scenarios) {
  if (arg('--filter') && !scenario.id.includes(arg('--filter'))) continue;
  const messages = [{ role: 'system', content: bundle.core + (scenario.creation ? '\n\n' + bundle.creation : '') }, ...scenario.messages];
  const attempts = [];
  // Like the production response gate, allow at most two repair attempts.
  // Keep first-pass failures in the report; do not hide model variability.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    let text = '', error = null;
    try {
      const response = await client.chat.completions.create({
        model: process.env.DEEPSEEK_MODEL || 'deepseek-flash', thinking: { type: 'disabled' },
        temperature: 0, max_tokens: scenario.creation ? 5000 : 1800, messages,
      });
      text = response.choices[0]?.message?.content || '';
    } catch (err) { error = err.message; }
    const result = { ...assess(scenario, text), error, text };
    if (error) result.passed = false;
    attempts.push(result);
    if (result.passed || error || attempt === 2) break;
    console.log(`REPAIR ${scenario.id}: ${[...result.missing, ...result.forbidden].join('; ')}`);
    messages.push({ role: 'assistant', content: '[Rejected draft omitted.]' }, { role: 'user', content:
      `The response failed validation. Missing requirements: ${result.missing.join('; ') || 'none'}. Forbidden content: ${result.forbidden.join('; ') || 'none'}. Re-emit the response, preserving the player agency and save contracts. Keep required hidden blocks. Never claim a save succeeded; the bot supplies that receipt.` });
  }
  const final = attempts.at(-1);
  report.push({ id: scenario.id, ...final, attempts });
  console.log(`${final.passed ? 'PASS' : 'FAIL'} ${scenario.id} (${attempts.length} attempt${attempts.length === 1 ? '' : 's'})`);
}
if (arg('--report')) await writeFile(arg('--report'), JSON.stringify(report, null, 2));
const failures = report.filter(item => !item.passed).length;
const firstPass = report.filter(item => item.attempts[0].passed).length;
console.log(`Narrator eval: ${report.length - failures}/${report.length} passed; ${firstPass}/${report.length} on first attempt.`);
if (failures) process.exitCode = 1;
