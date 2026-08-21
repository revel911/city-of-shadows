import { readJSON } from './world-utils.mjs';

const [hubs, npcDoc, locationDoc, arcDoc, players, manualDoc, derivedDoc, debtDoc, interactionDoc] = await Promise.all([
  readJSON('hubs/index.json'),
  readJSON('game/npcs.json'),
  readJSON('game/locations.json'),
  readJSON('game/arcs.json'),
  readJSON('players/index.json'),
  readJSON('game/relationships.manual.json'),
  readJSON('game/relationships.derived.json'),
  readJSON('game/debts.json'),
  readJSON('game/interactions.json')
]);

const errors = [];
const warnings = [];
const ids = {
  hub: new Set(hubs.map(x => x.id)),
  npc: new Set((npcDoc.npcs || []).map(x => x.id)),
  loc: new Set((locationDoc.locations || []).map(x => x.id)),
  arc: new Set((arcDoc.arcs || []).map(x => x.id)),
  pc: new Set(players.map(x => x.id))
};
const entityIds = new Set([...ids.hub, ...ids.npc, ...ids.loc, ...ids.arc, ...ids.pc]);

function duplicateValues(items, key, label) {
  const seen = new Set();
  for (const item of items) {
    const value = item[key];
    if (!value) errors.push(`${label} is missing ${key}`);
    else if (seen.has(value)) errors.push(`duplicate ${label} ${key}: ${value}`);
    seen.add(value);
  }
}

duplicateValues(hubs, 'id', 'hub');
duplicateValues(npcDoc.npcs || [], 'id', 'NPC');
duplicateValues(locationDoc.locations || [], 'id', 'location');
duplicateValues(arcDoc.arcs || [], 'id', 'arc');
duplicateValues(players, 'id', 'PC');

for (const npc of npcDoc.npcs || []) {
  if (npc.hub_id && !ids.hub.has(npc.hub_id)) errors.push(`${npc.id} references missing hub ${npc.hub_id}`);
  for (const field of ['home_location_id', 'current_location_id']) {
    if (npc[field] && !ids.loc.has(npc[field])) errors.push(`${npc.id}.${field} references missing location ${npc[field]}`);
  }
  for (const id of npc.associated_location_ids || []) {
    if (!ids.loc.has(id)) errors.push(`${npc.id} references missing associated location ${id}`);
  }
  for (const id of npc.arc_ids || []) if (!ids.arc.has(id)) errors.push(`${npc.id} references missing arc ${id}`);
  const p = npc.personality || {};
  for (const axis of ['moral', 'order', 'manner', 'violence']) {
    if (!Number.isInteger(p[axis]) || p[axis] < 1 || p[axis] > 5) errors.push(`${npc.id}.personality.${axis} must be 1-5`);
  }
  if (!p.voice_note) errors.push(`${npc.id} is missing personality.voice_note`);
  if (!npc.hub_id && !['unknown', 'mobile', 'unestablished'].includes(npc.location_status)) warnings.push(`${npc.id} has no home hub or explicit location_status`);
}

for (const location of locationDoc.locations || []) {
  if (!ids.hub.has(location.hub_id)) errors.push(`${location.id} references missing hub ${location.hub_id}`);
  for (const id of location.controller_ids || []) if (!ids.npc.has(id)) errors.push(`${location.id} references missing controller ${id}`);
}

for (const arc of arcDoc.arcs || []) {
  for (const id of arc.hub_ids || []) if (!ids.hub.has(id)) errors.push(`${arc.id} references missing hub ${id}`);
  for (const id of arc.npc_ids || []) if (!ids.npc.has(id)) errors.push(`${arc.id} references missing NPC ${id}`);
  for (const id of arc.character_ids || []) if (!ids.pc.has(id)) errors.push(`${arc.id} references missing PC ${id}`);
  if (!Number.isInteger(arc.escalation) || arc.escalation < 0 || arc.escalation > 4) errors.push(`${arc.id}.escalation must be 0-4`);
  if (arc.ignored_sessions != null && (!Number.isInteger(arc.ignored_sessions) || arc.ignored_sessions < 0 || arc.ignored_sessions > 1)) errors.push(`${arc.id}.ignored_sessions must be 0-1`);
}

const relationships = [...(manualDoc.relationships || []), ...(derivedDoc.relationships || [])];
duplicateValues(relationships, 'id', 'relationship');
for (const rel of relationships) {
  if (!entityIds.has(rel.source)) errors.push(`${rel.id} references missing source ${rel.source}`);
  if (!entityIds.has(rel.target)) errors.push(`${rel.id} references missing target ${rel.target}`);
  if (rel.visibility !== 'public') errors.push(`${rel.id} is not public; public-repo relationship files must never contain secrets`);
  if (!rel.type || !rel.label) errors.push(`${rel.id} requires type and label`);
}

const debts = debtDoc.debts || [];
duplicateValues(debts, 'id', 'Debt');
for (const debt of debts) {
  if (!debt.id.startsWith('debt_')) errors.push(`${debt.id} must start with debt_`);
  if (!entityIds.has(debt.creditor_id)) errors.push(`${debt.id} references missing creditor ${debt.creditor_id}`);
  if (!entityIds.has(debt.debtor_id)) errors.push(`${debt.id} references missing debtor ${debt.debtor_id}`);
  if (debt.creditor_id === debt.debtor_id) errors.push(`${debt.id} creditor and debtor must differ`);
  if (!Number.isInteger(debt.amount) || debt.amount < 0) errors.push(`${debt.id}.amount must be a non-negative integer`);
  if (debt.visibility !== 'public') errors.push(`${debt.id} is not public; game/debts.json is public`);
}

const interactions = interactionDoc.interactions || [];
duplicateValues(interactions, 'id', 'interaction');
for (const interaction of interactions) {
  const target = interaction.to || interaction.target_character_id;
  if (!interaction.id?.startsWith('interaction_')) errors.push(`${interaction.id || '(missing id)'} must start with interaction_`);
  if (!target || !ids.pc.has(target)) errors.push(`${interaction.id} references missing target PC ${target || '(missing)'}`);
  if (!interaction.effect) errors.push(`${interaction.id} requires effect`);
  if (interaction.status !== 'pending') errors.push(`${interaction.id}.status must be pending while queued`);
}

for (const warning of warnings) console.warn(`WARN: ${warning}`);
if (errors.length) {
  for (const error of errors) console.error(`ERROR: ${error}`);
  process.exitCode = 1;
} else {
  console.log(`World state valid: ${ids.npc.size} NPCs, ${ids.loc.size} locations, ${relationships.length} relationships, ${debts.length} Debts.`);
}
