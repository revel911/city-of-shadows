import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractHubMoves, loadHubMoves, resetHubMovesCache } from '../handlers/hub-moves.js';

const creightonStyle = [
  '# Hub — Example', '', '## Hub Moves', '',
  '### Community Network',
  '**Trigger:** When you need help navigating bureaucracy.',
  '**Roll:** Heart',
  '- **10+:** Choose 2.',
  '- **Miss:** You are on your own.',
  '', '### Generational Memory',
  '**Trigger:** When you seek the community history.',
  '**Roll:** Spirit',
  '- **7-9:** Choose 1.',
  '', '---', '', '## Threats & Complications', '### Not A Move',
].join('\n');

const shockoeStyle = [
  '## Hub Moves', '',
  '### Come Out of the Woodwork',
  'When you make contact with the old networks to find someone, roll with Mortalis.',
  '- **10+:** Someone knows.',
  '', '### An Event For All Seasons',
  'When you announce an exclusive party, roll with Mind when time passes.',
  '', '### Long Live the Martyrs',
  'When you consult contacts about city history, roll with Status.',
  '', '## Locations',
].join('\n');

test('parses Trigger/Roll hub moves and stops at the next H2', () => {
  const moves = extractHubMoves(creightonStyle, 'hub_example');
  assert.deepEqual(moves.map(m => m.name), ['Community Network', 'Generational Memory']);
  assert.equal(moves[0].modifier_type, 'stat');
  assert.equal(moves[0].modifier_key, 'Heart');
  assert.equal(moves[0].rollable, true);
  assert.equal(moves[0].hub_id, 'hub_example');
  assert.match(moves[0].trigger, /navigating bureaucracy/);
  assert.match(moves[0].text, /Choose 2/);
  assert.doesNotMatch(moves[1].text, /Not A Move/);
});

test('parses inline "roll with" hub moves, including Circle rolls', () => {
  const [woodwork] = extractHubMoves(shockoeStyle, 'hub_shockoe_bottom');
  assert.equal(woodwork.modifier_type, 'circle');
  assert.equal(woodwork.circle, 'Mortalis');
  assert.equal(woodwork.rollable, true);
  assert.match(woodwork.trigger, /^When you make contact/);
});

test('moves the engine cannot resolve live are kept for narration but not rollable', () => {
  const moves = extractHubMoves(shockoeStyle, 'hub_x');
  const party = moves.find(m => m.name === 'An Event For All Seasons');
  const martyrs = moves.find(m => m.name === 'Long Live the Martyrs');
  assert.equal(party.rollable, false);   // deferred roll: "when time passes"
  assert.equal(martyrs.rollable, false); // Status is not a stat or Circle rating
  assert.match(martyrs.text, /roll with Status/);
});

test('a hub without a Hub Moves section yields no moves', () => {
  assert.deepEqual(extractHubMoves('# Hub: Carytown\n## Flavor\nQuiet.', 'hub_carytown'), []);
});

test('loader reads every indexed hub, skips unreadable files, and caches', async () => {
  resetHubMovesCache();
  let reads = 0;
  const files = {
    'hubs/a.md': '## Hub Moves\n### Alpha\nWhen you knock, roll with Heart.\n',
    'hubs/b.md': null, // missing file must not break play
  };
  const readIndex = async () => [{ id: 'hub_a', file: 'a.md' }, { id: 'hub_b', file: 'b.md' }];
  const read = async path => { reads += 1; return files[path]; };
  const first = await loadHubMoves({ read, readIndex });
  const second = await loadHubMoves({ read, readIndex });
  assert.deepEqual(first.map(m => [m.hub_id, m.name]), [['hub_a', 'Alpha']]);
  assert.equal(second, first);
  assert.equal(reads, 2);
  resetHubMovesCache();
});

test('loader always resolves to an array, even for a missing or malformed index', async () => {
  resetHubMovesCache();
  assert.deepEqual(await loadHubMoves({ read: async () => null, readIndex: async () => null }), []);
  resetHubMovesCache();
  assert.deepEqual(await loadHubMoves({ read: async () => null, readIndex: async () => ({}) }), []);
  resetHubMovesCache();
});

test('a transient read failure is not cached; the next call retries', async () => {
  resetHubMovesCache();
  let reads = 0;
  let failB = true;
  const readIndex = async () => [{ id: 'hub_a', file: 'a.md' }, { id: 'hub_b', file: 'b.md' }];
  const read = async path => {
    reads += 1;
    if (path === 'hubs/b.md' && failB) throw new Error('GitHub 503');
    return `## Hub Moves\n### ${path === 'hubs/a.md' ? 'Alpha' : 'Beta'}\nWhen you knock, roll with Heart.\n`;
  };
  const warn = console.warn;
  const warnings = [];
  console.warn = msg => warnings.push(msg);
  try {
    const first = await loadHubMoves({ read, readIndex });
    assert.deepEqual(first.map(m => m.name), ['Alpha']);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /hub_b.*GitHub 503/);
    failB = false;
    const second = await loadHubMoves({ read, readIndex });
    assert.deepEqual(second.map(m => m.name), ['Alpha', 'Beta']);
    const readsAfterSecond = reads;
    const third = await loadHubMoves({ read, readIndex });
    assert.equal(third, second);
    assert.equal(reads, readsAfterSecond);
  } finally {
    console.warn = warn;
    resetHubMovesCache();
  }
});

test('a missing index is not cached', async () => {
  resetHubMovesCache();
  assert.deepEqual(await loadHubMoves({ read: async () => null, readIndex: async () => null }), []);
  const moves = await loadHubMoves({
    read: async () => '## Hub Moves\n### Alpha\nWhen you knock, roll with Heart.\n',
    readIndex: async () => [{ id: 'hub_a', file: 'a.md' }],
  });
  assert.equal(moves.length, 1);
  resetHubMovesCache();
});
