import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BASIC_MOVE_MODIFIERS,
  classifyRoll,
  createRollRecord,
  deriveActiveArcIds,
  formatRoll,
  mergeDebtPatches,
  parseRollRequest,
  reconcileArcs,
  reconcileCharacterState,
} from '../handlers/mechanics.js';

const state = {
  character_id: 'jacob-boone',
  stats: { Blood: 3, Heart: 1, Mind: 2, Spirit: 0 },
  circle_ratings: { Mortalis: 1, Night: 1, Power: 0, Wild: 0 },
  circle_status: { Mortalis: 1, Night: 2, Power: 0, Wild: 0 },
  last_session: 'session_009',
};

test('every canonical basic move has a deterministic modifier source', () => {
  const expected = [
    'turn to violence', 'escape a situation', 'persuade an npc',
    'figure someone out', 'mislead, distract, or trick', 'keep your cool',
    'let it out', 'lend a hand or get in the way', 'put a name to a face',
    'hit the streets', 'study a place of power', 'refuse to honor a debt',
  ];
  assert.deepEqual(Object.keys(BASIC_MOVE_MODIFIERS), expected);
  for (const move of expected) {
    const source = BASIC_MOVE_MODIFIERS[move];
    const request = {
      move,
      modifier_type: source.type,
      modifier_key: source.key,
      circle: ['circle', 'status_difference'].includes(source.type) ? 'Night' : null,
      creditor_status: 1,
      forward: 0,
    };
    const record = createRollRecord({
      request, state, instinct: 3, other: 4, sessionId: 'fixture', characterId: 'jacob-boone',
    });
    assert.equal(record.result, record.total >= 10 ? 'strong_hit' : 'weak_hit', move);
  }
});

test('canonical city move stat overrides a contradictory model request', () => {
  const request = parseRollRequest(
    '<roll_request>{"move":"Keep Your Cool","modifier_type":"stat","modifier_key":"Blood"}</roll_request>'
  );
  const record = createRollRecord({
    request, state, instinct: 3, other: 4, sessionId: 'thread-test', characterId: 'jacob-boone',
  });
  assert.equal(record.modifier_key, 'Spirit');
  assert.equal(record.modifier, 0);
});

test('character playbook move overrides beat the canonical default', () => {
  const request = parseRollRequest(
    '<roll_request>{"move":"Persuade an NPC","modifier_type":"stat","modifier_key":"Heart"}</roll_request>'
  );
  const record = createRollRecord({
    request,
    state: {
      ...state,
      playbook_state: { move_modifiers: { 'Persuade an NPC': { type: 'stat', key: 'Spirit' } } },
    },
    instinct: 3,
    other: 4,
    sessionId: 'thread-test',
    characterId: 'jacob-boone',
  });
  assert.equal(record.modifier_key, 'Spirit');
  assert.equal(record.modifier, 0);
});

test('roll resolution calculates tiers, cap, and Instinct extreme failure', () => {
  assert.equal(classifyRoll(6), 'miss');
  assert.equal(classifyRoll(7), 'weak_hit');
  assert.equal(classifyRoll(10), 'strong_hit');

  const extreme = createRollRecord({
    request: { move: 'Keep Your Cool', modifier_type: 'stat', modifier_key: 'Spirit', forward: 0 },
    state,
    instinct: 1,
    other: 5,
    sessionId: 'thread-test',
    characterId: 'jacob-boone',
    rolledAt: '2026-08-21T12:00:00.000Z',
  });
  assert.equal(extreme.total, 6);
  assert.equal(extreme.result, 'miss');
  assert.equal(extreme.extreme_failure, true);

  const capped = createRollRecord({
    request: { move: 'Turn to Violence', modifier_type: 'stat', modifier_key: 'Blood', forward: 3 },
    state,
    instinct: 6,
    other: 6,
    sessionId: 'thread-test',
    characterId: 'jacob-boone',
  });
  assert.equal(capped.modifier, 4);
  assert.equal(capped.total, 16);
});

test('mechanics depth changes presentation without changing the record', () => {
  const record = {
    move: 'Keep Your Cool', modifier_key: 'Spirit', instinct_die: 2, other_die: 5,
    modifier: 0, total: 7, result: 'weak_hit', extreme_failure: false,
  };
  assert.match(formatRoll(record, 1), /Keep Your Cool/);
  assert.match(formatRoll(record, 2), /Instinct/);
  assert.match(formatRoll(record, 3), /7/);
  assert.match(formatRoll(record, 4), /Fate check/);
  assert.doesNotMatch(formatRoll(record, 5), /7|Keep Your Cool|Spirit/);
});

test('state close increments session, clamps ranges, marks Circles, and derives arcs', () => {
  const result = reconcileCharacterState(state, {
    harm: 99,
    stats: { Blood: 9, Ghost: 2 },
    last_session: 'session_999',
    active_arc_ids: ['arc-wrong'],
  }, {
    characterId: 'jacob-boone',
    activeArcIds: ['arc-002'],
    rolls: [{ circle: 'Night' }],
  });
  assert.equal(result.state.last_session, 'session_010');
  assert.equal(result.state.harm, 5);
  assert.equal(result.state.stats.Blood, 4);
  assert.equal('Ghost' in result.state.stats, false);
  assert.deepEqual(result.state.active_arc_ids, ['arc-002']);
  assert.equal(result.state.circle_marks.Night, true);
  assert.ok(result.warnings.length >= 2);
});

test('involved untouched arcs gain pressure after two ignored sessions', () => {
  const initial = {
    arcs: [{
      id: 'arc-001', status: 'active', escalation: 2,
      ignored_sessions: 1, character_ids: ['jacob-boone'],
    }],
  };
  const next = reconcileArcs(initial, [], {
    characterId: 'jacob-boone', sessionId: 'thread-test', stamp: '2026-08-21',
  });
  assert.equal(next.arcs[0].escalation, 3);
  assert.equal(next.arcs[0].ignored_sessions, 0);
  assert.equal(next.arcs[0].status, 'escalating');
  assert.deepEqual(deriveActiveArcIds(next, 'jacob-boone'), ['arc-001']);
});

test('marking the fourth Circle clears the track and grants an advance', () => {
  const result = reconcileCharacterState({
    ...state,
    advances: 8,
    circle_marks: { Mortalis: true, Night: true, Power: true, Wild: false },
  }, { circle_marks: { Wild: true } }, { characterId: 'jacob-boone' });
  assert.equal(result.state.advances, 9);
  assert.deepEqual(result.state.circle_marks, {
    Mortalis: false, Night: false, Power: false, Wild: false,
  });
});

test('Debt patches enforce public distinct parties and settle at zero', () => {
  const result = mergeDebtPatches({ debts: [] }, [
    { id: 'debt_jacob_priest', creditor_id: 'jacob-boone', debtor_id: 'npc_priest', amount: 0 },
    { id: 'bad', creditor_id: 'a', debtor_id: 'b', amount: 1 },
    { id: 'debt_secret', creditor_id: 'a', debtor_id: 'b', amount: 1, visibility: 'mc' },
  ], { sessionId: 'thread-test', stamp: '2026-08-21' });
  assert.equal(result.doc.debts.length, 1);
  assert.equal(result.doc.debts[0].status, 'settled');
  assert.equal(result.doc.debts[0].visibility, 'public');
  assert.equal(result.rejected.length, 2);
});
