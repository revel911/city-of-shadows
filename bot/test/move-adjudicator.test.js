import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BASIC_MOVE_SEMANTICS,
  buildMoveAdjudicationPrompt,
  extractRollableCharacterMoves,
  parseMoveAdjudication,
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
