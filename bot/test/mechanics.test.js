import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  auditSession,
  BASIC_MOVE_MODIFIERS,
  buildMechanicsFallback,
  buildMechanicsGateContext,
  buildMoveAuditContext,
  classifyRoll,
  createRollRecord,
  detectMechanicsExpectation,
  deriveActiveArcIds,
  formatRoll,
  mergeDebtPatches,
  mechanicsResponseProblems,
  parseRollRequest,
  reconcileArcs,
  reconcileCharacterState,
  stripRollRequest,
} from '../handlers/mechanics.js';

const state = {
  character_id: 'jacob-boone',
  stats: { Blood: 3, Heart: 1, Mind: 2, Spirit: 0 },
  circle_ratings: { Mortalis: 1, Night: 1, Power: 0, Wild: 0 },
  circle_status: { Mortalis: 1, Night: 2, Power: 0, Wild: 0 },
  last_session: 'session_009',
};

const warehouseAction = 'I find a long path to behind his vehicle, staying out of reflections and mirrors. I want to sneak up on him and then pull him out to question.';
const canalRopeAction = 'I throw the rope hoping to loop it. The rope is 100-120 feet. The objective is to loop it and use the rope to pull the thing to us.';

test('warehouse ambush is mechanically gated as Turn to Violence', () => {
  const expected = detectMechanicsExpectation(warehouseAction);
  assert.equal(expected?.move, 'Turn to Violence');
  assert.equal(expected?.modifier_key, 'Blood');
  assert.match(buildMechanicsGateContext(expected), /intent and method/i);
  assert.match(buildMechanicsGateContext(expected), /stop before resolving/i);
  assert.match(buildMechanicsGateContext(expected, 5), /behind the curtain/i);
});

test('canal transcript gates the hazardous rope cast as Keep Your Cool', () => {
  const expected = detectMechanicsExpectation(canalRopeAction, {
    lastAssistant: 'The wet concrete ends at the canal. A pale hand is held against the lock gate by the current.',
  });
  assert.equal(expected?.move, 'Keep Your Cool');
  assert.equal(expected?.modifier_key, 'Spirit');

  const skipped = 'The rope lands short. You pull it back and throw again. This time the loop catches.';
  assert.match(mechanicsResponseProblems(skipped, expected)[0], /missing required/i);

  const premature = requested('The rope catches around the shape. Use /roll.', {
    move: 'Keep Your Cool', modifier_type: 'stat', modifier_key: 'Spirit',
  });
  assert.ok(mechanicsResponseProblems(premature, expected).some(problem => /resolved Keep Your Cool/i.test(problem)));
});

test('contextual danger triggers Keep Your Cool without rolling routine transcript beats', () => {
  assert.equal(detectMechanicsExpectation('I climb the fire escape.', {
    lastAssistant: 'The rusted ladder hangs over a three-story drop.',
  })?.move, 'Keep Your Cool');
  assert.equal(detectMechanicsExpectation('I drive there quickly but stay cautious.', {
    lastAssistant: 'The streets are empty and the canal is only a few minutes away.',
  }), null);
  assert.equal(detectMechanicsExpectation('Know anything about this?'), null);
  assert.equal(detectMechanicsExpectation('He can wait. They all think they are important.'), null);
  assert.equal(detectMechanicsExpectation('I run down to Tommy and tell him to help me throw this.', {
    lastAssistant: 'Tommy crouches at the water’s edge beside the lock gate.',
  }), null);
  assert.equal(detectMechanicsExpectation('I pause and try to get a sense of what this is.'), null);
});

test('move audit surfaces a roll drought without forcing routine actions', () => {
  assert.match(buildMoveAuditContext(0), /0 player turns? since the last move request/i);
  assert.match(buildMoveAuditContext(3), /Roll drought: 3 player turns/i);
  assert.match(buildMoveAuditContext(3), /Do not manufacture a roll/i);
  assert.match(buildMoveAuditContext(3), /supernatural sense/i);
});

test('mechanics gate catches other explicit basic move declarations', () => {
  assert.equal(detectMechanicsExpectation('I flee from the gunman through the back door.')?.move, 'Escape a Situation');
  assert.equal(detectMechanicsExpectation('I threaten him until he gives me the key.')?.move, 'Persuade an NPC');
  assert.equal(detectMechanicsExpectation('I lie to her about who sent me.')?.move, 'Mislead, Distract, or Trick');
  assert.equal(detectMechanicsExpectation('I size up the guard and read him.')?.move, 'Figure Someone Out');
  assert.equal(detectMechanicsExpectation('I unleash my power and let the shadows in.')?.move, 'Let It Out');
});

test('mechanics gate avoids object handling, negation, and hypothetical questions', () => {
  assert.equal(detectMechanicsExpectation('I grab my coat and leave.'), null);
  assert.equal(detectMechanicsExpectation('I do not attack him.'), null);
  assert.equal(detectMechanicsExpectation('What if I attack him?'), null);
  assert.equal(detectMechanicsExpectation('I hit the streets to find a gun dealer.'), null);
  assert.equal(detectMechanicsExpectation('I fight the urge to answer him.'), null);
  assert.equal(detectMechanicsExpectation('I do not attack him. I restrain him.')?.move, 'Turn to Violence');
  assert.equal(detectMechanicsExpectation('I attack Priest before he reaches the door.')?.move, 'Turn to Violence');
});

function requested(text, request) {
  return text + '\n<roll_request>' + JSON.stringify(request) + '</roll_request>';
}

test('required move response cannot skip, change, continue past, or pre-resolve the roll', () => {
  const expected = detectMechanicsExpectation(warehouseAction);
  assert.match(mechanicsResponseProblems('You pull him from the truck.', expected)[0], /missing required/i);

  const wrong = requested('Pressure builds. Use /roll.', {
    move: 'Keep Your Cool', modifier_type: 'stat', modifier_key: 'Spirit',
  });
  assert.ok(mechanicsResponseProblems(wrong, expected).some(problem => /required Turn to Violence/i.test(problem)));

  const continued = requested('Your hand reaches the door. Use /roll. Then he spots you.', {
    move: 'Turn to Violence', modifier_type: 'stat', modifier_key: 'Blood',
  });
  assert.ok(mechanicsResponseProblems(continued, expected).includes('response continues after the required roll prompt'));

  const premature = requested('You grab him and pull him halfway out. Use /roll.', {
    move: 'Turn to Violence', modifier_type: 'stat', modifier_key: 'Blood',
  });
  assert.ok(mechanicsResponseProblems(premature, expected).some(problem => /resolved Turn to Violence/i.test(problem)));
});

test('valid gated response and deterministic fallback create a canonical pending request', () => {
  const expected = detectMechanicsExpectation(warehouseAction);
  const valid = requested('You reach the truck’s blind side as the driver shifts. That triggers Turn to Violence. Use /roll.', {
    move: 'Turn to Violence',
    modifier_type: 'stat',
    modifier_key: 'Blood',
    reason: 'Restrain the alert driver',
  });
  assert.deepEqual(mechanicsResponseProblems(valid, expected), []);

  const fallback = buildMechanicsFallback(expected, 3);
  assert.match(fallback, /Turn to Violence/);
  assert.match(fallback, /\/roll/);
  assert.equal(parseRollRequest(fallback)?.modifier_key, 'Blood');
  assert.doesNotMatch(stripRollRequest(buildMechanicsFallback(expected, 5)), /Turn to Violence/);
});

test('session pacing audit records mechanics-gate activity', () => {
  const audit = auditSession({ mechanicsGateTriggers: 2, rolls: [{}] });
  assert.equal(audit.mechanics_gate_triggers, 2);
  assert.equal(audit.consequential_rolls, 1);
});

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
