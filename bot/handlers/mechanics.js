export const STAT_NAMES = ['Blood', 'Heart', 'Mind', 'Spirit'];
export const CIRCLE_NAMES = ['Mortalis', 'Night', 'Power', 'Wild'];

export const BASIC_MOVE_MODIFIERS = Object.freeze({
  'turn to violence': { type: 'stat', key: 'Blood' },
  'escape a situation': { type: 'stat', key: 'Blood' },
  'persuade an npc': { type: 'stat', key: 'Heart' },
  'figure someone out': { type: 'stat', key: 'Mind' },
  'mislead, distract, or trick': { type: 'stat', key: 'Mind' },
  'keep your cool': { type: 'stat', key: 'Spirit' },
  'let it out': { type: 'stat', key: 'Spirit' },
  'lend a hand or get in the way': { type: 'circle' },
  'put a name to a face': { type: 'circle' },
  'hit the streets': { type: 'circle' },
  'study a place of power': { type: 'circle' },
  'refuse to honor a debt': { type: 'status_difference' },
});

function normalizedMove(move) {
  return String(move || '').trim().toLowerCase();
}

function integer(value, fallback = 0) {
  return Number.isInteger(value) ? value : fallback;
}

export function parseRollRequest(text) {
  if (typeof text !== 'string') return null;
  const match = text.match(/<roll_request>([\s\S]*?)<\/roll_request>/);
  if (!match) return null;
  try {
    const raw = JSON.parse(match[1].trim());
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const move = String(raw.move || '').trim();
    if (!move) return null;
    const canonical = BASIC_MOVE_MODIFIERS[normalizedMove(move)] || null;
    const modifierType = raw.modifier_type || canonical?.type || 'stat';
    const modifierKey = raw.modifier_key || canonical?.key || null;
    const circle = CIRCLE_NAMES.includes(raw.circle) ? raw.circle : null;
    return {
      move,
      modifier_type: modifierType,
      modifier_key: modifierKey,
      circle,
      forward: Math.max(-3, Math.min(3, integer(raw.forward))),
      actor_status: integer(raw.actor_status),
      creditor_status: integer(raw.creditor_status),
      reason: typeof raw.reason === 'string' ? raw.reason.trim().slice(0, 240) : '',
    };
  } catch {
    return null;
  }
}

export function stripRollRequest(text) {
  return typeof text === 'string'
    ? text.replace(/<roll_request>[\s\S]*?<\/roll_request>/g, '').trim()
    : '';
}

export function resolveModifier(request, state = {}) {
  const moveKey = normalizedMove(request?.move);
  const configured = state.playbook_state?.move_modifiers || {};
  const overrideKey = Object.keys(configured).find(key => normalizedMove(key) === moveKey);
  const override = overrideKey ? configured[overrideKey] : null;
  const canonical = BASIC_MOVE_MODIFIERS[moveKey] || null;
  const type = override?.type || canonical?.type || request?.modifier_type;
  const key = override?.key || canonical?.key || request?.modifier_key;
  if (type === 'circle') {
    const circle = request.circle || key;
    if (!CIRCLE_NAMES.includes(circle)) throw new Error('This roll needs a valid Circle.');
    return { value: integer(state.circle_ratings?.[circle]), type, key: circle };
  }
  if (type === 'status_difference') {
    const actor = CIRCLE_NAMES.includes(request.circle)
      ? integer(state.circle_status?.[request.circle])
      : integer(request.actor_status);
    const creditor = integer(request.creditor_status);
    return { value: actor - creditor, type, key: 'Status difference' };
  }
  if (!STAT_NAMES.includes(key)) throw new Error('This roll needs a valid stat.');
  return { value: integer(state.stats?.[key]), type: 'stat', key };
}

export function classifyRoll(total) {
  if (total >= 10) return 'strong_hit';
  if (total >= 7) return 'weak_hit';
  return 'miss';
}

export function createRollRecord({
  request,
  state,
  instinct,
  other,
  sessionId,
  characterId,
  rolledAt = new Date().toISOString(),
}) {
  if (![instinct, other].every(die => Number.isInteger(die) && die >= 1 && die <= 6)) {
    throw new Error('Dice must be integers from 1 to 6.');
  }
  const source = resolveModifier(request, state);
  const baseModifier = source.value;
  const forward = integer(request.forward);
  const modifier = Math.max(-3, Math.min(4, baseModifier + forward));
  const rawTotal = instinct + other;
  const total = rawTotal + modifier;
  const result = classifyRoll(total);
  return {
    id: `roll_${String(sessionId || 'session').replace(/[^a-zA-Z0-9_-]/g, '_')}_${Date.parse(rolledAt) || Date.now()}`,
    session_id: sessionId || '',
    character_id: characterId || state.character_id || '',
    move: request.move,
    modifier_type: source.type,
    modifier_key: source.key,
    circle: request.circle || null,
    instinct_die: instinct,
    other_die: other,
    raw_total: rawTotal,
    base_modifier: baseModifier,
    forward,
    modifier,
    total,
    result,
    extreme_failure: result === 'miss' && instinct === 1,
    rolled_at: rolledAt,
  };
}

export function formatRoll(record, depth = 3) {
  const result = record.result === 'strong_hit'
    ? 'strong hit'
    : record.result === 'weak_hit' ? 'mixed hit' : 'miss';
  const extreme = record.extreme_failure ? ' — Instinct complication triggered' : '';
  if (depth >= 5) return 'Fate check recorded. The consequences will appear in the fiction.';
  if (depth === 4) return `Fate check: **${result}**${extreme}.`;
  if (depth === 3) return `🎲 **${record.instinct_die}** · **${record.other_die}** ${record.modifier >= 0 ? '+' : '−'} ${Math.abs(record.modifier)} → **${record.total}**, ${result}${extreme}.`;
  if (depth === 2) return `🎲 ${record.instinct_die} (Instinct) + ${record.other_die} + ${record.modifier} = **${record.total}** — **${result}**${extreme}.`;
  return [
    `🎲 **${record.move}** using **${record.modifier_key || record.modifier_type}**`,
    `Dice: ${record.instinct_die} (Instinct) + ${record.other_die}; modifier ${record.modifier >= 0 ? '+' : ''}${record.modifier}; total **${record.total}**.`,
    `Outcome: **${result}**${extreme}.`,
  ].join('\n');
}

export function nextSessionId(current) {
  const match = String(current || '').match(/^session_(\d+)$/);
  const number = match ? Number(match[1]) + 1 : 1;
  return `session_${String(number).padStart(3, '0')}`;
}

function clamp(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

function validNumericMap(source, names, min, max, fallback = {}) {
  return Object.fromEntries(names.map(name => [
    name,
    clamp(source?.[name], min, max, integer(fallback?.[name])),
  ]));
}

export function reconcileCharacterState(current = {}, patch = {}, {
  characterId,
  activeArcIds,
  rolls = [],
} = {}) {
  const warnings = [];
  const merged = { ...current, ...patch };
  merged.character_id = characterId || current.character_id || patch.character_id || '';
  merged.stats = validNumericMap(
    { ...(current.stats || {}), ...(patch.stats || {}) },
    STAT_NAMES,
    -3,
    4,
    current.stats
  );
  merged.harm = clamp(merged.harm, 0, 5, integer(current.harm));
  merged.corrupt = clamp(merged.corrupt, 0, 5, integer(current.corrupt));
  merged.xp = clamp(merged.xp, 0, 7, integer(current.xp));
  merged.advances = Math.max(0, integer(merged.advances, integer(current.advances)));
  merged.circle_ratings = validNumericMap(
    { ...(current.circle_ratings || {}), ...(patch.circle_ratings || {}) },
    CIRCLE_NAMES,
    -3,
    4,
    current.circle_ratings
  );
  merged.circle_status = validNumericMap(
    { ...(current.circle_status || {}), ...(patch.circle_status || {}) },
    CIRCLE_NAMES,
    -5,
    5,
    current.circle_status
  );
  merged.circle_marks = Object.fromEntries(CIRCLE_NAMES.map(name => [
    name,
    Boolean(patch.circle_marks?.[name] ?? current.circle_marks?.[name] ?? false),
  ]));
  for (const roll of rolls) {
    if (roll.circle && CIRCLE_NAMES.includes(roll.circle)) merged.circle_marks[roll.circle] = true;
  }
  if (CIRCLE_NAMES.every(name => merged.circle_marks[name])) {
    merged.circle_marks = Object.fromEntries(CIRCLE_NAMES.map(name => [name, false]));
    merged.advances += 1;
    warnings.push('all four Circles marked; cleared marks and granted one advance');
  }
  merged.gear = Array.isArray(merged.gear) ? merged.gear.map(String) : [];
  merged.active_arc_ids = [...new Set(Array.isArray(activeArcIds)
    ? activeArcIds
    : Array.isArray(merged.active_arc_ids) ? merged.active_arc_ids : [])].sort();
  merged.last_session = nextSessionId(current.last_session);
  merged.playbook_state = {
    ...(current.playbook_state && typeof current.playbook_state === 'object' ? current.playbook_state : {}),
    ...(patch.playbook_state && typeof patch.playbook_state === 'object' ? patch.playbook_state : {}),
  };
  const effects = {
    ...(current.effects && typeof current.effects === 'object' ? current.effects : {}),
    ...(patch.effects && typeof patch.effects === 'object' ? patch.effects : {}),
  };
  merged.effects = effects && typeof effects === 'object' && !Array.isArray(effects)
    ? {
        holds: Array.isArray(effects.holds) ? effects.holds : [],
        forward: Array.isArray(effects.forward) ? effects.forward : [],
        ongoing: Array.isArray(effects.ongoing) ? effects.ongoing : [],
      }
    : { holds: [], forward: [], ongoing: [] };
  if (patch.last_session && patch.last_session !== merged.last_session) {
    warnings.push(`last_session is bot-owned; wrote ${merged.last_session}`);
  }
  if (patch.active_arc_ids) warnings.push('active_arc_ids is derived from game/arcs.json');
  return { state: merged, warnings };
}

export function deriveActiveArcIds(arcsDoc, characterId) {
  return (arcsDoc?.arcs || [])
    .filter(arc => Array.isArray(arc.character_ids)
      && arc.character_ids.includes(characterId)
      && !['resolved', 'closed', 'failed'].includes(arc.status))
    .map(arc => arc.id)
    .sort();
}

export function reconcileArcs(doc, patches = [], {
  characterId,
  sessionId,
  stamp,
  conflicts = [],
} = {}) {
  const next = { ...(doc || {}), arcs: [...(doc?.arcs || [])] };
  const touched = new Set();
  for (const raw of Array.isArray(patches) ? patches : []) {
    const body = raw?.changes && typeof raw.changes === 'object' && !Array.isArray(raw.changes) ? raw.changes : raw;
    const id = raw?.id || body?.id;
    if (!id || !String(id).startsWith('arc-')) {
      throw new Error(`${raw?.id || '(missing id)'} must start with arc-`);
    }
    const index = next.arcs.findIndex(arc => arc.id === id);
    const existing = index >= 0 ? next.arcs[index] : { id, character_ids: [], revision: 0 };
    const currentRevision = Number.isInteger(existing.revision) ? existing.revision : 0;
    if (index >= 0 && Number.isInteger(raw.expected_revision) && raw.expected_revision !== currentRevision) {
      const fields = Object.keys(body || {}).filter(key => key !== 'id' && JSON.stringify(existing[key]) !== JSON.stringify(body[key]));
      conflicts.push({ entity_id: id, expected_revision: raw.expected_revision, actual_revision: currentRevision, fields, proposed_changes: Object.fromEntries(fields.map(key => [key, body[key]])), session_id: sessionId });
      continue;
    }
    const arc = { ...existing, ...body, id };
    arc.character_ids = [...new Set(Array.isArray(arc.character_ids) ? arc.character_ids : [])];
    arc.escalation = clamp(arc.escalation, 0, 4, integer(existing.escalation, 0));
    arc.ignored_sessions = 0;
    arc.last_touched_session = sessionId;
    arc.last_updated = stamp;
    arc.revision = currentRevision + 1;
    if (index >= 0) next.arcs[index] = arc;
    else next.arcs.push(arc);
    touched.add(id);
  }
  for (let i = 0; i < next.arcs.length; i += 1) {
    const arc = next.arcs[i];
    if (touched.has(arc.id) || !arc.character_ids?.includes(characterId)
        || ['resolved', 'closed', 'failed'].includes(arc.status)) continue;
    const ignored = integer(arc.ignored_sessions) + 1;
    const escalates = ignored >= 2;
    next.arcs[i] = {
      ...arc,
      ignored_sessions: escalates ? 0 : ignored,
      escalation: escalates ? Math.min(4, integer(arc.escalation) + 1) : integer(arc.escalation),
      status: escalates && arc.status === 'active' ? 'escalating' : arc.status,
      last_updated: stamp,
      revision: (Number.isInteger(arc.revision) ? arc.revision : 0) + 1,
    };
  }
  next.last_updated = stamp;
  return next;
}

export function mergeDebtPatches(doc, patches = [], { sessionId, stamp } = {}) {
  const next = { ...(doc || {}), debts: [...(doc?.debts || [])] };
  const rejected = [];
  for (const raw of Array.isArray(patches) ? patches : []) {
    const body = raw?.changes && typeof raw.changes === 'object' && !Array.isArray(raw.changes) ? raw.changes : raw;
    const id = raw?.id || body?.id;
    if (!raw || typeof raw !== 'object' || !String(id || '').startsWith('debt_')) {
      rejected.push(`${raw?.id || '(missing id)'} must start with debt_`);
      continue;
    }
    const index = next.debts.findIndex(debt => debt.id === id);
    const existing = index >= 0 ? next.debts[index] : { revision: 0 };
    const currentRevision = Number.isInteger(existing.revision) ? existing.revision : 0;
    if (index >= 0 && Number.isInteger(raw.expected_revision) && raw.expected_revision !== currentRevision) {
      rejected.push(`${id} revision conflict: expected ${raw.expected_revision}, found ${currentRevision}`);
      continue;
    }
    const candidate = { ...existing, ...body, id };
    if (!candidate.creditor_id || !candidate.debtor_id || candidate.creditor_id === candidate.debtor_id) {
      rejected.push(`${id} needs distinct creditor_id and debtor_id`);
      continue;
    }
    if (body.visibility && body.visibility !== 'public') {
      rejected.push(`${id} is not public and cannot be written here`);
      continue;
    }
    if (!Number.isInteger(candidate.amount) || candidate.amount < 0) {
      rejected.push(`${id}.amount must be a non-negative integer`);
      continue;
    }
    const amount = Math.min(99, candidate.amount);
    const debt = {
      ...candidate,
      amount,
      status: amount === 0 ? 'settled' : (body.status || 'open'),
      visibility: 'public',
      last_updated: stamp,
      updated_by_session: sessionId,
      revision: currentRevision + 1,
    };
    if (index >= 0) next.debts[index] = debt;
    else next.debts.push(debt);
  }
  next.last_updated = stamp;
  return { doc: next, rejected };
}

export function auditSession({ messages = [], rolls = [], close = {} } = {}) {
  const assistantText = messages
    .filter(message => message.role === 'assistant')
    .map(message => String(message.content || ''))
    .join('\n');
  const worldTouches = ['events_append', 'npc_patch', 'npc_memory_patch', 'location_patch', 'relationship_patch', 'arc_patch', 'mystery_patch', 'debt_patch', 'hub_patch', 'interaction_ops']
    .filter(key => Boolean(close[key])).length;
  return {
    meaningful_choice_prompted: /\?|choose|what do you do|which do you/i.test(assistantText),
    consequential_rolls: rolls.length,
    world_state_touches: worldTouches,
    handoff_written: Boolean(close.handoff),
    healthy_short_session: Boolean(close.handoff)
      && (/\?|choose|what do you do|which do you/i.test(assistantText))
      && (rolls.length > 0 || worldTouches > 0),
  };
}
