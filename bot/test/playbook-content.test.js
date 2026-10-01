import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractPlaybookSection } from '../handlers/mc.js';
import { extractRollableCharacterMoves } from '../handlers/move-adjudicator.js';

const playbooks = await readFile(new URL('../../mc-reference/reference/playbooks.md', import.meta.url), 'utf8');
const NEW = ['Scholar', 'Witch', 'Angel', 'Immortal', 'Dragon'];

for (const name of NEW) {
  test(`The ${name} section is complete and loads on its own`, () => {
    const section = extractPlaybookSection(playbooks, `The ${name}`);
    assert.ok(section, `missing ## The ${name}`);
    assert.match(section, new RegExp(`\\*\\*ID:\\*\\* the-${name.toLowerCase()}`));
    for (const heading of ['### Starting Profile', '### Special Mechanic', '### Moves', '#### Corruption Moves', '### Intimacy Move', '### End Move', '> **WoD:**']) {
      assert.ok(section.includes(heading), `The ${name} lacks ${heading}`);
    }
    assert.match(section, /Blood [+-]?\d, Heart [+-]?\d, Mind [+-]?\d, Spirit [+-]?\d/);
    for (const other of NEW.filter(n => n !== name)) assert.doesNotMatch(section, new RegExp(`^## The ${other}$`, 'm'));
  });
}

test('existing playbooks still extract unchanged boundaries', () => {
  assert.match(extractPlaybookSection(playbooks, 'The Veteran'), /Old Friends, Old Favors/);
  assert.doesNotMatch(extractPlaybookSection(playbooks, 'The Wolf'), /## The Scholar/);
});

test('conditional stat swaps written as sheet moves are routable', () => {
  const sheet = [
    '## MOVES',
    '- **Cowardly** — when you abandon someone in real danger to escape, roll with Mind',
    '- **Arcane Network** — when you hit the streets to consult your arcane network, roll with Mind',
  ].join('\n');
  const moves = extractRollableCharacterMoves(sheet);
  assert.deepEqual(moves.map(m => [m.name, m.modifier_key]), [['Cowardly', 'Mind'], ['Arcane Network', 'Mind']]);
});
