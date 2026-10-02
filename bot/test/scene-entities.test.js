import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatSceneEntitiesContext,
  mergeSceneEntities,
  parseSceneEntities,
  stripSceneEntities,
} from '../handlers/scene-entities.js';
import { sanitizePlayerFacingText } from '../handlers/session.js';
import { deserializeSession, serializeSession } from '../handlers/runtime-store.js';

const dock = `The thing on the dock tilts its head.
<scene_entities>[{"key":"dock_entity","label":"hooded thing on the Rocketts dock","where":"Rocketts Landing dock","wants":"the brass key","status":"present"}]</scene_entities>`;

test('parses and strips a scene entity update, including unnamed entities', () => {
  assert.deepEqual(parseSceneEntities(dock), [{
    key: 'dock_entity',
    label: 'hooded thing on the Rocketts dock',
    where: 'Rocketts Landing dock',
    wants: 'the brass key',
    status: 'present',
  }]);
  assert.equal(stripSceneEntities(dock), 'The thing on the dock tilts its head.');
});

test('invalid updates are ignored, keys fall back to the label, and bad JSON returns null', () => {
  assert.equal(parseSceneEntities('no block here'), null);
  assert.equal(parseSceneEntities('<scene_entities>{not json</scene_entities>'), null);
  assert.deepEqual(parseSceneEntities('<scene_entities>[{"label":"Tall Woman in Red","status":"sideways"},{"where":"nowhere"}]</scene_entities>'), [
    { key: 'tall_woman_in_red', label: 'Tall Woman in Red', where: '', wants: '', status: '' },
  ]);
});

test('merging keeps earlier facts, updates status, and remembers departures', () => {
  let list = mergeSceneEntities([], parseSceneEntities(dock));
  list = mergeSceneEntities(list, [{ key: 'dock_entity', label: '', where: '', wants: '', status: 'left' }]);
  assert.deepEqual(list, [{
    key: 'dock_entity',
    label: 'hooded thing on the Rocketts dock',
    where: 'Rocketts Landing dock',
    wants: 'the brass key',
    status: 'left',
  }]);
  const added = mergeSceneEntities(list, [{ key: 'ray', label: 'Ray', where: 'gym', wants: '', status: '' }]);
  assert.equal(added.length, 2);
  assert.equal(added[1].status, 'present');
  assert.equal(list.length, 1, 'merge does not mutate the earlier list');
});

test('context lists every tracked entity and the reintroduction rule', () => {
  const list = mergeSceneEntities([], [
    ...parseSceneEntities(dock),
    { key: 'ray', label: 'Ray', where: 'gym', wants: 'his box back', status: 'present' },
  ]);
  const context = formatSceneEntitiesContext(mergeSceneEntities(list, [{ key: 'dock_entity', label: '', where: '', wants: '', status: 'left' }]));
  assert.match(context, /hooded thing on the Rocketts dock — Rocketts Landing dock — wants: the brass key — left/);
  assert.match(context, /Ray — gym — wants: his box back — present/);
  assert.match(context, /left.*on-screen reason/i);
  assert.match(context, /<scene_entities>/);
  assert.match(formatSceneEntitiesContext([]), /none yet/i);
});

test('list is capped, dropping the oldest departed entities before present ones', () => {
  let list = [];
  for (let i = 0; i < 45; i += 1) {
    list = mergeSceneEntities(list, [{ key: `e${i}`, label: `Entity ${i}`, where: '', wants: '', status: i < 10 ? 'gone' : 'present' }]);
  }
  assert.equal(list.length, 40);
  assert.ok(list.every(entry => entry.status === 'present' || Number(entry.key.slice(1)) >= 5));
  assert.ok(list.some(entry => entry.key === 'e10'));
});

test('scene entity blocks never reach players, even when unterminated', () => {
  assert.equal(sanitizePlayerFacingText(dock).cleaned.trim(), 'The thing on the dock tilts its head.');
  assert.equal(sanitizePlayerFacingText('Rain.\n<scene_entities>[{"key":"x"').cleaned.trim(), 'Rain.');
});

test('scene entities survive a runtime snapshot', () => {
  const session = { player: { id: 'jacob' }, messages: [], sceneEntities: parseSceneEntities(dock) };
  assert.deepEqual(deserializeSession(JSON.parse(JSON.stringify(serializeSession(session)))).sceneEntities, session.sceneEntities);
});
