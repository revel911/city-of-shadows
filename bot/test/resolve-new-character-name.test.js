import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveNewCharacterName } from '../handlers/session.js';

test('prefers character_name from state_patch', () => {
  const name = resolveNewCharacterName({ character_name: 'Joe Nakama' }, null, 'joe-nakama');
  assert.equal(name, 'Joe Nakama');
});

test('falls back to first H1 of the sheet', () => {
  const sheet = '# Robert Lagrange — Character Sheet\n\nLast updated: 2026-04-30\n';
  const name = resolveNewCharacterName(null, sheet, 'robert-lagrange');
  assert.equal(name, 'Robert Lagrange');
});

test('strips em-dash and en-dash Character Sheet suffix', () => {
  assert.equal(
    resolveNewCharacterName(null, '# Ada Thorne – Character Sheet', 'ada-thorne'),
    'Ada Thorne'
  );
  assert.equal(
    resolveNewCharacterName(null, '# Ada Thorne - Character Sheet', 'ada-thorne'),
    'Ada Thorne'
  );
});

test('derives title-cased name from kebab id when nothing else available', () => {
  assert.equal(resolveNewCharacterName(null, null, 'joe-nakama'), 'Joe Nakama');
  assert.equal(resolveNewCharacterName(null, null, 'johan-van-axel'), 'Johan Van Axel');
});

test('empty state_patch.character_name falls through to next source', () => {
  const name = resolveNewCharacterName({ character_name: '   ' }, null, 'joe-nakama');
  assert.equal(name, 'Joe Nakama');
});

test('ignores non-string character_name', () => {
  const name = resolveNewCharacterName({ character_name: 123 }, null, 'joe-nakama');
  assert.equal(name, 'Joe Nakama');
});
