import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BASIC_MOVE_RESOLUTIONS,
  buildMoveResolutionContext,
  buildScenePressureCandidates,
  deriveKnowledgeRecords,
  deriveMysteryProgress,
  investigationResolution,
  selectCityTurnPressure,
  withDerivedMysteryState,
  withStructuredArcPressure,
} from '../handlers/narrative-state.js';

test('every basic rollable move has explicit miss, weak, and strong resolution', () => {
  assert.equal(Object.keys(BASIC_MOVE_RESOLUTIONS).length, 12);
  for (const [move, tiers] of Object.entries(BASIC_MOVE_RESOLUTIONS)) {
    assert.ok(tiers.miss, `${move} needs a miss rule`);
    assert.ok(tiers.weak_hit, `${move} needs a weak-hit rule`);
    assert.ok(tiers.strong_hit, `${move} needs a strong-hit rule`);
    assert.ok(tiers.advanced_hit, `${move} needs an explicit advanced-result rule`);
  }
});

test('eligible 12+ rolls use the documented advanced outcome', () => {
  const result = buildMoveResolutionContext({
    move: 'Turn to Violence', result: 'strong_hit', total: 12, advanced_move: true,
  });
  assert.match(result, /opposition chooses one opposition option/);
  assert.match(result, /all three 10\+ benefits/);
  assert.match(result, /authoritative tier advanced_hit/);
});

test('roll resolution keeps player choices with the player', () => {
  const result = buildMoveResolutionContext({
    move: 'Keep Your Cool', result: 'weak_hit', total: 8,
  });
  assert.match(result, /Name a concrete cost before finalizing/);
  assert.match(result, /Never silently choose a player option/);
  assert.match(result, /session-close structured patches/);
});

test('investigation always yields core discovery while tier controls depth and complication', () => {
  assert.deepEqual(investigationResolution({ result: 'miss', total: 5 }), {
    tier: 'miss', depth: 'core', clarity: 'partial', complication: 'hard',
  });
  assert.deepEqual(investigationResolution({ result: 'weak_hit', total: 8 }), {
    tier: 'weak_hit', depth: 'core', clarity: 'clear', complication: 'soft',
  });
  assert.deepEqual(investigationResolution({ result: 'strong_hit', total: 12, advanced_move: true }), {
    tier: 'advanced_hit', depth: 'revelatory', clarity: 'clear', complication: 'opportunity',
  });
  const context = buildMoveResolutionContext({ move: 'Study a Place of Power', result: 'miss', total: 4 });
  assert.match(context, /never produces a dead end/i);
  assert.match(context, /core actionable discovery/i);
});

function mystery() {
  return {
    id: 'mystery_archive', title: 'The Missing File', status: 'active',
    clues: [
      { id: 'clue_a', description: 'The seal was cut.', status: 'discovered', discovered_by: ['jacob'] },
      { id: 'clue_b', description: 'The camera looped.', status: 'discovered', discovered_by: ['ada'] },
      { id: 'clue_c', description: 'A clerk was paid.', status: 'discovered', discovered_by: ['jacob'] },
    ],
    revelations: [{
      id: 'revelation_inside_job', text: 'The theft was an inside job.', required: true,
      clue_ids: ['clue_a', 'clue_b', 'clue_c'],
    }],
  };
}

test('mystery progress is derived from monotonic clue state', () => {
  const derived = deriveMysteryProgress(mystery());
  assert.equal(derived.progress.discovered_clues, 3);
  assert.equal(derived.progress.discovered_revelations, 1);
  assert.equal(derived.progress.stage, 'revelation');
  const doc = withDerivedMysteryState({ schema_version: 1, mysteries: [mystery()] });
  assert.equal(doc.schema_version, 2);
  assert.equal(doc.mysteries[0].progress.total_clues, 3);
});

test('character knowledge never inherits another character’s discoveries', () => {
  const jacob = deriveKnowledgeRecords({ mysteries: [mystery()] }, {
    characterId: 'jacob', sessionId: 'jacob:session_2', stamp: '2026-08-26',
  });
  assert.deepEqual(jacob.filter(item => item.kind === 'clue').map(item => item.source_ids[0]), ['clue_a', 'clue_c']);
  assert.equal(jacob.some(item => item.kind === 'revelation'), false);
  const ada = deriveKnowledgeRecords({ mysteries: [mystery()] }, { characterId: 'ada' });
  assert.deepEqual(ada.map(item => item.source_ids[0]), ['clue_b']);
});

test('scene orchestration prefers intersections of existing pressure', () => {
  const candidates = buildScenePressureCandidates({
    characterId: 'jacob', activeArcIds: ['arc-1'],
    arcs: [{
      id: 'arc-1', title: 'The Collector', status: 'escalating', escalation: 3,
      character_ids: ['jacob'], hub_ids: ['hub-docks'], next_pressure: 'A witness disappears.',
    }],
    mysteries: [{
      id: 'mystery-1', title: 'Missing Witnesses', status: 'active', arc_id: 'arc-1',
      character_ids: ['jacob'], hub_ids: ['hub-docks'], clues: [], revelations: [],
    }],
  });
  assert.equal(candidates[0].kind, 'intersection');
  assert.deepEqual(candidates[0].source_ids, ['arc-1', 'mystery-1']);
});
test('city turns pick one eligible uncapped pressure and respect cooldowns', () => {
  const arcs = [
    { id: 'arc-maxed', status: 'escalating', escalation: 4 },
    { id: 'arc-hot', status: 'escalating', escalation: 3, ignored_sessions: 1 },
    { id: 'arc-cool', status: 'escalating', escalation: 3, ignored_sessions: 2 },
    { id: 'arc-low', status: 'active', escalation: 1 },
  ];
  assert.equal(selectCityTurnPressure(arcs, { 'arc-cool': 1 }).id, 'arc-hot');
  assert.equal(selectCityTurnPressure(arcs, { 'arc-cool': 1, 'arc-hot': 1 }).id, 'arc-low');
});
test('arc pressure migration keeps the clock synchronized with escalation', () => {
  const result = withStructuredArcPressure({
    schema_version: 1,
    arcs: [{ id: 'arc-1', title: 'Pressure', type: 'threat', escalation: 2, clock: { current: 1, max: 6 } }],
  });
  assert.equal(result.changed, true);
  assert.deepEqual(result.doc.arcs[0].clock, { current: 2, max: 4, warning_at: 3 });
  assert.match(result.doc.arcs[0].agenda, /Pressure/);
  assert.match(result.doc.arcs[0].impulse, /concrete harm/);
});