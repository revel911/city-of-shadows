import { readJSON } from './github.js';
import {
  deriveKnowledgeRecords,
  formatCharacterKnowledge,
  formatScenePressureContext,
  withDerivedMysteryState,
} from './narrative-state.js';

function compactNpc(npc) {
  return {
    id: npc.id,
    revision: Number.isInteger(npc.revision) ? npc.revision : 0,
    name: npc.name,
    faction: npc.faction || '',
    status: npc.status || 'active',
    hub_id: npc.hub_id || '',
    home_location_id: npc.home_location_id || '',
    current_location_id: npc.current_location_id || '',
    arc_ids: npc.arc_ids || [],
    role: npc.role || '',
    player_interaction: npc.player_interaction || '',
    personality: npc.personality || {},
    last_seen: npc.last_seen || '',
    notes: npc.notes || ''
  };
}

export function npcBehaviorCard(npc) {
  const p = npc?.personality || {};
  const moral = {
    1: 'No ethical constraint; will cross any line that serves the moment.',
    2: 'Situational ethics; rationalizes compromise easily.',
    3: 'Has real but movable lines.',
    4: 'Follows a binding personal code and explains decisions through it.',
    5: 'Will sacrifice the desired outcome rather than violate a rigid code.',
  };
  const order = {
    1: 'Breaks systems and treats structure as theater.',
    2: 'Uses rules as cover, then ignores them when inconvenient.',
    3: 'Uses or subverts systems pragmatically.',
    4: 'Prefers legitimate channels and bends them only under pressure.',
    5: 'Believes in hierarchy, jurisdiction, and process.',
  };
  const manner = {
    1: 'One to three words; hostile or dismissive; posture carries the rest.',
    2: 'Short transactional sentences; no cushioning or pleasantries.',
    3: 'Professional cadence; says enough to complete the transaction.',
    4: 'Conversational; uses names and may volunteer useful context.',
    5: 'Warm and disarming without becoming automatically verbose.',
  };
  const violence = {
    1: 'Violence-first: closes distance or attacks early; no third warning.',
    2: 'Comfortable with violence: positions, threatens, and follows through quickly.',
    3: 'Threatens when useful and acts if pushed.',
    4: 'Avoids violence until other routes fail; actively de-escalates.',
    5: 'Violence is off the table: retreats, shields others, folds, or seeks help first.',
  };
  return {
    id: npc.id,
    voice_note: p.voice_note || '',
    ethics: moral[p.moral] || 'Uncalibrated ethics.',
    institutional_instinct: order[p.order] || 'Uncalibrated relationship to systems.',
    dialogue_register: manner[p.manner] || 'Uncalibrated dialogue register.',
    conflict_instinct: violence[p.violence] || 'Uncalibrated conflict instinct.',
  };
}

function compactNpcCharacterMemory(memory) {
  return {
    id: memory.id,
    revision: Number.isInteger(memory.revision) ? memory.revision : 0,
    npc_id: memory.npc_id,
    character_id: memory.character_id,
    relationship_state: memory.relationship_state || '',
    disposition: Number.isInteger(memory.disposition) ? memory.disposition : 0,
    trust: Number.isInteger(memory.trust) ? memory.trust : 0,
    fear: Number.isInteger(memory.fear) ? memory.fear : 0,
    respect: Number.isInteger(memory.respect) ? memory.respect : 0,
    last_interaction: memory.last_interaction || '',
    promises: memory.promises || [],
    grievances: memory.grievances || [],
    boundaries: memory.boundaries || [],
    key_moments: memory.key_moments || [],
    npc_believes_about_character: memory.npc_believes_about_character || [],
    notes: memory.notes || '',
  };
}

export function formatNpcHydrationContext(npcs = [], memories = []) {
  return [
    '--- NPC PERSONALITY HYDRATION ---',
    'These full records are authoritative for any NPC newly named in play.',
    'The voice_note is primary; the behavior card is binding for dialogue, choices, and escalation.',
    JSON.stringify(npcs.map(npc => ({ ...compactNpc(npc), behavior: npcBehaviorCard(npc) }))),
    '',
    'NPC–CHARACTER MEMORY FOR THIS CHARACTER ONLY:',
    'Use this to vary trust, fear, respect, boundaries, and callbacks without changing the NPC’s universal personality.',
    JSON.stringify(memories.map(compactNpcCharacterMemory)),
  ].join('\n');
}

function compactLocation(location) {
  return {
    id: location.id,
    revision: Number.isInteger(location.revision) ? location.revision : 0,
    name: location.name,
    hub_id: location.hub_id,
    type: location.type || 'site',
    status: location.status || 'active',
    controller_ids: location.controller_ids || [],
    description: location.description || '',
    atmosphere: location.atmosphere || '',
    notes: location.notes || ''
  };
}

function compactArc(arc) {
  return {
    id: arc.id,
    revision: Number.isInteger(arc.revision) ? arc.revision : 0,
    title: arc.title,
    type: arc.type || '',
    escalation: arc.escalation || 0,
    status: arc.status || 'active',
    ignored_sessions: arc.ignored_sessions || 0,
    hub_ids: arc.hub_ids || [],
    npc_ids: arc.npc_ids || [],
    character_ids: arc.character_ids || [],
    summary: arc.summary || '',
    agenda: arc.agenda || '',
    impulse: arc.impulse || '',
    next_pressure: arc.next_pressure || '',
    clock: arc.clock || { current: Number.isInteger(arc.escalation) ? arc.escalation : 0, max: 4 },
    mc_notes: arc.mc_notes || '',
  };
}

function compactMystery(mystery) {
  return {
    id: mystery.id,
    revision: Number.isInteger(mystery.revision) ? mystery.revision : 0,
    title: mystery.title,
    status: mystery.status || 'active',
    arc_id: mystery.arc_id || '',
    question: mystery.question || '',
    hub_ids: mystery.hub_ids || [],
    npc_ids: mystery.npc_ids || [],
    character_ids: mystery.character_ids || [],
    stage: mystery.stage || 'hook',
    progress: mystery.progress || {},
    themes: mystery.themes || [],
    motifs: mystery.motifs || [],
    agenda: mystery.agenda || '',
    next_pressure: mystery.next_pressure || '',
    pressure: mystery.pressure || null,
    revelations: mystery.revelations || [],
    clues: mystery.clues || [],
    notes: mystery.notes || '',
  };
}

function compactHubState(hub) {
  return {
    id: hub.id,
    revision: Number.isInteger(hub.revision) ? hub.revision : 0,
    conditions: hub.conditions || [],
    rumors: hub.rumors || [],
    control: hub.control || '',
    pressure: Number.isInteger(hub.pressure) ? hub.pressure : 0,
    notes: hub.notes || '',
    last_updated: hub.last_updated || '',
  };
}

export function formatCanonicalWorldContext({
  hubs = [],
  npcs = [],
  locations = [],
  relationships = [],
  arcs = [],
  mysteries = [],
  npcCharacterMemories = [],
  debts = [],
  hubState = [],
  knowledge = [],
  characterId = '',
  directory = null,
  includeBehaviorCards = true,
}) {
  return [
    '--- CANONICAL WORLD INDEX ---',
    'These records are authoritative. Reuse IDs; never recreate a matching NPC, location, or hub.',
    'NPC voice_note overrides generic characterization. Location and status fields override recollection.',
    'For existing entities, copy revision into expected_revision and place changed fields inside changes.',
    '',
    'HUBS:',
    JSON.stringify(hubs.map(({ id, name }) => ({ id, name }))),
    '',
    'NPCS:',
    JSON.stringify(npcs.map(compactNpc)),
    ...(includeBehaviorCards ? [
      '',
      'NPC BEHAVIOR CARDS (binding portrayal; voice_note remains primary):',
      JSON.stringify(npcs.map(npcBehaviorCard)),
    ] : []),
    '',
    'LOCATIONS:',
    JSON.stringify(locations.map(compactLocation)),
    '',
    'PUBLIC RELATIONSHIPS:',
    JSON.stringify(relationships),
    '',
    'NPC–CHARACTER MEMORY (active character only):',
    'Universal NPC personality stays fixed; these records control how that NPC specifically remembers and treats this character.',
    JSON.stringify(npcCharacterMemories.map(compactNpcCharacterMemory)),
    '',
    'ACTIVE ARCS / PRESSURE CLOCKS:',
    JSON.stringify(arcs.map(compactArc)),
    '',
    'ACTIVE MYSTERIES / CLUE MAPS:',
    'Clues are discoverable evidence, not a required scene order. A credible approach may reveal any available clue.',
    JSON.stringify(mysteries.map(compactMystery)),
    '',
    'PUBLIC DEBT LEDGER:',
    JSON.stringify(debts),
    '',
    'MUTABLE HUB CONDITIONS:',
    JSON.stringify(hubState.map(compactHubState)),
    '',
    formatCharacterKnowledge(knowledge, characterId),
    '',
    formatScenePressureContext({
      arcs,
      mysteries,
      characterId,
      activeArcIds: arcs.map(arc => arc.id),
    }),
    ...(directory ? [
      '',
      'ENTITY DIRECTORY (identity only; request/reuse these IDs rather than inventing duplicates):',
      JSON.stringify(directory),
    ] : []),
  ].join('\n');
}

async function loadWorldDocuments() {
  const [hubs, npcDoc, locationDoc, manualDoc, derivedDoc, arcDoc, mysteryDoc, memoryDoc, debtDoc, hubStateDoc] = await Promise.all([
    readJSON('hubs/index.json'),
    readJSON('game/npcs.json'),
    readJSON('game/locations.json'),
    readJSON('game/relationships.manual.json'),
    readJSON('game/relationships.derived.json'),
    readJSON('game/arcs.json'),
    readJSON('game/mysteries.json'),
    readJSON('game/npc-character-memory.json'),
    readJSON('game/debts.json'),
    readJSON('game/hub-state.json'),
  ]);
  return {
    hubs: hubs || [],
    npcs: npcDoc?.npcs || [],
    locations: locationDoc?.locations || [],
    relationships: [
      ...(manualDoc?.relationships || []),
      ...(derivedDoc?.relationships || []),
    ],
    arcs: arcDoc?.arcs || [],
    mysteries: withDerivedMysteryState(mysteryDoc || { mysteries: [] }).mysteries,
    npcCharacterMemories: memoryDoc?.memories || [],
    debts: debtDoc?.debts || [],
    hubState: hubStateDoc?.hubs || [],
  };
}

export async function buildCanonicalWorldContext() {
  const world = await loadWorldDocuments();
  return formatCanonicalWorldContext({
    ...world,
    npcCharacterMemories: [],
    includeBehaviorCards: false,
  });
}

function referencedIds(text) {
  return new Set(String(text || '').match(/(?:npc_|loc_|hub_|mystery_)[a-z0-9_]+|arc-\d+/gi) || []);
}

export function findMentionedNpcs(text, npcs = [], excludeIds = []) {
  const source = String(text || '').toLowerCase();
  if (!source.trim()) return [];
  const excluded = new Set(excludeIds);
  const ignoredTitles = new Set(['det', 'sgt', 'dr', 'prof', 'father', 'sister', 'judge', 'councilor', 'the']);
  const tokenCounts = new Map();
  const tokensById = new Map();
  for (const npc of npcs) {
    const tokens = String(npc.name || '').toLowerCase().match(/[a-z0-9]+/g) || [];
    const aliases = tokens.filter(token => token.length >= 4 && !ignoredTitles.has(token));
    tokensById.set(npc.id, aliases);
    for (const token of aliases) tokenCounts.set(token, (tokenCounts.get(token) || 0) + 1);
  }
  return npcs.filter(npc => {
    if (!npc?.id || excluded.has(npc.id)) return false;
    const idMatch = source.includes(String(npc.id).toLowerCase());
    const name = String(npc.name || '').toLowerCase().trim();
    const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const fullNameMatch = name && new RegExp(`\\b${escapedName}\\b`, 'i').test(source);
    const uniqueAliasMatch = (tokensById.get(npc.id) || [])
      .some(alias => tokenCounts.get(alias) === 1 && new RegExp(`\\b${alias}\\b`, 'i').test(source));
    return idMatch || fullNameMatch || uniqueAliasMatch;
  }).slice(0, 3);
}

export function selectRelevantWorld(world, { characterId, state = {}, handoff = '' } = {}) {
  const seeds = referencedIds(handoff);
  const activeArcIds = new Set([...(state.active_arc_ids || []), ...seeds].filter(id => id.startsWith?.('arc-')));
  const personalArcs = world.arcs.filter(arc => arc.character_ids?.includes(characterId));
  for (const arc of personalArcs) activeArcIds.add(arc.id);
  if (!activeArcIds.size) {
    world.arcs
      .filter(arc => ['active', 'escalating'].includes(arc.status))
      .sort((a, b) => (b.escalation || 0) - (a.escalation || 0) || a.id.localeCompare(b.id))
      .slice(0, 3)
      .forEach(arc => activeArcIds.add(arc.id));
  }
  const arcs = world.arcs.filter(arc => activeArcIds.has(arc.id));
  const entityIds = new Set([characterId, ...seeds]);
  for (const arc of arcs) {
    for (const id of [...(arc.npc_ids || []), ...(arc.hub_ids || [])]) entityIds.add(id);
  }
  const mysteries = (world.mysteries || []).filter(mystery =>
    mystery.status !== 'resolved' && (
      seeds.has(mystery.id)
      || mystery.character_ids?.includes(characterId)
      || (mystery.arc_id && activeArcIds.has(mystery.arc_id))
      || mystery.hub_ids?.some(id => entityIds.has(id))
      || mystery.npc_ids?.some(id => entityIds.has(id))
    )
  );
  for (const mystery of mysteries) {
    entityIds.add(mystery.id);
    for (const id of [...(mystery.hub_ids || []), ...(mystery.npc_ids || [])]) entityIds.add(id);
  }
  const related = world.relationships.filter(rel => rel.source === characterId || rel.target === characterId);
  for (const rel of related) {
    entityIds.add(rel.source);
    entityIds.add(rel.target);
  }
  const npcCharacterMemories = (world.npcCharacterMemories || [])
    .filter(memory => memory.character_id === characterId && entityIds.has(memory.npc_id));
  let npcs = world.npcs.filter(npc => entityIds.has(npc.id));
  for (const npc of npcs) {
    for (const id of [npc.hub_id, npc.home_location_id, npc.current_location_id, ...(npc.associated_location_ids || [])]) {
      if (id) entityIds.add(id);
    }
  }
  const locations = world.locations.filter(location => entityIds.has(location.id));
  for (const location of locations) entityIds.add(location.hub_id);
  const hubs = world.hubs.filter(hub => entityIds.has(hub.id));
  const hubState = (world.hubState || []).filter(hub => entityIds.has(hub.id));
  const relationships = world.relationships.filter(rel =>
    rel.source === characterId || rel.target === characterId
    || (entityIds.has(rel.source) && entityIds.has(rel.target))
  );
  const debts = world.debts.filter(debt =>
    debt.creditor_id === characterId || debt.debtor_id === characterId
  );
  const knowledge = deriveKnowledgeRecords({ mysteries }, { characterId });
  const directory = {
    npcs: world.npcs.map(({ id, name }) => ({ id, name })),
    locations: world.locations.map(({ id, name, hub_id }) => ({ id, name, hub_id })),
    arcs: world.arcs.map(({ id, title, status }) => ({ id, title, status })),
    mysteries: (world.mysteries || []).map(({ id, title, status }) => ({ id, title, status })),
  };
  return { hubs, npcs, locations, relationships, arcs, mysteries, knowledge, characterId, npcCharacterMemories, debts, hubState, directory };
}

export async function buildRelevantWorldContext(options) {
  const world = await loadWorldDocuments();
  return formatCanonicalWorldContext(selectRelevantWorld(world, options));
}

export function npcCharacterMemoryId(npcId, characterId) {
  const npc = String(npcId || '').replace(/^npc_/, '').replace(/[^a-z0-9]+/gi, '_').toLowerCase();
  const character = String(characterId || '').replace(/[^a-z0-9]+/gi, '_').toLowerCase();
  return npc && character ? `memory_${npc}__${character}` : '';
}

export function mergeNpcCharacterMemoryPatches(doc, patches, options = {}) {
  const existing = new Map((doc?.memories || []).map(memory => [memory.id, memory]));
  const existingByPair = new Map((doc?.memories || [])
    .map(memory => [`${memory.npc_id}|${memory.character_id}`, memory]));
  const normalized = [];
  const rejected = [];
  const setFields = ['promises', 'grievances', 'boundaries', 'key_moments', 'npc_believes_about_character'];
  for (const raw of Array.isArray(patches) ? patches : []) {
    const body = raw?.changes && typeof raw.changes === 'object' && !Array.isArray(raw.changes)
      ? raw.changes
      : raw;
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      rejected.push('memory patch must be an object');
      continue;
    }
    const byId = existing.get(raw.id);
    const npcId = body.npc_id || byId?.npc_id;
    const characterId = body.character_id || byId?.character_id || options.characterId;
    if (!String(npcId || '').startsWith('npc_') || !characterId) {
      rejected.push(`${raw.id || '(missing id)'} requires npc_id and character_id`);
      continue;
    }
    if (byId && ((body.npc_id && body.npc_id !== byId.npc_id)
      || (body.character_id && body.character_id !== byId.character_id))) {
      rejected.push(`${byId.id} cannot change its NPC-character identity pair`);
      continue;
    }
    if (options.validNpcIds && !options.validNpcIds.has(npcId)) {
      rejected.push(`${raw.id || npcId} references unknown NPC ${npcId}`);
      continue;
    }
    if (options.characterId && characterId !== options.characterId) {
      rejected.push(`${raw.id || '(missing id)'} cannot write memory for another character`);
      continue;
    }
    const prior = byId || existingByPair.get(`${npcId}|${characterId}`);
    if (prior && !Number.isInteger(raw.expected_revision)) {
      rejected.push(`${prior.id} requires expected_revision for an existing memory`);
      continue;
    }
    if (!prior) {
      const required = [
        'relationship_state', 'disposition', 'trust', 'fear', 'respect',
        'last_interaction', ...setFields,
      ];
      const missing = required.filter(field => body[field] === undefined
        || (field === 'relationship_state' && !String(body[field]).trim()));
      if (missing.length) {
        rejected.push(`${raw.id || npcId} new memory is missing ${missing.join(', ')}`);
        continue;
      }
    }
    const scoreProblems = [
      ['disposition', -5, 5], ['trust', 0, 5], ['fear', 0, 5], ['respect', 0, 5],
    ].filter(([field, min, max]) => body[field] != null
      && (!Number.isInteger(body[field]) || body[field] < min || body[field] > max));
    if (scoreProblems.length) {
      rejected.push(`${raw.id || npcId} has out-of-range ${scoreProblems.map(([field]) => field).join(', ')}`);
      continue;
    }
    const invalidString = ['relationship_state', 'last_interaction', 'notes']
      .find(field => body[field] != null && typeof body[field] !== 'string');
    if (invalidString) {
      rejected.push(`${raw.id || npcId}.${invalidString} must be a string`);
      continue;
    }
    const invalidList = setFields.find(field => body[field] != null
      && (!Array.isArray(body[field]) || body[field].some(item => typeof item !== 'string')));
    if (invalidList) {
      rejected.push(`${raw.id || npcId}.${invalidList} must be an array of strings`);
      continue;
    }
    const id = npcCharacterMemoryId(npcId, characterId);
    const changes = { ...body, npc_id: npcId, character_id: characterId };
    normalized.push(raw?.changes
      ? { id, expected_revision: raw.expected_revision, changes }
      : { ...changes, id, expected_revision: raw?.expected_revision });
  }
  const result = mergeCanonicalPatches(doc, normalized, {
    ...options,
    collection: 'memories',
    idPrefix: 'memory_',
  });
  return { ...result, rejected: [...rejected, ...result.rejected] };
}

function mergeConcurrentMysteryClues(existingClues, incomingClues) {
  if (!Array.isArray(existingClues) || !Array.isArray(incomingClues)) return null;
  const merged = existingClues.map(clue => ({ ...clue }));
  const byId = new Map(merged.map((clue, index) => [clue.id, index]));
  for (const incoming of incomingClues) {
    const index = byId.get(incoming?.id);
    if (index === undefined) return null;
    const current = merged[index];
    for (const [key, value] of Object.entries(incoming)) {
      if (['status', 'discovered_by'].includes(key)) continue;
      if (JSON.stringify(current[key]) !== JSON.stringify(value)) return null;
    }
    const statuses = new Set([current.status, incoming.status].filter(Boolean));
    if (statuses.has('lost') && statuses.has('discovered')) return null;
    const status = statuses.has('discovered')
      ? 'discovered'
      : (statuses.has('lost') ? 'lost' : (current.status || incoming.status || 'available'));
    merged[index] = {
      ...current,
      status,
      discovered_by: [...new Set([...(current.discovered_by || []), ...(incoming.discovered_by || [])])],
    };
  }
  return merged;
}

function mergeKeyedRecords(existingRecords, incomingRecords) {
  const merged = Array.isArray(existingRecords) ? existingRecords.map(item => ({ ...item })) : [];
  const byId = new Map(merged.map((item, index) => [item.id, index]));
  for (const incoming of Array.isArray(incomingRecords) ? incomingRecords : []) {
    const index = byId.get(incoming?.id);
    if (index === undefined) {
      byId.set(incoming?.id, merged.length);
      merged.push({ ...incoming });
    } else {
      const current = merged[index];
      merged[index] = {
        ...current,
        ...incoming,
        ...(Array.isArray(current.discovered_by) || Array.isArray(incoming.discovered_by)
          ? { discovered_by: [...new Set([...(current.discovered_by || []), ...(incoming.discovered_by || [])])] }
          : {}),
      };
    }
  }
  return merged;
}

export function mergeCanonicalPatches(doc, patches, {
  collection,
  idPrefix,
  sessionId,
  stamp,
  allowNameMatch = false,
  publicOnly = false
}) {
  const next = doc && typeof doc === 'object' ? { ...doc } : {};
  const list = Array.isArray(next[collection]) ? [...next[collection]] : [];
  const rejected = [];
  const conflicts = [];
  const safeSetFields = new Set([
    'arc_ids', 'associated_location_ids', 'controller_ids', 'hub_ids',
    'npc_ids', 'character_ids', 'promises', 'grievances', 'boundaries',
    'key_moments', 'npc_believes_about_character'
  ]);

  for (const raw of Array.isArray(patches) ? patches : []) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      rejected.push('patch must be an object');
      continue;
    }
    const expectedRevision = Number.isInteger(raw.expected_revision) ? raw.expected_revision : null;
    const body = raw.changes && typeof raw.changes === 'object' && !Array.isArray(raw.changes)
      ? raw.changes
      : raw;
    const patch = { ...body, id: raw.id || body.id };
    delete patch.expected_revision;
    delete patch.changes;
    if (!patch.id || (idPrefix && !patch.id.startsWith(idPrefix))) {
      rejected.push(`${patch.id || '(missing id)'} must start with ${idPrefix}`);
      continue;
    }
    if (publicOnly && patch.visibility !== 'public') {
      rejected.push(`${patch.id} is not public and cannot be written to the public repository`);
      continue;
    }
    let index = list.findIndex(item => item.id === patch.id);
    if (index < 0 && allowNameMatch && patch.name) {
      index = list.findIndex(item => item.name?.trim().toLowerCase() === patch.name.trim().toLowerCase());
      if (index >= 0 && list[index].id !== patch.id) patch.id = list[index].id;
    }
    const existing = index >= 0 ? list[index] : null;
    const currentRevision = Number.isInteger(existing?.revision) ? existing.revision : 0;
    // Mystery clue/revelation maps are keyed collections. A close block may
    // safely emit only the clue it discovered without deleting every other
    // clue from the canonical map.
    if (existing && collection === 'mysteries') {
      if (Array.isArray(patch.clues)) patch.clues = mergeKeyedRecords(existing.clues, patch.clues);
      if (Array.isArray(patch.revelations)) patch.revelations = mergeKeyedRecords(existing.revelations, patch.revelations);
    }
    if (existing && expectedRevision !== null && expectedRevision !== currentRevision) {
      const safePatch = { id: patch.id };
      const conflictingFields = [];
      for (const [key, value] of Object.entries(patch)) {
        if (key === 'id') continue;
        if (safeSetFields.has(key) && Array.isArray(value)) {
          safePatch[key] = [...new Set([...(existing[key] || []), ...value])];
        } else if (collection === 'mysteries' && key === 'clues') {
          const mergedClues = mergeConcurrentMysteryClues(existing.clues, value);
          if (mergedClues) safePatch.clues = mergedClues;
          else conflictingFields.push(key);
        } else if (JSON.stringify(existing[key]) !== JSON.stringify(value)) {
          conflictingFields.push(key);
        }
      }
      if (Object.keys(safePatch).length > 1) {
        safePatch.revision = currentRevision + 1;
        safePatch.last_updated = stamp;
        safePatch.updated_by_session = sessionId;
        list[index] = { ...existing, ...safePatch };
      }
      if (conflictingFields.length) {
        conflicts.push({
          entity_id: patch.id,
          expected_revision: expectedRevision,
          actual_revision: currentRevision,
          fields: conflictingFields,
          proposed_changes: Object.fromEntries(conflictingFields.map(key => [key, patch[key]])),
          session_id: sessionId,
        });
      }
      continue;
    }
    patch.revision = currentRevision + 1;
    patch.last_updated = stamp;
    patch.updated_by_session = sessionId;
    if (index >= 0) list[index] = { ...existing, ...patch };
    else list.push(patch);
  }

  next[collection] = list;
  next.last_updated = stamp;
  return { doc: next, rejected, conflicts };
}

export function applyInteractionOperations(doc, operations, { stamp, sessionId } = {}) {
  const next = doc && typeof doc === 'object' ? { ...doc } : {};
  const byId = new Map((next.interactions || []).map(item => [item.id, { ...item }]));
  const rejected = [];
  for (const operation of Array.isArray(operations) ? operations : []) {
    if (!operation || typeof operation !== 'object') {
      rejected.push('interaction operation must be an object');
      continue;
    }
    if (operation.op === 'consume') {
      if (!operation.id) rejected.push('consume operation requires id');
      else byId.delete(operation.id);
      continue;
    }
    if (operation.op === 'add' || operation.op === 'update') {
      const item = operation.interaction || operation.value;
      if (!item?.id?.startsWith('interaction_')) {
        rejected.push('interaction add/update requires an interaction_ id');
        continue;
      }
      byId.set(item.id, {
        ...(byId.get(item.id) || {}),
        ...item,
        status: 'pending',
        last_updated: stamp,
        updated_by_session: sessionId,
      });
      continue;
    }
    rejected.push(`${operation.op || '(missing op)'} is not a supported interaction operation`);
  }
  next.interactions = [...byId.values()];
  next.last_updated = stamp || next.last_updated || null;
  return { doc: next, rejected };
}
