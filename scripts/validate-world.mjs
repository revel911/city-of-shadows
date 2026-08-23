import { readJSON } from './world-utils.mjs';
import { npcCharacterMemoryId } from '../bot/handlers/world-state.js';

const [hubs, npcDoc, locationDoc, arcDoc, mysteryDoc, memoryDoc, players, manualDoc, derivedDoc, debtDoc, interactionDoc, worldMeta, hubState, conflictDoc, keeperState] = await Promise.all([
  readJSON('hubs/index.json'),
  readJSON('game/npcs.json'),
  readJSON('game/locations.json'),
  readJSON('game/arcs.json'),
  readJSON('game/mysteries.json'),
  readJSON('game/npc-character-memory.json'),
  readJSON('players/index.json'),
  readJSON('game/relationships.manual.json'),
  readJSON('game/relationships.derived.json'),
  readJSON('game/debts.json'),
  readJSON('game/interactions.json'),
  readJSON('game/world-meta.json'),
  readJSON('game/hub-state.json'),
  readJSON('game/conflicts.json'),
  readJSON('game/keeper-state.json')
]);

const errors = [];
const warnings = [];
const ids = {
  hub: new Set(hubs.map(x => x.id)),
  npc: new Set((npcDoc.npcs || []).map(x => x.id)),
  loc: new Set((locationDoc.locations || []).map(x => x.id)),
  arc: new Set((arcDoc.arcs || []).map(x => x.id)),
  mystery: new Set((mysteryDoc.mysteries || []).map(x => x.id)),
  pc: new Set(players.map(x => x.id))
};
const entityIds = new Set([...ids.hub, ...ids.npc, ...ids.loc, ...ids.arc, ...ids.mystery, ...ids.pc]);
const conflictEntityIds = new Set([
  ...entityIds,
  ...(memoryDoc.memories || []).map(item => item.id),
  ...(manualDoc.relationships || []).map(item => item.id),
  ...(derivedDoc.relationships || []).map(item => item.id),
  ...(debtDoc.debts || []).map(item => item.id),
]);

if (!Number.isInteger(worldMeta.revision) || worldMeta.revision < 0) errors.push('game/world-meta.json revision must be a non-negative integer');
if (!['open', 'running', 'failed'].includes(worldMeta.maintenance_status)) errors.push('game/world-meta.json maintenance_status must be open, running, or failed');
if (!Array.isArray(hubState.hubs)) errors.push('game/hub-state.json hubs must be an array');
if (!Array.isArray(conflictDoc.conflicts)) errors.push('game/conflicts.json conflicts must be an array');
if (!keeperState.arc_cooldowns || typeof keeperState.arc_cooldowns !== 'object' || Array.isArray(keeperState.arc_cooldowns)) errors.push('game/keeper-state.json arc_cooldowns must be an object');

for (const hub of hubState.hubs || []) {
  if (!ids.hub.has(hub.id)) errors.push(`hub state references missing hub ${hub.id}`);
  if (!Number.isInteger(hub.revision) || hub.revision < 0) errors.push(`${hub.id}.revision must be a non-negative integer`);
  if (hub.conditions != null && !Array.isArray(hub.conditions)) errors.push(`${hub.id}.conditions must be an array`);
  if (hub.rumors != null && !Array.isArray(hub.rumors)) errors.push(`${hub.id}.rumors must be an array`);
}

for (const conflict of conflictDoc.conflicts || []) {
  if (!conflict.id?.startsWith('conflict_')) errors.push(`${conflict.id || '(missing conflict id)'} must start with conflict_`);
  if (!['pending', 'resolved', 'dismissed'].includes(conflict.status)) errors.push(`${conflict.id}.status must be pending, resolved, or dismissed`);
  if (!conflict.entity_id || !conflictEntityIds.has(conflict.entity_id)) errors.push(`${conflict.id} references missing entity ${conflict.entity_id || '(missing)'}`);
}

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
duplicateValues(mysteryDoc.mysteries || [], 'id', 'mystery');
duplicateValues(memoryDoc.memories || [], 'id', 'NPC-character memory');
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

if (!Array.isArray(mysteryDoc.mysteries)) errors.push('game/mysteries.json mysteries must be an array');
for (const mystery of mysteryDoc.mysteries || []) {
  if (!mystery.id?.startsWith('mystery_')) errors.push(`${mystery.id || '(missing mystery id)'} must start with mystery_`);
  if (!['active', 'dormant', 'resolved'].includes(mystery.status)) errors.push(`${mystery.id}.status must be active, dormant, or resolved`);
  if (!mystery.title || !mystery.question) errors.push(`${mystery.id} requires title and question`);
  if (mystery.arc_id && !ids.arc.has(mystery.arc_id)) errors.push(`${mystery.id} references missing arc ${mystery.arc_id}`);
  for (const id of mystery.hub_ids || []) if (!ids.hub.has(id)) errors.push(`${mystery.id} references missing hub ${id}`);
  for (const id of mystery.npc_ids || []) if (!ids.npc.has(id)) errors.push(`${mystery.id} references missing NPC ${id}`);
  for (const id of mystery.character_ids || []) if (!ids.pc.has(id)) errors.push(`${mystery.id} references missing PC ${id}`);
  const clues = Array.isArray(mystery.clues) ? mystery.clues : [];
  const revelations = Array.isArray(mystery.revelations) ? mystery.revelations : [];
  if (!Array.isArray(mystery.clues)) errors.push(`${mystery.id}.clues must be an array`);
  if (!Array.isArray(mystery.revelations)) errors.push(`${mystery.id}.revelations must be an array`);
  duplicateValues(clues, 'id', `${mystery.id} clue`);
  duplicateValues(revelations, 'id', `${mystery.id} revelation`);
  const clueIds = new Set(clues.map(clue => clue.id));
  const revelationIds = new Set(revelations.map(revelation => revelation.id));
  for (const revelation of revelations) {
    const links = [...new Set(revelation.clue_ids || [])];
    if (!revelation.text) errors.push(`${mystery.id}.${revelation.id} requires text`);
    if (revelation.required && links.length < 3) errors.push(`${mystery.id}.${revelation.id} requires at least three independent clues`);
    for (const id of links) if (!clueIds.has(id)) errors.push(`${mystery.id}.${revelation.id} references missing clue ${id}`);
  }
  for (const clue of clues) {
    if (!clue.description) errors.push(`${mystery.id}.${clue.id} requires description`);
    if (!['available', 'discovered', 'lost'].includes(clue.status)) errors.push(`${mystery.id}.${clue.id}.status must be available, discovered, or lost`);
    for (const id of clue.revelation_ids || []) if (!revelationIds.has(id)) errors.push(`${mystery.id}.${clue.id} references missing revelation ${id}`);
    for (const id of clue.discovered_by || []) if (!ids.pc.has(id)) errors.push(`${mystery.id}.${clue.id} references missing discovering PC ${id}`);
    if (clue.source_id && !entityIds.has(clue.source_id)) errors.push(`${mystery.id}.${clue.id} references missing source ${clue.source_id}`);
  }
}

if (!Array.isArray(memoryDoc.memories)) errors.push('game/npc-character-memory.json memories must be an array');
const memoryPairs = new Set();
for (const memory of memoryDoc.memories || []) {
  if (!ids.npc.has(memory.npc_id)) errors.push(`${memory.id} references missing NPC ${memory.npc_id}`);
  if (!ids.pc.has(memory.character_id)) errors.push(`${memory.id} references missing PC ${memory.character_id}`);
  const expectedId = npcCharacterMemoryId(memory.npc_id, memory.character_id);
  if (memory.id !== expectedId) errors.push(`${memory.id} must use deterministic pair ID ${expectedId}`);
  const pair = `${memory.npc_id}|${memory.character_id}`;
  if (memoryPairs.has(pair)) errors.push(`duplicate NPC-character memory pair ${pair}`);
  memoryPairs.add(pair);
  if (!Number.isInteger(memory.revision) || memory.revision < 0) errors.push(`${memory.id}.revision must be a non-negative integer`);
  for (const [field, min, max] of [['disposition', -5, 5], ['trust', 0, 5], ['fear', 0, 5], ['respect', 0, 5]]) {
    if (!Number.isInteger(memory[field]) || memory[field] < min || memory[field] > max) errors.push(`${memory.id}.${field} must be ${min}-${max}`);
  }
  for (const field of ['promises', 'grievances', 'boundaries', 'key_moments', 'npc_believes_about_character']) {
    if (!Array.isArray(memory[field]) || memory[field].some(item => typeof item !== 'string')) errors.push(`${memory.id}.${field} must be an array of strings`);
  }
  if (typeof memory.relationship_state !== 'string' || !memory.relationship_state.trim()) errors.push(`${memory.id}.relationship_state is required`);
  if (typeof memory.last_interaction !== 'string') errors.push(`${memory.id}.last_interaction must be a string`);
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
  console.log(`World state valid: ${ids.npc.size} NPCs, ${ids.loc.size} locations, ${relationships.length} relationships, ${debts.length} Debts, ${ids.mystery.size} mysteries, ${memoryPairs.size} NPC-character memories.`);
}
