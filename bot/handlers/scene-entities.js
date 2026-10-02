// Session ledger of every entity that has appeared, named or not. The MC
// reports changes in a hidden block; the bot keeps the merged list and shows
// it back each turn so departed entities do not silently reappear.
const BLOCK_RE = /<scene_entities>([\s\S]*?)<\/scene_entities>/g;
const UNTERMINATED_RE = /<scene_entities>(?![\s\S]*<\/scene_entities>)[\s\S]*$/;
const STATUSES = ['present', 'left', 'gone', 'dead'];
const MAX_ENTITIES = 40;

function slug(value) {
  return String(value || '').normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 80);
}

const field = (value, limit) => typeof value === 'string' ? value.trim().slice(0, limit) : '';

function normalize(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const label = field(raw.label, 160);
  const key = slug(raw.key) || slug(label);
  if (!key) return null;
  const status = field(raw.status, 20).toLowerCase();
  return {
    key,
    label,
    where: field(raw.where, 160),
    wants: field(raw.wants, 200),
    status: STATUSES.includes(status) ? status : '',
  };
}

export function parseSceneEntities(text) {
  if (typeof text !== 'string') return null;
  const blocks = [...text.matchAll(BLOCK_RE)];
  if (!blocks.length) return null;
  const updates = [];
  for (const [, body] of blocks) {
    try {
      const raw = JSON.parse(body.trim());
      for (const item of Array.isArray(raw) ? raw : [raw]) {
        const entry = normalize(item);
        if (entry) updates.push(entry);
      }
    } catch { /* a malformed block is dropped, never shown */ }
  }
  return updates.length ? updates : null;
}

export function stripSceneEntities(text) {
  return typeof text === 'string'
    ? text.replace(BLOCK_RE, '').replace(UNTERMINATED_RE, '').trim()
    : text;
}

// Updates name only what changed; blank fields keep the earlier value.
export function mergeSceneEntities(list = [], updates = []) {
  const merged = (Array.isArray(list) ? list : []).map(entry => ({ ...entry }));
  for (const update of updates || []) {
    const existing = merged.find(entry => entry.key === update.key);
    if (existing) {
      for (const name of ['label', 'where', 'wants', 'status']) if (update[name]) existing[name] = update[name];
    } else {
      merged.push({ ...update, label: update.label || update.key, status: update.status || 'present' });
    }
  }
  while (merged.length > MAX_ENTITIES) {
    const departed = merged.findIndex(entry => entry.status !== 'present');
    merged.splice(departed === -1 ? 0 : departed, 1);
  }
  return merged;
}

export function formatSceneEntitiesContext(list = []) {
  const lines = (Array.isArray(list) ? list : []).map(entry => [
    `- ${entry.label}`,
    entry.where,
    entry.wants ? `wants: ${entry.wants}` : '',
    entry.status,
  ].filter(Boolean).join(' — '));
  return [
    '[SYSTEM — ENTITIES THIS SESSION]',
    ...(lines.length ? lines : ['(none yet)']),
    'Check this list before anyone appears or is described. Someone who left, is gone, or is dead needs an on-screen reason to return; never place them back silently.',
    'If the player questions an earlier detail you cannot support from this thread, the records, or this list, step out with "(MC check: …)", admit it, and follow the Continuity Check rule instead of defending it.',
    'When any entity (named or unnamed) appears, leaves, changes location or want, or dies, append a hidden <scene_entities>[{"key","label","where","wants","status"}]</scene_entities> block with only the changed entries. status is present, left, gone, or dead.',
  ].join('\n');
}
