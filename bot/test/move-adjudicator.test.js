import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BASIC_MOVE_SEMANTICS,
  buildClarificationAdjudicationText,
  buildMoveAdjudicationPrompt,
  extractRollableCharacterMoves,
  parseMoveAdjudication,
  sameClarificationQuestion,
} from '../handlers/move-adjudicator.js';

const jacobSheet = await readFile(
  new URL('../../players/jacob-boone/sheet.md', import.meta.url),
  'utf8'
);

test('all basic moves have structured semantic triggers, exclusions, and requirements', () => {
  assert.equal(Object.keys(BASIC_MOVE_SEMANTICS).length, 12);
  for (const semantics of Object.values(BASIC_MOVE_SEMANTICS)) {
    assert.equal(typeof semantics.trigger, 'string');
    assert.ok(semantics.trigger.length > 10);
    assert.ok(semantics.non_triggers.length >= 2);
    assert.ok(semantics.requirements.length >= 2);
  }
  assert.match(
    BASIC_MOVE_SEMANTICS['put a name to a face'].non_triggers.join(' '),
    /symbol, sigil, emblem, logo/,
  );
});
test('extracts every rollable move from Jacob legacy sheet format', () => {
  const moves = extractRollableCharacterMoves(jacobSheet);
  assert.deepEqual(moves.map(move => move.name), [
    'Old Friends, Old Favors',
    'The Best Laid Plans',
    'Invested',
    'Voice of Command',
    'Silent Fog',
  ]);
  assert.equal(moves.find(move => move.name === 'Voice of Command')?.modifier_key, 'Heart');
  assert.equal(moves.find(move => move.name === 'Silent Fog')?.modifier_key, 'Spirit');
});

test('extracts rollable moves from the canonical nested MOVES format', () => {
  const sheet = [
    '# Test Character - Character Sheet',
    '## MOVES',
    '### Playbook',
    '- Direct Order - give an order or warning, roll Heart.',
    '### Extension / Subtype',
    '- Call the Storm - release the storm, roll Spirit.',
    '## CIRCLES & STATUS',
  ].join('\n');
  assert.deepEqual(
    extractRollableCharacterMoves(sheet).map(move => move.name),
    ['Direct Order', 'Call the Storm']
  );
});

test('validates connecting a person’s name and face as Put a Name to a Face', () => {
  const result = parseMoveAdjudication(JSON.stringify({
    decision: 'roll',
    move: 'Put a Name to a Face',
    circle: 'Night',
    reason: 'Connect the vampire courier’s face to the name Mara Vale',
  }));
  assert.equal(result?.decision, 'roll');
  assert.equal(result.expectation.move, 'Put a Name to a Face');
  assert.equal(result.expectation.modifier_type, 'circle');
  assert.equal(result.expectation.circle, 'Night');
});

test('validates exact character moves and rejects invented moves', () => {
  const command = parseMoveAdjudication(JSON.stringify({
    decision: 'roll',
    move: 'Voice of Command',
    reason: 'Jacob gives the armed courier a direct warning',
  }), { sheet: jacobSheet });
  assert.equal(command?.expectation.move, 'Voice of Command');
  assert.equal(command?.expectation.modifier_key, 'Heart');
  assert.equal(command?.expectation.modifier_type, 'stat');

  assert.equal(parseMoveAdjudication(JSON.stringify({
    decision: 'roll',
    move: 'Know Weird Stuff',
    reason: 'Invented knowledge check',
  }), { sheet: jacobSheet }), null);
});

test('requires creditor Status for Refuse to Honor a Debt', () => {
  const refusal = parseMoveAdjudication(JSON.stringify({
    decision: 'roll',
    move: 'Refuse to Honor a Debt',
    circle: 'Night',
    creditor_status: 2,
    reason: 'Refuse Dara Shin, a Status-2 Night creditor',
  }));
  assert.equal(refusal?.expectation.creditor_status, 2);
  assert.equal(refusal?.expectation.modifier_type, 'status_difference');

  assert.equal(parseMoveAdjudication(JSON.stringify({
    decision: 'roll',
    move: 'Refuse to Honor a Debt',
    circle: 'Night',
    reason: 'Creditor Status is missing',
  })), null);
});
test('requires a known Circle and preserves concise clarification questions', () => {
  assert.equal(parseMoveAdjudication(JSON.stringify({
    decision: 'roll',
    move: 'Put a Name to a Face',
    circle: null,
    reason: 'Unknown supernatural affiliation',
  })), null);

  assert.deepEqual(parseMoveAdjudication(JSON.stringify({
    decision: 'clarify',
    question: 'Are you studying it normally or using your supernatural senses',
    reason: 'The method changes the move',
  })), {
    decision: 'clarify',
    question: 'Are you studying it normally or using your supernatural senses?',
    reason: 'The method changes the move',
  });
});

test('adjudication prompt includes active moves and excludes symbol recall', () => {
  const prompt = buildMoveAdjudicationPrompt({
    playerText: 'Do I recognize the serpent tattoo?',
    lastAssistant: 'The mark flashed when the thing in the canal looked at Tommy.',
    sheet: jacobSheet,
  });
  assert.match(prompt, /Voice of Command/);
  assert.match(prompt, /Silent Fog/);
  assert.match(prompt, /symbol, sigil, emblem, logo, object, place, or writing does not trigger it/i);
  assert.match(prompt, /Put a Name to a Face/);
  assert.match(prompt, /Do not add a separate difficulty, uncertainty, or drama test/);
});

test('clarification transcript preserves the original action and every answer', () => {
  const text = buildClarificationAdjudicationText({
    originalPlayerText: 'I actively read one of them.',
    exchanges: [
      { question: 'Which person, and what do you want to learn?', answer: 'Whether he is involved.' },
      { question: 'Which person?', answer: 'The one closest.' },
    ],
  });
  assert.match(text, /original declared action: I actively read one of them/i);
  assert.match(text, /whether he is involved/i);
  assert.match(text, /the one closest/i);
  assert.match(text, /do not repeat an answered question/i);
});

test('repeated clarification questions compare without punctuation or case', () => {
  assert.equal(
    sameClarificationQuestion(
      'Which person is Cristoff actively reading?',
      'which person is cristoff actively reading'
    ),
    true
  );
  assert.equal(sameClarificationQuestion('Which person?', 'What do you want to learn?'), false);
});

const hubMoves = [
  { hub_id: 'hub_creighton_court', name: 'Community Network', trigger: 'When you need help navigating bureaucracy.', modifier_type: 'stat', modifier_key: 'Heart', circle: null, rollable: true, text: '' },
  { hub_id: 'hub_shockoe_bottom', name: 'Come Out of the Woodwork', trigger: 'When you contact the old networks, roll with Mortalis.', modifier_type: 'circle', modifier_key: null, circle: 'Mortalis', rollable: true, text: '' },
  { hub_id: 'hub_x', name: 'An Event For All Seasons', trigger: 'When you announce a party', modifier_type: 'stat', modifier_key: 'Mind', circle: null, rollable: false, text: '' },
];

test('hub moves are listed for the router with their hub, and unrollable ones are omitted', () => {
  const prompt = buildMoveAdjudicationPrompt({ playerText: 'x', hubMoves });
  assert.match(prompt, /HUB MOVES/);
  assert.match(prompt, /Community Network \[Heart\] \(hub_creighton_court\)/);
  assert.doesNotMatch(prompt, /An Event For All Seasons/);
});

test('a hub-move roll parses into a normal expectation', () => {
  const stat = parseMoveAdjudication('{"decision":"roll","move":"Community Network","circle":null,"creditor_status":null,"reason":"asks the tenants council"}', { hubMoves });
  assert.equal(stat.expectation.move, 'Community Network');
  assert.equal(stat.expectation.modifier_type, 'stat');
  assert.equal(stat.expectation.modifier_key, 'Heart');
  const circle = parseMoveAdjudication('{"decision":"roll","move":"Come Out of the Woodwork","circle":null,"creditor_status":null,"reason":"r"}', { hubMoves });
  assert.equal(circle.expectation.circle, 'Mortalis');
});

test('unrollable hub moves and unknown names are still rejected', () => {
  assert.equal(parseMoveAdjudication('{"decision":"roll","move":"An Event For All Seasons","reason":"r"}', { hubMoves }), null);
  assert.equal(parseMoveAdjudication('{"decision":"roll","move":"Invented Move","reason":"r"}', { hubMoves }), null);
});

test('a sheet move beats a hub move with the same name', () => {
  const sheet = '## MOVES\n- **Community Network** — when you rally neighbors, roll with Spirit\n';
  const result = parseMoveAdjudication('{"decision":"roll","move":"Community Network","reason":"r"}', { sheet, hubMoves });
  assert.equal(result.expectation.modifier_key, 'Spirit');
});

test('existing callers without hubMoves behave exactly as before', () => {
  const before = parseMoveAdjudication('{"decision":"roll","move":"Community Network","reason":"r"}');
  assert.equal(before, null);
});

const placedHubMoves = [
  {
    ...hubMoves[0],
    hub_name: 'Creighton Court',
    location_names: ['East End Family Resource Center', 'Court Basketball', 'Loc 3', 'Loc 4', 'Loc 5', 'Loc 6', 'Loc 7'],
  },
  { ...hubMoves[1], hub_name: 'Shockoe Bottom', location_names: [] },
];

test('router hub-move listing names the hub and its locations, capped, with a placement rule', () => {
  const prompt = buildMoveAdjudicationPrompt({ playerText: 'x', hubMoves: placedHubMoves });
  assert.match(prompt, /- Community Network \[Heart\] \(Creighton Court — East End Family Resource Center, Court Basketball, Loc 3, Loc 4, Loc 5, Loc 6\): When you need help/);
  assert.doesNotMatch(prompt, /Loc 7/);
  assert.match(prompt, /- Come Out of the Woodwork \[Mortalis\] \(Shockoe Bottom\): /);
  assert.match(prompt, /Choose a hub move only when the immediate prior fiction or the player message places the current scene inside that hub/);
  assert.match(prompt, /never clarify just to establish location/i);
});

test('router prompt is byte-identical when there are no rollable hub moves', () => {
  const sheet = '## MOVES\n- **Community Network** — when you rally neighbors, roll with Spirit\n';
  const args = { playerText: 'I knock.', lastAssistant: 'The door.', sheet };
  const base = buildMoveAdjudicationPrompt(args);
  assert.equal(buildMoveAdjudicationPrompt({ ...args, hubMoves: [] }), base);
  assert.equal(buildMoveAdjudicationPrompt({ ...args, hubMoves: [hubMoves[2]] }), base);
  assert.doesNotMatch(base, /hub move/i);
});

test('a hub-move expectation carries hub_id; sheet and basic expectations do not', () => {
  const hub = parseMoveAdjudication('{"decision":"roll","move":"Community Network","reason":"r"}', { hubMoves });
  assert.equal(hub.expectation.hub_id, 'hub_creighton_court');
  const sheet = '## MOVES\n- **Community Network** — when you rally neighbors, roll with Spirit\n';
  const sheetMove = parseMoveAdjudication('{"decision":"roll","move":"Community Network","reason":"r"}', { sheet, hubMoves });
  assert.equal('hub_id' in sheetMove.expectation, false);
  const basic = parseMoveAdjudication('{"decision":"roll","move":"Keep Your Cool","reason":"r"}', { hubMoves });
  assert.equal('hub_id' in basic.expectation, false);
});

test('a hub Circle move keeps its own Circle over a different router circle', () => {
  const result = parseMoveAdjudication('{"decision":"roll","move":"Come Out of the Woodwork","circle":"Night","reason":"r"}', { hubMoves });
  assert.equal(result.expectation.circle, 'Mortalis');
  const sheet = '## MOVES\n- **Old Friends** — when you call on old friends, roll with their Mortalis\n';
  const sheetMove = parseMoveAdjudication('{"decision":"roll","move":"Old Friends","circle":"Night","reason":"r"}', { sheet, hubMoves });
  assert.equal(sheetMove.expectation.circle, 'Night', 'sheet Circle moves keep the router circle exactly as before');
});
