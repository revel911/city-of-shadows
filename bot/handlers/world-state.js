import { readJSON } from './github.js';

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
    mc_notes: arc.mc_notes || '',
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
  debts = [],
  hubState = [],
  directory = null,
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
    '',
    'LOCATIONS:',
    JSON.stringify(locations.map(compactLocation)),
    '',
    'PUBLIC RELATIONSHIPS:',
    JSON.stringify(relationships),
    '',
    'ACTIVE ARCS / PRESSURE CLOCKS:',
    JSON.stringify(arcs.map(compactArc)),
    '',
    'PUBLIC DEBT LEDGER:',
    JSON.stringify(debts),
    '',
    'MUTABLE HUB CONDITIONS:',
    JSON.stringify(hubState.map(compactHubState)),
    ...(directory ? [
      '',
      'ENTITY DIRECTORY (identity only; request/reuse these IDs rather than inventing duplicates):',
      JSON.stringify(directory),
    ] : []),
  ].join('\n');
}

async function loadWorldDocuments() {
  const [hubs, npcDoc, locationDoc, manualDoc, derivedDoc, arcDoc, debtDoc, hubStateDoc] = await Promise.all([
    readJSON('hubs/index.json'),
    readJSON('game/npcs.json'),
    readJSON('game/locations.json'),
    readJSON('game/relationships.manual.json'),
    readJSON('game/relationships.derived.json'),
    readJSON('game/arcs.json'),
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
    debts: debtDoc?.debts || [],
    hubState: hubStateDoc?.hubs || [],
  };
}

export async function buildCanonicalWorldContext() {
  const world = await loadWorldDocuments();
  return formatCanonicalWorldContext({
    ...world,
  });
}

function referencedIds(text) {
  return new Set(String(text || '').match(/(?:npc_|loc_|hub_)[a-z0-9_]+|arc-\d+/gi) || []);
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
  const related = world.relationships.filter(rel => rel.source === characterId || rel.target === characterId);
  for (const rel of related) {
    entityIds.add(rel.source);
    entityIds.add(rel.target);
  }
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
  const directory = {
    npcs: world.npcs.map(({ id, name }) => ({ id, name })),
    locations: world.locations.map(({ id, name, hub_id }) => ({ id, name, hub_id })),
    arcs: world.arcs.map(({ id, title, status }) => ({ id, title, status })),
  };
  return { hubs, npcs, locations, relationships, arcs, debts, hubState, directory };
}

export async function buildRelevantWorldContext(options) {
  const world = await loadWorldDocuments();
  return formatCanonicalWorldContext(selectRelevantWorld(world, options));
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
    'npc_ids', 'character_ids'
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
    if (existing && expectedRevision !== null && expectedRevision !== currentRevision) {
      const safePatch = { id: patch.id };
      const conflictingFields = [];
      for (const [key, value] of Object.entries(patch)) {
        if (key === 'id') continue;
        if (safeSetFields.has(key) && Array.isArray(value)) {
          safePatch[key] = [...new Set([...(existing[key] || []), ...value])];
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
