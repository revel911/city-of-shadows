function pick(item, fields) {
  return Object.fromEntries(fields
    .filter(field => item?.[field] !== undefined && item?.[field] !== null)
    .map(field => [field, item[field]]));
}

function list(doc, key) {
  return Array.isArray(doc?.[key]) ? doc[key] : [];
}

export function buildKeeperProjection(context, { eventLines = 160 } = {}) {
  return {
    schema_version: 1,
    phase: context.phase,
    world: pick(context.meta, ['revision', 'last_player_update', 'last_keeper_run']),
    hubs: (Array.isArray(context.hubs) ? context.hubs : [])
      .map(item => pick(item, ['id', 'name'])),
    hub_state: list(context.hubState, 'hubs')
      .map(item => pick(item, ['id', 'revision', 'status', 'pressure', 'conditions', 'clock', 'last_updated'])),
    npcs: list(context.npcs, 'npcs')
      .map(item => pick(item, ['id', 'revision', 'name', 'status', 'role', 'hub_id', 'home_location_id', 'current_location_id', 'associated_location_ids'])),
    npc_character_memories: list(context.memories, 'memories')
      .map(item => pick(item, ['id', 'revision', 'npc_id', 'character_id', 'relationship_state', 'disposition', 'trust', 'fear', 'respect', 'last_interaction', 'promises', 'grievances', 'boundaries', 'key_moments', 'npc_believes_about_character'])),
    locations: list(context.locations, 'locations')
      .map(item => pick(item, ['id', 'revision', 'name', 'hub_id', 'type', 'status', 'description', 'atmosphere', 'controller_ids'])),
    relationships: list(context.relationships, 'relationships')
      .filter(item => !item.visibility || item.visibility === 'public')
      .map(item => pick(item, ['id', 'revision', 'source', 'target', 'type', 'label', 'direction', 'visibility'])),
    arcs: list(context.arcs, 'arcs')
      .map(item => pick(item, ['id', 'revision', 'title', 'type', 'summary', 'status', 'clock', 'pressure', 'escalation', 'ignored_sessions'])),
    mysteries: list(context.mysteries, 'mysteries')
      .map(item => pick(item, ['id', 'revision', 'title', 'status', 'arc_id', 'question', 'hub_ids', 'npc_ids', 'character_ids', 'revelations', 'clues'])),
    debts: list(context.debts, 'debts')
      .filter(item => !item.visibility || item.visibility === 'public')
      .map(item => pick(item, ['id', 'revision', 'creditor_id', 'debtor_id', 'amount', 'status', 'visibility', 'source_session', 'note'])),
    interactions: list(context.interactions, 'interactions')
      .map(item => pick(item, ['id', 'revision', 'from', 'to', 'target_character_id', 'effect', 'status', 'created_at', 'expires_at'])),
    conflicts: list(context.conflicts, 'conflicts')
      .filter(item => item.status === 'pending')
      .map(item => pick(item, ['id', 'status', 'entity_id', 'expected_revision', 'actual_revision', 'fields'])),
    recent_events: String(context.events || '').split('\n').slice(0, eventLines).join('\n'),
    session_evidence: (Array.isArray(context.ledger) ? context.ledger : [])
      .map(entry => pick(entry.data, ['world_impact', 'touched', 'public_event'])),
  };
}
