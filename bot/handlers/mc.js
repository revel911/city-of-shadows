import Anthropic from '@anthropic-ai/sdk';
import { readFile, readJSON } from './github.js';

const MODEL = 'claude-sonnet-4-6';
const MAX_TOKENS = 4096;
const EVENT_TAIL_LINES = 120;

const COMPACT_AT = Number(process.env.COMPACT_AT) || 30;
const KEEP_RECENT = Number(process.env.KEEP_RECENT) || 8;
const SUMMARY_MAX_TOKENS = 800;
const SUMMARY_SYSTEM = [
  'Summarize this Urban Shadows session segment for ongoing context.',
  'Capture: scene shifts and locations, NPC names and how they spoke (voice notes),',
  'rolls and outcomes, mechanical state changes (harm, XP, circles, debts),',
  'promises and threats still open, mood.',
  'Be terse, concrete, and chronological. No flavor prose.',
].join(' ');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

let _systemCache = null;

async function loadSystemPrompt() {
  const parts = await Promise.all([
    readFile('mc-reference/mc-instructions.md'),
    readFile('mc-reference/rules-reference.md'),
    readFile('mc-reference/wod-supplement.md'),
    readFile('mc-reference/npc-personality-engine.md'),
    readFile('mc-reference/state-schema.md'),
    readFile('mc-reference/bot-output-format.md'),
  ]);
  const sections = [
    parts[0] && `# MC Instructions\n\n${parts[0]}`,
    parts[1] && `# Rules Reference\n\n${parts[1]}`,
    parts[2] && `# WoD Supplement\n\n${parts[2]}`,
    parts[3] && `# NPC Personality Engine\n\n${parts[3]}`,
    parts[4] && `# state.json Schema\n\n${parts[4]}`,
    parts[5] && `# Bot Output Format\n\n${parts[5]}`,
  ].filter(Boolean);
  return sections.join('\n\n---\n\n');
}

export async function getSystemPrompt() {
  if (!_systemCache) _systemCache = await loadSystemPrompt();
  return _systemCache;
}

export function resetSystemCache() {
  _systemCache = null;
}

function tail(text, n) {
  if (!text) return '';
  const lines = text.split('\n');
  return lines.slice(-n).join('\n');
}

export async function buildOpeningContext(player) {
  const isNew = player.id === '__new__';

  if (isNew) {
    const [events, worldBible] = await Promise.all([
      readFile('game/events-log.md'),
      readFile('game/world-bible.md'),
    ]);
    return [
      `New player: Discord display name "${player.name}".`,
      'This is a new character. Walk them through onboarding per the MC instructions:',
      'playbook selection → stats → moves → gear → debts/circles → opening scene.',
      'At session close, emit the bot output close block with handoff, state_patch, and any world-visible events.',
      '',
      '--- RECENT WORLD EVENTS (tail) ---',
      tail(events, EVENT_TAIL_LINES) || '(empty)',
      '',
      '--- WORLD BIBLE (excerpt) ---',
      (worldBible || '').slice(0, 4000) || '(none)',
      '',
      'Begin onboarding now.',
    ].join('\n');
  }

  const [handoff, sheet, state, events, interactions] = await Promise.all([
    readFile(`players/${player.id}/handoff.md`),
    readFile(`players/${player.id}/sheet.md`),
    readJSON(`players/${player.id}/state.json`),
    readFile('game/events-log.md'),
    readJSON('game/interactions.json'),
  ]);

  return [
    `Returning player: ${player.name} (id: ${player.id}).`,
    'Read the documents below, then drop the player into the scene where the last handoff left off.',
    '',
    '--- HANDOFF ---',
    handoff || '(none — treat as first scene for this character)',
    '',
    '--- CHARACTER SHEET ---',
    sheet || '(none)',
    '',
    '--- STATE (state.json) ---',
    state ? JSON.stringify(state, null, 2) : '(none)',
    '',
    '--- RECENT WORLD EVENTS (tail) ---',
    tail(events, EVENT_TAIL_LINES) || '(empty)',
    '',
    '--- INTERACTION QUEUE ---',
    interactions ? JSON.stringify(interactions, null, 2) : '(empty)',
    '',
    'Begin the scene.',
  ].join('\n');
}

function withCacheBreakpoints(messages) {
  // Cache the opening context (always at index 0 — opening user message that
  // contains the handoff/sheet/state/events tail). Stable across the session,
  // so every turn after the first pays ~10% of input cost on it.
  return messages.map((m, i) => {
    if (i !== 0) return m;
    const text = typeof m.content === 'string' ? m.content : null;
    if (text === null) return m;
    return {
      role: m.role,
      content: [{ type: 'text', text, cache_control: { type: 'ephemeral' } }],
    };
  });
}

function messageToText(m) {
  if (typeof m.content === 'string') return m.content;
  if (Array.isArray(m.content)) {
    return m.content.filter(b => b.type === 'text').map(b => b.text).join('\n');
  }
  return '';
}

async function maybeCompact(session) {
  if (session.messages.length < COMPACT_AT) return;
  const head = session.messages[0];
  const middle = session.messages.slice(1, -KEEP_RECENT);
  const recent = session.messages.slice(-KEEP_RECENT);
  if (!middle.length) return;

  const transcript = middle
    .map(m => `${m.role.toUpperCase()}: ${messageToText(m)}`)
    .join('\n\n');

  try {
    const resp = await anthropic.messages.create({
      model: MODEL,
      system: SUMMARY_SYSTEM,
      messages: [{ role: 'user', content: `Transcript to summarize:\n\n${transcript}` }],
      max_tokens: SUMMARY_MAX_TOKENS,
    });
    const text = resp.content.filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
    if (!text) return;
    // Summary goes in as an assistant message so alternation stays valid:
    // [user head, assistant recap, user, assistant, ...]
    session.messages = [
      head,
      { role: 'assistant', content: `[Earlier this session — compacted recap]\n${text}` },
      ...recent,
    ];
    console.log(`[compact] session ${session.threadId}: compressed ${middle.length} turns, now ${session.messages.length} messages.`);
  } catch (e) {
    console.warn(`[compact] failed for session ${session.threadId}: ${e.message}`);
  }
}

export async function generate(session) {
  await maybeCompact(session);
  const system = await getSystemPrompt();
  const resp = await anthropic.messages.create({
    model: MODEL,
    system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
    messages: withCacheBreakpoints(session.messages),
    max_tokens: MAX_TOKENS,
  });
  const u = resp.usage || {};
  console.log(
    `[mc] thread=${session.threadId} msgs=${session.messages.length} ` +
    `in=${u.input_tokens || 0} out=${u.output_tokens || 0} ` +
    `cache_create=${u.cache_creation_input_tokens || 0} ` +
    `cache_read=${u.cache_read_input_tokens || 0}`
  );
  return resp.content
    .filter(b => b.type === 'text')
    .map(b => b.text)
    .join('\n');
}
