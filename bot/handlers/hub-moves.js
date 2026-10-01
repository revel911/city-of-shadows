// bot/handlers/hub-moves.js
import { readFile, readJSON } from './github.js';
// Hub Markdown is the single owner of hub moves; this module only reads it.
const STATS = ['Blood', 'Heart', 'Mind', 'Spirit'];
const CIRCLES = ['Mortalis', 'Night', 'Power', 'Wild'];

function canonical(value, names) {
  const normalized = String(value || '').trim().toLowerCase();
  return names.find(name => name.toLowerCase() === normalized) || null;
}

function hubMovesSection(markdown) {
  const text = String(markdown || '');
  const heading = /^##\s+Hub Moves\s*$/im.exec(text);
  if (!heading) return '';
  const rest = text.slice(heading.index + heading[0].length);
  const end = /^##\s+(?!#)/m.exec(rest);
  return rest.slice(0, end ? end.index : rest.length);
}

function parseRoll(body) {
  const labelled = body.match(/^\*\*Roll:\*\*\s*\+?([A-Za-z]+)/im)?.[1];
  const inline = body.match(/\broll(?:\s+with)?\s+\+?([A-Za-z]+)/i)?.[1];
  const key = labelled || inline;
  const deferred = /\broll(?:\s+with)?\s+\+?[A-Za-z]+\s+when time passes/i.test(body);
  const stat = canonical(key, STATS);
  const circle = canonical(key, CIRCLES);
  return {
    modifier_type: stat ? 'stat' : circle ? 'circle' : null,
    modifier_key: stat,
    circle,
    rollable: Boolean((stat || circle) && !deferred),
  };
}

export function extractHubMoves(markdown, hubId) {
  const section = hubMovesSection(markdown);
  if (!section) return [];
  const moves = [];
  const blocks = section.split(/^###\s+/m).slice(1);
  for (const block of blocks) {
    const [rawName, ...lines] = block.split(/\r?\n/);
    const name = rawName.trim();
    const body = lines.join('\n').replace(/\n---\s*$/m, '').trim();
    if (!name || !body) continue;
    const trigger = (body.match(/^\*\*Trigger:\*\*\s*(.+)$/im)?.[1]
      || body.split(/\r?\n/).find(line => /^When\b/i.test(line.trim()))
      || '').trim();
    moves.push({ hub_id: hubId, name, trigger, ...parseRoll(body), text: body });
  }
  return moves;
}

let _hubMovesCache = null;

export function resetHubMovesCache() {
  _hubMovesCache = null;
}

// Hub Markdown changes by commit, not mid-session, so one read per process
// (or per resetSystemCache) is enough. Always resolves to an array.
export async function loadHubMoves({ read = readFile, readIndex = readJSON } = {}) {
  if (_hubMovesCache) return _hubMovesCache;
  const loaded = await readIndex('hubs/index.json');
  const index = Array.isArray(loaded) ? loaded : [];
  const files = await Promise.all(index.map(async hub => {
    try {
      return [hub, await read(`hubs/${hub.file}`)];
    } catch {
      return [hub, null];
    }
  }));
  _hubMovesCache = files.flatMap(([hub, markdown]) => (markdown ? extractHubMoves(markdown, hub.id) : []));
  return _hubMovesCache;
}
