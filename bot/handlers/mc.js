import OpenAI from 'openai';
import { readFile, readJSON } from './github.js';
import { readProfile } from './profile.js';
import { buildCanonicalWorldContext, buildRelevantWorldContext } from './world-state.js';

const MODEL = 'deepseek-chat';
const MAX_TOKENS = 4096;
// DeepSeek's recommended temperature for creative/roleplay output (their docs
// map 1.3 to general conversation/creative writing); the summarizer overrides
// this with 0 for faithful, low-variance recaps.
const GENERATE_TEMPERATURE = 1.3;
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

// Constructed lazily: the OpenAI SDK throws at construction if the key is
// absent, so building it at import time would break any context that loads
// this module without DEEPSEEK_API_KEY set (e.g. the test suite).
let _deepseek = null;
function client() {
  if (!_deepseek) {
    _deepseek = new OpenAI({
      baseURL: 'https://api.deepseek.com',
      apiKey: process.env.DEEPSEEK_API_KEY,
    });
  }
  return _deepseek;
}

let _coreSystemCache = null;
const _referenceCache = new Map();

async function labeledFiles(entries) {
  const contents = await Promise.all(entries.map(([, path]) => readFile(path)));
  return contents
    .map((content, index) => content && `# ${entries[index][0]}\n\n${content}`)
    .filter(Boolean)
    .join('\n\n---\n\n');
}

async function loadCoreSystemPrompt() {
  return labeledFiles([
    ['Mechanics Contract', 'mc-reference/MECHANICS-CONTRACT.md'],
    ['MC Instructions', 'mc-reference/mc-instructions.md'],
    ['Scene Engine', 'mc-reference/scene-engine.md'],
    ['Rules — Fundamentals of Play', 'mc-reference/reference/rules.md'],
    ['Basic Moves', 'mc-reference/reference/basic-moves.md'],
    ['MC Moves', 'mc-reference/reference/mc-moves.md'],
    ['NPC Personality Engine', 'mc-reference/npc-personality-engine.md'],
    ['state.json Schema', 'mc-reference/state-schema.md'],
    ['Bot Output Format', 'mc-reference/bot-output-format.md'],
  ]);
}

export function extractPlaybookSection(text, playbook) {
  if (!text || !playbook) return '';
  const heading = String(playbook).replace(/^The\s+/i, '').trim();
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = text.match(new RegExp(`^##\\s+The\\s+${escaped}\\s*$([\\s\\S]*?)(?=^##\\s+|(?![\\s\\S]))`, 'im'));
  return match ? `## The ${heading}${match[1]}`.trim() : '';
}

function wodExtensionSlug(value) {
  const normalized = String(value || '').toLowerCase();
  for (const slug of ['changeling', 'demon', 'hunter', 'mage', 'orpheus', 'slasher', 'vampire', 'werewolf']) {
    if (normalized.includes(slug)) return slug;
  }
  return null;
}

async function loadReferencePack(profile = {}) {
  if (profile.isNew) {
    return labeledFiles([
      ['Character Creation Wizard', 'mc-reference/character-creation.md'],
      ['All Playbooks — creation only', 'mc-reference/reference/playbooks.md'],
      ['WoD — Changeling', 'mc-reference/reference/world-of-darkness/changeling.md'],
      ['WoD — Demon', 'mc-reference/reference/world-of-darkness/demon.md'],
      ['WoD — Hunter', 'mc-reference/reference/world-of-darkness/hunter.md'],
      ['WoD — Mage', 'mc-reference/reference/world-of-darkness/mage.md'],
      ['WoD — Orpheus', 'mc-reference/reference/world-of-darkness/orpheus.md'],
      ['WoD — Slasher', 'mc-reference/reference/world-of-darkness/slasher.md'],
      ['WoD — Vampire', 'mc-reference/reference/world-of-darkness/vampire.md'],
      ['WoD — Werewolf', 'mc-reference/reference/world-of-darkness/werewolf.md'],
    ]);
  }
  const extensionSlug = wodExtensionSlug(profile.wod_extension);
  const [allPlaybooks, extension] = await Promise.all([
    readFile('mc-reference/reference/playbooks.md'),
    extensionSlug ? readFile(`mc-reference/reference/world-of-darkness/${extensionSlug}.md`) : null,
  ]);
  const playbook = extractPlaybookSection(allPlaybooks, profile.playbook);
  return [
    playbook && `# Active Playbook Only\n\n${playbook}`,
    extension && `# Active World of Darkness Extension Only\n\n${extension}`,
  ].filter(Boolean).join('\n\n---\n\n');
}

export async function getSystemPrompt(profile = {}) {
  if (!_coreSystemCache) _coreSystemCache = await loadCoreSystemPrompt();
  const key = profile.isNew
    ? 'new-character'
    : `${profile.playbook || 'unknown'}|${wodExtensionSlug(profile.wod_extension) || 'none'}`;
  if (!_referenceCache.has(key)) _referenceCache.set(key, await loadReferencePack(profile));
  const reference = _referenceCache.get(key);
  return reference ? `${_coreSystemCache}\n\n---\n\n${reference}` : _coreSystemCache;
}

export function resetSystemCache() {
  _coreSystemCache = null;
  _referenceCache.clear();
}

function tail(text, n) {
  if (!text) return '';
  const lines = text.split('\n');
  // Public events are stored newest-first so opening context must read from
  // the beginning, not the historical tail.
  return lines.slice(0, n).join('\n');
}

export function selectInteractionEcho(document, characterId) {
  const interactions = Array.isArray(document?.interactions) ? document.interactions : [];
  return interactions.find(item =>
    item?.status !== 'consumed'
    && (item?.to === characterId || item?.target_character_id === characterId)
  ) || null;
}

async function buildProfileContext(player) {
  const profile = player.discord_id ? await readProfile(player.discord_id) : null;
  if (profile) {
    const hard = (profile.safety?.hard_limits || []).join('; ') || '(none)';
    const soft = (profile.safety?.soft_limits || []).join('; ') || '(none)';
    const playstyle = profile.inferred_playstyle?.scores || {};
    const observed = Object.entries(playstyle)
      .filter(([, score]) => Number(score) > 0)
      .sort(([, a], [, b]) => Number(b) - Number(a))
      .slice(0, 3)
      .map(([mode, score]) => `${mode}:${score}`)
      .join(', ') || '(not enough evidence yet)';
    return [
      '--- PLAYER PROFILE ---',
      `Discord ID: ${profile.discord_id}`,
      `Display name: ${profile.display_name || '(unknown)'}`,
      'Safety:',
      `  Hard limits: ${hard}`,
      `  Soft limits: ${soft}`,
      `Mechanics depth: ${profile.mechanics_depth} (apply the 5-level rubric from mc-instructions.md)`,
      `Observed play tendencies: ${observed}. These are soft steering signals learned from play; the current action overrides them. Never treat them as consent or as permission to introduce romance.`,
    ].join('\n');
  }
  return [
    '--- PLAYER PROFILE ---',
    `FIRST-TIME PLAYER (Discord ID: ${player.discord_id || '(unknown)'}, display name: "${player.name}").`,
    'No profile.json exists yet. Run the player-onboarding phase (see mc-instructions.md)',
    'BEFORE character creation. Emit a <save_player> block at the end of onboarding.',
  ].join('\n');
}

export async function buildOpeningContext(player) {
  const isNew = player.id === '__new__';
  const profileContext = await buildProfileContext(player);

  if (isNew) {
    const [events, worldBible, worldContext] = await Promise.all([
      readFile('game/events-log.md'),
      readFile('game/world-bible.md'),
      buildCanonicalWorldContext(),
    ]);
    return [
      `New player: Discord display name "${player.name}".`,
      profileContext,
      '',
      'This is a new character. Walk them through onboarding by following',
      '`mc-reference/character-creation.md` phase-by-phase (already in your',
      'context). At session close, emit the close block with the full sheet,',
      'initial state_patch, npc_patch for any NPCs introduced, and the first',
      'handoff.',
      '',
      '--- RECENT WORLD EVENTS (tail) ---',
      tail(events, EVENT_TAIL_LINES) || '(empty)',
      '',
      '--- WORLD BIBLE (excerpt) ---',
      (worldBible || '').slice(0, 4000) || '(none)',
      '',
      worldContext,
      '',
      'Begin onboarding now.',
    ].join('\n');
  }

  const [handoff, sheet, state, checkpoint, events, interactions] = await Promise.all([
    readFile(`players/${player.id}/handoff.md`),
    readFile(`players/${player.id}/sheet.md`),
    readJSON(`players/${player.id}/state.json`),
    readJSON(`players/${player.id}/checkpoint.json`),
    readFile('game/events-log.md'),
    readJSON('game/interactions.json'),
  ]);
  const worldContext = await buildRelevantWorldContext({
    characterId: player.id,
    state: state || {},
    handoff: handoff || '',
  });
  const interactionEcho = selectInteractionEcho(interactions, player.id);

  return [
    `Returning player: ${player.name} (id: ${player.id}).`,
    profileContext,
    '',
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
    '--- INTERRUPTED SESSION CHECKPOINT ---',
    checkpoint?.active ? JSON.stringify(checkpoint, null, 2) : '(none)',
    '',
    '--- RECENT WORLD EVENTS (tail) ---',
    tail(events, EVENT_TAIL_LINES) || '(empty)',
    '',
    '--- ONE RELEVANT PLAYER ECHO ---',
    interactionEcho
      ? `${JSON.stringify(interactionEcho, null, 2)}\nSurface this once, naturally, when it fits the opening scene.`
      : '(none)',
    '',
    worldContext,
    '',
    'Begin the scene.',
  ].join('\n');
}

// DeepSeek does automatic disk-based context caching keyed on the longest
// shared prefix, so no explicit cache breakpoints are needed: the stable
// system prompt + opening user message are cached transparently across turns.

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
    const resp = await client().chat.completions.create({
      model: MODEL,
      messages: [
        { role: 'system', content: SUMMARY_SYSTEM },
        { role: 'user', content: `Transcript to summarize:\n\n${transcript}` },
      ],
      max_tokens: SUMMARY_MAX_TOKENS,
      temperature: 0,
    });
    const text = (resp.choices[0]?.message?.content || '').trim();
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

export async function generate(session, { maxTokens = MAX_TOKENS, temperature = GENERATE_TEMPERATURE } = {}) {
  await maybeCompact(session);
  const system = await getSystemPrompt(session.rulesProfile || {});
  const resp = await client().chat.completions.create({
    model: MODEL,
    messages: [{ role: 'system', content: system }, ...session.messages],
    max_tokens: maxTokens,
    temperature,
  });
  const u = resp.usage || {};
  console.log(
    `[mc] thread=${session.threadId} msgs=${session.messages.length} ` +
    `in=${u.prompt_tokens || 0} out=${u.completion_tokens || 0} ` +
    `cache_hit=${u.prompt_cache_hit_tokens || 0} ` +
    `cache_miss=${u.prompt_cache_miss_tokens || 0}`
  );
  return resp.choices[0]?.message?.content || '';
}
