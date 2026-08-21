import { readJSON } from './github.js';

function compactNpc(npc) {
  return {
    id: npc.id,
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

export function formatCanonicalWorldContext({ hubs = [], npcs = [], locations = [], relationships = [] }) {
  return [
    '--- CANONICAL WORLD INDEX ---',
    'These records are authoritative. Reuse IDs; never recreate a matching NPC, location, or hub.',
    'NPC voice_note overrides generic characterization. Location and status fields override recollection.',
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
    JSON.stringify(relationships)
  ].join('\n');
}

export async function buildCanonicalWorldContext() {
  const [hubs, npcDoc, locationDoc, manualDoc, derivedDoc] = await Promise.all([
    readJSON('hubs/index.json'),
    readJSON('game/npcs.json'),
    readJSON('game/locations.json'),
    readJSON('game/relationships.manual.json'),
    readJSON('game/relationships.derived.json')
  ]);
  return formatCanonicalWorldContext({
    hubs: hubs || [],
    npcs: npcDoc?.npcs || [],
    locations: locationDoc?.locations || [],
    relationships: [
      ...(manualDoc?.relationships || []),
      ...(derivedDoc?.relationships || [])
    ]
  });
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

  for (const raw of Array.isArray(patches) ? patches : []) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      rejected.push('patch must be an object');
      continue;
    }
    const patch = { ...raw };
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
    patch.last_updated = stamp;
    patch.updated_by_session = sessionId;
    if (index >= 0) list[index] = { ...list[index], ...patch };
    else list.push(patch);
  }

  next[collection] = list;
  next.last_updated = stamp;
  return { doc: next, rejected };
}
