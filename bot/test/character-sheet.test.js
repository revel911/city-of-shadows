import { test } from 'node:test';
import assert from 'node:assert/strict';
import { characterSheetProblems, formatCharacterSheetForDiscord } from '../handlers/character-sheet.js';

const CANONICAL = `# Ada Vale - Character Sheet

## IDENTITY
TBD
## ARCHETYPE / PLAYBOOK
TBD
## STATS
TBD
## MOVES
TBD
## CIRCLES & STATUS
TBD
## DEBTS
TBD
## ANCHORS
TBD
## GEAR & RESOURCES
TBD
## ADVANCEMENT
TBD
## SPECIAL TRIGGERS
TBD
## NOTES & OPEN QUESTIONS
TBD`;

test('canonical sheet permits TBD while preserving every required section', () => {
  assert.deepEqual(characterSheetProblems(CANONICAL), []);
});

test('sheet validator rejects improvised or incomplete layouts', () => {
  const problems = characterSheetProblems('# Ada Vale\n\n## STATS\nBlood +1');
  assert.ok(problems.some(problem => problem.includes('needs an H1')));
  assert.ok(problems.some(problem => problem.includes('IDENTITY')));
});

test('sheet validator rejects canonical sections in a different order', () => {
  const reordered = CANONICAL.replace('## IDENTITY\nTBD\n## ARCHETYPE / PLAYBOOK', '## ARCHETYPE / PLAYBOOK\nTBD\n## IDENTITY');
  assert.ok(characterSheetProblems(reordered).includes('canonical sections are out of order'));
});

test('/sheet renderer uses live state and removes stale dynamic sheet sections', () => {
  const rendered = formatCharacterSheetForDiscord(CANONICAL, {
    character_name: 'Ada Vale',
    playbook: 'The Oracle',
    stats: { Blood: -1, Heart: 1, Mind: 2, Spirit: 0 },
    harm: 2,
    corrupt: 1,
    xp: 4,
    advances: 3,
    circle_ratings: { Mortalis: 0, Night: 1, Power: 2, Wild: -1 },
    circle_status: { Mortalis: 0, Night: 1, Power: 2, Wild: 0 },
  }, 'Fallback');
  assert.match(rendered, /Ada Vale - Live Character Sheet/);
  assert.match(rendered, /Harm:\*\* 2/);
  assert.match(rendered, /Blood:\*\* -1/);
  assert.match(rendered, /Power:\*\* Rating \+2, Status 2/);
  assert.doesNotMatch(rendered, /^## STATS$/m);
  assert.doesNotMatch(rendered, /^## CIRCLES & STATUS$/m);
  assert.match(rendered, /^## IDENTITY$/m);
});
