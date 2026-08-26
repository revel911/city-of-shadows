import { hashNumber, readJSON, writeJSON } from './world-utils.mjs';

const [hubs, npcDoc, locationDoc, players, manualDoc, derivedDoc, arcDoc, mysteryDoc, debtDoc, hubStateDoc] = await Promise.all([
  readJSON('hubs/index.json'),
  readJSON('game/npcs.json'),
  readJSON('game/locations.json'),
  readJSON('players/index.json'),
  readJSON('game/relationships.manual.json'),
  readJSON('game/relationships.derived.json'),
  readJSON('game/arcs.json'),
  readJSON('game/mysteries.json'),
  readJSON('game/debts.json'),
  readJSON('game/hub-state.json')
]);

const hubPositions = new Map();
const radius = 780;
hubs.forEach((hub, index) => {
  const angle = (Math.PI * 2 * index / hubs.length) - Math.PI / 2;
  hubPositions.set(hub.id, { x: Math.round(Math.cos(angle) * radius), y: Math.round(Math.sin(angle) * radius) });
});

function positionNear(hubId, id, distance, band = 0) {
  const center = hubPositions.get(hubId) || { x: 0, y: 0 };
  const hash = hashNumber(id);
  const angle = (hash % 360) * Math.PI / 180;
  const spread = distance + ((hash >>> 8) % 130) + band;
  return { x: Math.round(center.x + Math.cos(angle) * spread), y: Math.round(center.y + Math.sin(angle) * spread) };
}

const hubStateById = new Map((hubStateDoc.hubs || []).map(item => [item.id, item]));
const nodes = [];
for (const hub of hubs) nodes.push({
  data: {
    id: hub.id, label: hub.name, kind: 'hub', hub_id: hub.id, status: 'active',
    details: (hubStateById.get(hub.id)?.conditions || []).join('; ') || 'Neighborhood hub'
  },
  position: hubPositions.get(hub.id)
});

for (const location of locationDoc.locations || []) nodes.push({
  data: {
    id: location.id, label: location.name, kind: 'location', hub_id: location.hub_id,
    status: location.status || 'active', subtype: location.type || 'site',
    details: location.description || location.notes || ''
  },
  position: positionNear(location.hub_id, location.id, 230)
});

for (const npc of npcDoc.npcs || []) nodes.push({
  data: {
    id: npc.id, label: npc.name, kind: 'npc', hub_id: npc.hub_id || '',
    faction: npc.faction || '', status: npc.status || 'active', subtype: npc.role || '',
    portrait: npc.portrait || '', details: npc.role || npc.notes || ''
  },
  position: positionNear(npc.hub_id, npc.id, 390, 80)
});

players.forEach((pc, index) => nodes.push({
  data: { id: pc.id, label: pc.name, kind: 'pc', hub_id: '', status: 'active', details: 'Player character' },
  position: { x: (index - (players.length - 1) / 2) * 180, y: 0 }
}));

for (const arc of arcDoc.arcs || []) {
  const hubId = arc.hub_ids?.[0] || '';
  nodes.push({
    data: {
      id: arc.id, label: arc.title, kind: 'arc', hub_id: hubId,
      status: arc.status || 'active', subtype: arc.type || 'arc',
      escalation: arc.escalation || 0, details: arc.summary || ''
    },
    position: positionNear(hubId, arc.id, 560, 120)
  });
}

for (const mystery of mysteryDoc.mysteries || []) {
  if (mystery.status === 'resolved') continue;
  const hubId = mystery.hub_ids?.[0] || '';
  const progress = mystery.progress || {};
  nodes.push({
    data: {
      id: mystery.id, label: mystery.title, kind: 'mystery', hub_id: hubId,
      status: mystery.status || 'active', subtype: progress.stage || mystery.stage || 'hook',
      details: mystery.question || '',
      discovered_clues: progress.discovered_clues || 0,
      total_clues: progress.total_clues || (mystery.clues || []).length,
    },
    position: positionNear(hubId, mystery.id, 650, 160),
  });
}
const edges = [];
for (const location of locationDoc.locations || []) edges.push({
  data: { id: `edge_${location.id}_${location.hub_id}`, source: location.id, target: location.hub_id, type: 'in_hub', label: 'In', layer: 'structural' }
});
for (const npc of npcDoc.npcs || []) {
  const target = npc.current_location_id || npc.home_location_id || npc.hub_id;
  if (target) edges.push({
    data: { id: `edge_${npc.id}_${target}`, source: npc.id, target, type: target.startsWith('loc_') ? 'located_at' : 'based_in', label: target.startsWith('loc_') ? 'At' : 'Based in', layer: 'structural' }
  });
}

const authored = [...(manualDoc.relationships || []), ...(derivedDoc.relationships || [])];
for (const rel of authored.filter(rel => rel.visibility === 'public')) edges.push({
  data: { id: rel.id, source: rel.source, target: rel.target, type: rel.type, label: rel.label, direction: rel.direction || 'outbound', layer: manualDoc.relationships?.some(x => x.id === rel.id) ? 'manual' : 'derived' }
});

for (const arc of arcDoc.arcs || []) {
  for (const target of [...(arc.hub_ids || []), ...(arc.npc_ids || []), ...(arc.character_ids || [])]) edges.push({
    data: { id: `edge_${arc.id}_${target}`, source: arc.id, target, type: 'involves', label: 'Involves', layer: 'arc' }
  });
}

for (const mystery of mysteryDoc.mysteries || []) {
  if (mystery.status === 'resolved') continue;
  for (const target of [mystery.arc_id, ...(mystery.hub_ids || []), ...(mystery.npc_ids || []), ...(mystery.character_ids || [])].filter(Boolean)) edges.push({
    data: { id: `edge_${mystery.id}_${target}`, source: mystery.id, target, type: 'mystery_link', label: 'Connected', layer: 'mystery' }
  });
}
for (const debt of (debtDoc.debts || []).filter(item => item.visibility === 'public' && item.amount > 0)) edges.push({
  data: {
    id: debt.id, source: debt.debtor_id, target: debt.creditor_id, type: 'debt',
    label: `Owes ${debt.amount} Debt${debt.amount === 1 ? '' : 's'}`, direction: 'outbound', layer: 'debt'
  }
});

await writeJSON('dashboard/data/world-graph.json', {
  as_of: [npcDoc.last_updated, locationDoc.last_updated, manualDoc.last_updated, derivedDoc.last_updated, arcDoc.last_updated, mysteryDoc.last_updated, debtDoc.last_updated, hubStateDoc.last_updated].filter(Boolean).sort().at(-1),
  derived_through: derivedDoc.derived_through || null,
  nodes,
  edges
});

console.log(`Built dashboard graph: ${nodes.length} nodes, ${edges.length} edges.`);
