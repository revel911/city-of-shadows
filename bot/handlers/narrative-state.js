const MOVE_RESOLUTIONS = Object.freeze({
  'turn to violence': {
    advanced_hit: 'Inflict established harm. The opposition chooses one opposition option, and apply all three 10+ benefits: terrible harm, take something, and create an opportunity for an ally.',
    strong_hit: 'Inflict established harm. The opposition chooses one opposition option; the player also chooses one 10+ benefit.',
    weak_hit: 'Inflict established harm. The opposition chooses one opposition option.',
    miss: 'Make a hard MC move grounded in the established opposition; do not erase the attempted violence.',
  },
  'escape a situation': {
    advanced_hit: 'The character gets away, chooses one listed escape cost, and makes an important discovery.',
    strong_hit: 'The character gets away. The player chooses one listed escape cost.',
    weak_hit: 'The character gets away. The player chooses one listed escape cost and the MC chooses a different listed cost.',
    miss: 'Make a hard MC move. Change the position, danger, separation, or price of escape; do not pretend no attempt occurred.',
  },
  'persuade an npc': {
    advanced_hit: 'The NPC does what was asked and helps see it through to its end.',
    strong_hit: 'The NPC sees the point and does what was asked.',
    weak_hit: 'The NPC counters or requires payment before agreeing. State the concrete counteroffer, Debt, favor, or resource.',
    miss: 'Make a hard MC move from the NPC’s want, leverage, boundary, or faction—not arbitrary refusal.',
  },
  'figure someone out': {
    advanced_hit: 'The player may ask any questions they like, not limited to the listed questions. Answer honestly from established state.',
    strong_hit: 'The player may ask two listed questions. Answer honestly from established state.',
    weak_hit: 'The player may ask two listed questions; the target asks one listed question in return.',
    miss: 'Make a hard MC move. If the target is in the character’s Circle, the player still asks one listed question.',
  },
  'mislead, distract, or trick': {
    advanced_hit: 'They are fooled for the moment. Apply all four listed effects, and the player chooses one for double effect.',
    strong_hit: 'They are fooled for the moment. The player chooses three listed effects.',
    weak_hit: 'They are fooled for the moment. The player chooses two listed effects.',
    miss: 'Make a hard MC move from what the target notices, suspects, or does in response.',
  },
  'keep your cool': {
    advanced_hit: 'All is well, and the opposition’s cool is compromised. The player tells them what it costs to maintain their current course.',
    strong_hit: 'All is well: the stated danger or loss is avoided through the declared approach.',
    weak_hit: 'Name a concrete cost before finalizing the action. Let the player accept it or choose another course.',
    miss: 'Make a hard MC move that realizes or sharply advances the established danger.',
  },
  'let it out': {
    advanced_hit: 'The power manifests in an unexpectedly useful way. The player may mark corruption to make that manifestation a new ability.',
    strong_hit: 'The ability activates. The player chooses whether to ignore corruption or ignore the complication; apply the other.',
    weak_hit: 'The ability activates, mark corruption, and state one concrete costly, limited, or unstable complication.',
    miss: 'Make a hard MC move from the released power and its fictional tags.',
  },
  'lend a hand or get in the way': {
    advanced_hit: 'Apply the documented 10+ result: +1 to help or -2 to hinder the other PC’s roll. This move has no separate advanced outcome in the canonical project reference.',
    strong_hit: 'Apply +1 to help or -2 to hinder the other PC’s roll, as declared.',
    weak_hit: 'Apply +1 or -2, and expose this character to a concrete danger, entanglement, or cost.',
    miss: 'Make a hard MC move against the interfering character or the shared situation.',
  },
  'put a name to a face': {
    advanced_hit: 'Apply the documented 10+ result; this Circle move has no separate advanced outcome in the canonical project reference.',
    strong_hit: 'Give the established reputation. The player chooses useful prior knowledge or a Debt owed by the subject.',
    weak_hit: 'Give what most people in that Circle know about the subject.',
    miss: 'Choose: they do not know the subject, or they owe the subject a Debt. Do not invent recognition.',
  },
  'hit the streets': {
    advanced_hit: 'Apply the documented 10+ result; this Circle move has no separate advanced outcome in the canonical project reference.',
    strong_hit: 'The named contact is available and has what is needed.',
    weak_hit: 'They are available and have it. The player chooses: the contact has their own problem, or the need costs more than expected.',
    miss: 'Make a hard MC move through the contact, Circle, scarcity, or unwanted attention.',
  },
  'study a place of power': {
    advanced_hit: 'Apply the documented 10+ result; this Circle move has no separate advanced outcome in the canonical project reference.',
    strong_hit: 'Reveal what is not what it seems, answer one player question about the Circle, and grant +1 forward when acting on it.',
    weak_hit: 'Reveal one area, NPC, or item in the place that is not what it seems.',
    miss: 'Make a hard MC move from the place, its controller, or what the study exposes.',
  },
  'refuse to honor a debt': {
    advanced_hit: 'Apply the documented 10+ result; this Debt move has no separate advanced outcome in the canonical project reference.',
    strong_hit: 'They evade the obligation for now, but the Debt remains.',
    weak_hit: 'They evade it for now. The player chooses an additional Debt or corruption.',
    miss: 'The player chooses: honor the Debt, or erase all Debts owed to them by that Circle and take -1 ongoing Status there until time passes.',
  },
});

export const INVESTIGATION_DEPTH = Object.freeze({
  miss: Object.freeze({ depth: 'core', clarity: 'partial', complication: 'hard' }),
  weak_hit: Object.freeze({ depth: 'core', clarity: 'clear', complication: 'soft' }),
  strong_hit: Object.freeze({ depth: 'deep', clarity: 'clear', complication: 'none' }),
  advanced_hit: Object.freeze({ depth: 'revelatory', clarity: 'clear', complication: 'opportunity' }),
});

function slug(value) {
  return String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

function resultTier(record = {}) {
  if (record.advanced_move && Number(record.total) >= 12) return 'advanced_hit';
  return ['strong_hit', 'weak_hit', 'miss'].includes(record.result) ? record.result : 'miss';
}

export function investigationResolution(record = {}) {
  const tier = resultTier(record);
  return { tier, ...(INVESTIGATION_DEPTH[tier] || INVESTIGATION_DEPTH.miss) };
}

export function buildMoveResolutionContext(record = {}) {
  const moveKey = String(record.move || '').trim().toLowerCase();
  const tier = resultTier(record);
  const rule = MOVE_RESOLUTIONS[moveKey]?.[tier]
    || MOVE_RESOLUTIONS[moveKey]?.[record.result]
    || 'Resolve the exact move text for the authoritative tier and change the situation.';
  const investigation = ['figure someone out', 'study a place of power'].includes(moveKey)
    ? [
        'Information rule: a valid approach never produces a dead end. Give the core actionable discovery; the roll controls depth, clarity, exposure, danger, time, or cost.',
        `Investigation profile: ${JSON.stringify(investigationResolution(record))}.`,
      ]
    : [];
  return [
    '[SYSTEM — MECHANICAL RESOLUTION ORCHESTRATOR]',
    `Resolve ${record.move} at authoritative tier ${tier} (total ${record.total}).`,
    rule,
    ...investigation,
    'Resolve only this move before advancing later actions from the player’s earlier message.',
    'Never silently choose a player option. If a player choice remains, establish what the roll guarantees, present the exact choices concisely, and stop for their answer.',
    'Tie every cost and consequence to established fiction. Change position, knowledge, obligation, resources, harm, relationship, or pressure as the move requires.',
    'Carry any durable result into the next checkpoint and the session-close structured patches; narration alone is not a record.',
  ].join('\n');
}

export function deriveMysteryProgress(mystery = {}) {
  const clues = Array.isArray(mystery.clues) ? mystery.clues : [];
  const revelations = Array.isArray(mystery.revelations) ? mystery.revelations : [];
  const discoveredClues = clues.filter(clue => clue.status === 'discovered');
  const discoveredIds = new Set(discoveredClues.map(clue => clue.id));
  const derivedRevelations = revelations.map(revelation => {
    const linked = [...new Set(revelation.clue_ids || [])];
    const support = linked.filter(id => discoveredIds.has(id)).length;
    const threshold = revelation.required ? Math.min(3, Math.max(1, linked.length)) : 1;
    const status = revelation.status === 'discovered' || support >= threshold ? 'discovered' : 'hidden';
    return { ...revelation, status, support, threshold };
  });
  const discoveredRevelations = derivedRevelations.filter(item => item.status === 'discovered').length;
  let stage = 'hook';
  if (mystery.status === 'resolved') stage = 'aftermath';
  else if (discoveredRevelations && discoveredRevelations === derivedRevelations.length) stage = 'revelation';
  else if (discoveredClues.length && discoveredClues.length >= Math.ceil(Math.max(1, clues.length) * 0.6)) stage = 'convergence';
  else if (discoveredClues.length) stage = 'investigation';
  return {
    mystery: { ...mystery, stage, revelations: derivedRevelations },
    progress: {
      stage,
      discovered_clues: discoveredClues.length,
      total_clues: clues.length,
      discovered_revelations: discoveredRevelations,
      total_revelations: revelations.length,
    },
  };
}

export function withDerivedMysteryState(doc = {}) {
  return {
    ...doc,
    schema_version: Math.max(2, Number(doc.schema_version) || 1),
    mysteries: (doc.mysteries || []).map(mystery => {
      const derived = deriveMysteryProgress(mystery);
      return { ...derived.mystery, progress: derived.progress };
    }),
  };
}

export function deriveKnowledgeRecords(mysteryDoc = {}, {
  characterId,
  sessionId = '',
  stamp = '',
} = {}) {
  if (!characterId) return [];
  const records = [];
  for (const rawMystery of mysteryDoc.mysteries || []) {
    const { mystery } = deriveMysteryProgress(rawMystery);
    const knownClueIds = new Set();
    for (const clue of mystery.clues || []) {
      if (!(clue.discovered_by || []).includes(characterId)) continue;
      knownClueIds.add(clue.id);
      records.push({
        id: `knowledge_${slug(characterId)}__${slug(mystery.id)}__${slug(clue.id)}`,
        character_id: characterId,
        subject_id: mystery.id,
        kind: 'clue',
        source_ids: [clue.id],
        summary: clue.player_summary || clue.description,
        certainty: clue.certainty || 'established',
        acquired_session: sessionId,
        acquired_at: stamp,
        visibility: 'character',
      });
    }
    for (const revelation of mystery.revelations || []) {
      const linked = [...new Set(revelation.clue_ids || [])];
      const support = linked.filter(id => knownClueIds.has(id));
      const threshold = revelation.required ? Math.min(3, Math.max(1, linked.length)) : 1;
      if (!(revelation.discovered_by || []).includes(characterId) && support.length < threshold) continue;
      records.push({
        id: `knowledge_${slug(characterId)}__${slug(mystery.id)}__${slug(revelation.id)}`,
        character_id: characterId,
        subject_id: mystery.id,
        kind: 'revelation',
        source_ids: support,
        summary: revelation.player_summary || revelation.text,
        certainty: 'established',
        acquired_session: sessionId,
        acquired_at: stamp,
        visibility: 'character',
      });
    }
  }
  return records.filter(record => record.summary);
}

function pressureLinks(source = {}) {
  return [...new Set([
    ...(source.hub_ids || []),
    ...(source.npc_ids || []),
    ...(source.character_ids || []),
    source.arc_id,
  ].filter(Boolean))];
}

function arcScore(arc, characterId, activeArcIds) {
  return (Number(arc.escalation) || 0) * 2
    + (arc.status === 'escalating' ? 4 : 0)
    + (arc.character_ids?.includes(characterId) ? 6 : 0)
    + (activeArcIds.has(arc.id) ? 6 : 0)
    + (Number(arc.ignored_sessions) || 0) * 2;
}

function mysteryScore(mystery, characterId, activeArcIds) {
  const progress = mystery.progress || deriveMysteryProgress(mystery).progress;
  return (mystery.character_ids?.includes(characterId) ? 6 : 0)
    + (activeArcIds.has(mystery.arc_id) ? 4 : 0)
    + (progress.discovered_clues > 0 ? 3 : 1)
    + (progress.stage === 'convergence' ? 4 : 0)
    + (Number(mystery.pressure?.current) || 0) * 2;
}

export function buildScenePressureCandidates({
  arcs = [],
  mysteries = [],
  characterId = '',
  activeArcIds = [],
  limit = 3,
} = {}) {
  const active = new Set(activeArcIds);
  const sources = [
    ...arcs.filter(item => !['resolved', 'closed', 'failed'].includes(item.status)).map(item => ({
      id: item.id,
      kind: 'arc',
      title: item.title,
      score: arcScore(item, characterId, active),
      links: pressureLinks(item),
      why_now: item.next_pressure || item.agenda || item.summary || '',
      clock: { current: Number(item.clock?.current ?? item.escalation) || 0, max: Number(item.clock?.max) || 4 },
    })),
    ...mysteries.filter(item => item.status !== 'resolved').map(item => ({
      id: item.id,
      kind: 'mystery',
      title: item.title,
      score: mysteryScore(item, characterId, active),
      links: pressureLinks(item),
      why_now: item.next_pressure || item.question || '',
      clock: item.pressure || null,
    })),
  ];
  const intersections = [];
  for (let i = 0; i < sources.length; i += 1) {
    for (let j = i + 1; j < sources.length; j += 1) {
      const shared = sources[i].links.filter(id => sources[j].links.includes(id));
      if (!shared.length) continue;
      intersections.push({
        id: `intersection_${slug(sources[i].id)}__${slug(sources[j].id)}`,
        kind: 'intersection',
        source_ids: [sources[i].id, sources[j].id],
        title: `${sources[i].title} × ${sources[j].title}`,
        score: sources[i].score + sources[j].score + 8,
        shared_ids: shared,
        why_now: `Both pressures can act through ${shared.join(', ')} now.`,
      });
    }
  }
  return [...intersections, ...sources]
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
    .slice(0, Math.max(1, limit));
}

const ARC_IMPULSES = Object.freeze({
  threat: 'escalate toward concrete harm through existing connections',
  personal: 'complicate identity, need, loyalty, or obligation',
  'slow-burn': 'advance through institutions, routines, and relationships',
  city: 'alter a connected hub and make the change publicly observable',
});

export function withStructuredArcPressure(doc = {}, { stamp = '', bumpRevision = false } = {}) {
  let changed = false;
  const arcs = (doc.arcs || []).map(arc => {
    const clock = { ...(arc.clock || {}), current: Number(arc.escalation) || 0, max: 4, warning_at: Number(arc.clock?.warning_at) || 3 };
    const additions = {
      agenda: arc.agenda || `Bring ${arc.title} into play through an existing connected NPC, hub, or character until opposed.`,
      impulse: arc.impulse || ARC_IMPULSES[arc.type] || 'advance through an existing connection',
      clock,
    };
    const differs = !arc.agenda || !arc.impulse || JSON.stringify(arc.clock) !== JSON.stringify(clock);
    if (!differs) return arc;
    changed = true;
    return {
      ...arc,
      ...additions,
      revision: bumpRevision ? (Number(arc.revision) || 0) + 1 : (Number(arc.revision) || 0),
      last_updated: stamp || arc.last_updated || doc.last_updated || '',
    };
  });
  return {
    doc: { ...doc, schema_version: Math.max(2, Number(doc.schema_version) || 1), last_updated: changed && stamp ? stamp : doc.last_updated, arcs },
    changed,
  };
}
export function selectCityTurnPressure(arcs = [], cooldowns = {}) {
  return arcs
    .filter(arc => ['active', 'escalating'].includes(arc.status))
    .filter(arc => (Number(arc.escalation) || 0) < 4)
    .filter(arc => (Number(cooldowns?.[arc.id]) || 0) <= 0)
    .sort((a, b) =>
      (b.status === 'escalating') - (a.status === 'escalating')
      || (Number(b.ignored_sessions) || 0) - (Number(a.ignored_sessions) || 0)
      || (Number(b.escalation) || 0) - (Number(a.escalation) || 0)
      || a.id.localeCompare(b.id)
    )[0] || null;
}
export function formatScenePressureContext(options = {}) {
  const candidates = buildScenePressureCandidates(options);
  return [
    '--- STATE-DERIVED SCENE PRESSURE ---',
    'Choose from these candidates before inventing a new hook. Prefer an intersection when it supports the player’s present goal and location.',
    'For the chosen source, silently answer: Why now? What changes if the character does nothing? Which existing person, place, mystery, obligation, or clock carries it?',
    'Do not advance a terminal clock without prior player-facing warning and an opportunity to respond.',
    JSON.stringify(candidates),
  ].join('\n');
}

export function formatCharacterKnowledge(knowledge = [], characterId = '') {
  const known = knowledge.filter(item => item.character_id === characterId);
  return [
    '--- CHARACTER KNOWLEDGE (presentation boundary) ---',
    'The character may act on these established facts. Do not treat undiscovered world truth as something they know.',
    'This repository is public: this boundary controls narration and dashboard presentation, not access security.',
    JSON.stringify(known),
  ].join('\n');
}

export const BASIC_MOVE_RESOLUTIONS = MOVE_RESOLUTIONS;
