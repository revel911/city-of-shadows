const CIRCLES = ['Mortalis', 'Night', 'Power', 'Wild'];
const STANCES = ['striving', 'maintaining'];

const rating = value => Number.isInteger(value) && value >= 1 && value <= 4;

export function factionProblems(faction, ids = { npc: new Set(), hub: new Set(), pc: new Set() }) {
  const problems = [];
  const id = faction?.id || '(missing id)';
  if (!/^faction_[a-z0-9_]+$/.test(faction?.id || '')) problems.push(`${id} must match faction_<slug>`);
  if (!String(faction?.name || '').trim()) problems.push(`${id}.name is required`);
  if (!CIRCLES.includes(faction?.circle)) problems.push(`${id}.circle must be one of ${CIRCLES.join(', ')}`);
  if (!rating(faction?.size)) problems.push(`${id}.size must be 1-4`);
  if (!rating(faction?.strength)) problems.push(`${id}.strength must be 1-4`);
  if (!STANCES.includes(faction?.stance)) problems.push(`${id}.stance must be striving or maintaining`);
  if (faction?.leader_npc_id && !ids.npc.has(faction.leader_npc_id)) problems.push(`${id} leader ${faction.leader_npc_id} is not an NPC`);
  for (const npcId of faction?.member_npc_ids || []) if (!ids.npc.has(npcId)) problems.push(`${id} member ${npcId} is not an NPC`);
  for (const hubId of faction?.hub_ids || []) if (!ids.hub.has(hubId)) problems.push(`${id} hub ${hubId} does not exist`);
  for (const pcId of faction?.character_ids || []) if (!ids.pc.has(pcId)) problems.push(`${id} character ${pcId} does not exist`);
  if ((faction?.character_ids || []).length > 1) problems.push(`${id} may have at most one owning character`);
  return problems;
}

export function compactFaction(faction) {
  return {
    id: faction.id,
    revision: Number.isInteger(faction.revision) ? faction.revision : 0,
    name: faction.name,
    circle: faction.circle,
    size: faction.size,
    strength: faction.strength,
    assets: faction.assets || [],
    stance: faction.stance,
    hub_ids: faction.hub_ids || [],
    leader_npc_id: faction.leader_npc_id || '',
    character_ids: faction.character_ids || [],
    public_summary: faction.public_summary || '',
  };
}
