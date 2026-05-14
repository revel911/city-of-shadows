# Bot Read Commands Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add six read-only slash commands (`/sheet`, `/state`, `/events`, `/npc`, `/hub`, `/arcs`) that surface game state inside Discord without opening a session.

**Architecture:** Each command is its own file under `bot/commands/`, picked up by the existing auto-loader in `bot/index.js` and `bot/deploy-commands.js`. Shared logic — character resolution, chunked send, formatters, parsers — lives in a new `bot/handlers/read-utils.js`. Pure functions are TDD'd with Node's built-in `node --test` runner (no new deps). The Discord-layer `execute` handlers are thin glue verified manually after deploy.

**Tech Stack:** Node 20+, discord.js 14, GitHub Contents API (existing `handlers/github.js`), `node --test`.

**Spec:** [docs/superpowers/specs/2026-05-14-bot-read-commands-design.md](../specs/2026-05-14-bot-read-commands-design.md)

---

## File Structure

**New files:**

| Path | Responsibility |
|---|---|
| `bot/handlers/read-utils.js` | Shared helpers: `resolveCharacterFromList`, `resolveCharacter`, `chunk`, `sendChunked`, `formatNpc`, `formatArc`, `parseRecentEvents` |
| `bot/commands/sheet.js` | `/sheet [character]` — reads `players/<id>/sheet.md` |
| `bot/commands/state.js` | `/state [character]` — reads `players/<id>/state.json` |
| `bot/commands/events.js` | `/events [n]` — reads `game/events-log.md` |
| `bot/commands/npc.js` | `/npc <name>` — reads `game/npcs.json` |
| `bot/commands/hub.js` | `/hub <name>` — reads `hubs/<file>.md` via `hubs/index.json` |
| `bot/commands/arcs.js` | `/arcs [status]` — reads `game/arcs.json` |
| `bot/test/resolve-character.test.js` | Unit tests for `resolveCharacterFromList` |
| `bot/test/parse-events.test.js` | Unit tests for `parseRecentEvents` |
| `bot/test/format-npc.test.js` | Unit tests for `formatNpc` |
| `bot/test/format-arc.test.js` | Unit tests for `formatArc` |

**Modified files:**

| Path | Change |
|---|---|
| `bot/package.json` | Add `"test": "node --test test/"` to scripts |
| `bot/handlers/session.js` | Replace inline `chunk()` (lines 55-70) with `import { chunk } from './read-utils.js'` |
| `bot/commands/play.js` | Replace `resolveCharacter` (lines 86-91) with `import { resolveCharacterFromList } from '../handlers/read-utils.js'` |

---

## Task 1: Add test script to package.json

**Files:**
- Modify: `bot/package.json`

- [ ] **Step 1: Add the test script**

Edit `bot/package.json` `scripts` block to add a `test` entry. The full scripts block becomes:

```json
"scripts": {
  "start": "node index.js",
  "deploy": "node deploy-commands.js",
  "test": "node --test test/"
}
```

- [ ] **Step 2: Create the test directory**

Create the directory `bot/test/` (empty for now).

- [ ] **Step 3: Verify the runner works**

Run from `bot/`:
```
npm test
```
Expected output (no test files yet):
```
> node --test test/
ℹ tests 0
ℹ pass 0
ℹ fail 0
```

- [ ] **Step 4: Commit**

```
git add bot/package.json
git commit -m "chore(bot): add node --test runner"
```

---

## Task 2: Scaffold read-utils.js

**Files:**
- Create: `bot/handlers/read-utils.js`

- [ ] **Step 1: Create the file with the import the rest will need**

```js
// bot/handlers/read-utils.js
// Shared helpers for the read commands and the existing session sender.

import { listPlayers } from './github.js';

// Filled in by subsequent tasks.
```

- [ ] **Step 2: Verify import resolves**

Run from `bot/`:
```
node --check handlers/read-utils.js
```
Expected: no output (file parses).

- [ ] **Step 3: Commit**

```
git add bot/handlers/read-utils.js
git commit -m "feat(bot): scaffold read-utils helper module"
```

---

## Task 3: TDD `resolveCharacterFromList`

This is a pure variant of the existing `resolveCharacter` in `commands/play.js`. It takes the player list as an argument so it's testable without `fetch`. A thin wrapper that does the fetch lives in Task 6.

**Files:**
- Create: `bot/test/resolve-character.test.js`
- Modify: `bot/handlers/read-utils.js`

- [ ] **Step 1: Write the failing test**

Create `bot/test/resolve-character.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveCharacterFromList } from '../handlers/read-utils.js';

const players = [
  { id: 'chris-caustes', name: 'Chris Caustes' },
  { id: 'johan-van-axel', name: 'Johan van Axel' },
];

test('arg matches by id', () => {
  const result = resolveCharacterFromList('chris-caustes', 'someone-else', players);
  assert.equal(result?.id, 'chris-caustes');
});

test('arg matches by name case-insensitive', () => {
  const result = resolveCharacterFromList('CHRIS CAUSTES', 'someone-else', players);
  assert.equal(result?.id, 'chris-caustes');
});

test('no arg falls back to discord username match', () => {
  const result = resolveCharacterFromList(null, 'Chris Caustes', players);
  assert.equal(result?.id, 'chris-caustes');
});

test('no arg, no username match returns null', () => {
  const result = resolveCharacterFromList(null, 'nobody', players);
  assert.equal(result, null);
});

test('arg with no match returns null', () => {
  const result = resolveCharacterFromList('made-up-id', 'whoever', players);
  assert.equal(result, null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run from `bot/`:
```
npm test
```
Expected: 5 failures, each saying something like `resolveCharacterFromList is not a function` or `Cannot read properties of undefined`.

- [ ] **Step 3: Write minimal implementation**

Append to `bot/handlers/read-utils.js`:

```js
export function resolveCharacterFromList(arg, discordUsername, players) {
  if (arg) {
    return players.find(p =>
      p.id === arg ||
      p.name.toLowerCase() === arg.toLowerCase()
    ) || null;
  }
  return players.find(p =>
    p.name.toLowerCase() === discordUsername.toLowerCase()
  ) || null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run from `bot/`:
```
npm test
```
Expected: `tests 5  pass 5  fail 0`.

- [ ] **Step 5: Commit**

```
git add bot/handlers/read-utils.js bot/test/resolve-character.test.js
git commit -m "feat(bot): add resolveCharacterFromList with tests"
```

---

## Task 4: TDD `parseRecentEvents`

Parses `game/events-log.md` into H2-section blocks. The file is newest-first by convention.

**Files:**
- Create: `bot/test/parse-events.test.js`
- Modify: `bot/handlers/read-utils.js`

- [ ] **Step 1: Write the failing test**

Create `bot/test/parse-events.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRecentEvents } from '../handlers/read-utils.js';

const sample = `# Header

Some intro text.

---

<!-- MC: append above this line -->

## [2026-04-24] Newest Event

First paragraph of newest.

Second paragraph of newest.

## [2026-04-20] Middle Event

Middle event body.

## [2026-04-15] Oldest Event

Oldest body.
`;

test('returns first N H2 sections (newest first)', () => {
  const result = parseRecentEvents(sample, 2);
  assert.equal(result.length, 2);
  assert.ok(result[0].startsWith('## [2026-04-24] Newest Event'));
  assert.ok(result[0].includes('Second paragraph of newest.'));
  assert.ok(result[1].startsWith('## [2026-04-20] Middle Event'));
});

test('returns all when N exceeds available', () => {
  const result = parseRecentEvents(sample, 99);
  assert.equal(result.length, 3);
});

test('returns empty array when no H2 sections exist', () => {
  const result = parseRecentEvents('# Title only\n\nNo sections here.', 3);
  assert.deepEqual(result, []);
});

test('returns empty array for empty input', () => {
  assert.deepEqual(parseRecentEvents('', 3), []);
});

test('strips trailing whitespace on each section', () => {
  const result = parseRecentEvents(sample, 1);
  assert.equal(result[0].endsWith('\n'), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run from `bot/`:
```
npm test
```
Expected: 5 failures saying `parseRecentEvents is not a function`.

- [ ] **Step 3: Write minimal implementation**

Append to `bot/handlers/read-utils.js`:

```js
export function parseRecentEvents(markdown, n) {
  if (!markdown) return [];
  const matches = [...markdown.matchAll(/^## .+$/gm)];
  if (matches.length === 0) return [];

  const sections = [];
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].index;
    const end = i + 1 < matches.length ? matches[i + 1].index : markdown.length;
    sections.push(markdown.slice(start, end).trimEnd());
  }
  return sections.slice(0, n);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run from `bot/`:
```
npm test
```
Expected: all 10 tests pass (5 new + 5 from Task 3).

- [ ] **Step 5: Commit**

```
git add bot/handlers/read-utils.js bot/test/parse-events.test.js
git commit -m "feat(bot): add parseRecentEvents with tests"
```

---

## Task 5: TDD `formatNpc`

Renders an NPC record into the 3-line Discord block specified in the spec.

**Files:**
- Create: `bot/test/format-npc.test.js`
- Modify: `bot/handlers/read-utils.js`

- [ ] **Step 1: Write the failing test**

Create `bot/test/format-npc.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatNpc } from '../handlers/read-utils.js';

test('renders full NPC', () => {
  const npc = {
    id: 'npc_det_okafor',
    name: 'Det. Sgt. Paulette Okafor',
    faction: 'Mortalis',
    hub: 'Shockoe Bottom',
    role: 'RPD cold case detective; unofficial breach manager for supernatural incidents',
  };
  const out = formatNpc(npc);
  assert.equal(
    out,
    '**Det. Sgt. Paulette Okafor**\n' +
    'Faction: Mortalis  ·  Location: Shockoe Bottom\n' +
    'RPD cold case detective; unofficial breach manager for supernatural incidents'
  );
});

test('missing hub renders Location: —', () => {
  const out = formatNpc({ name: 'X', faction: 'Y', role: 'Z' });
  assert.ok(out.includes('Location: —'));
});

test('missing faction renders Faction: —', () => {
  const out = formatNpc({ name: 'X', hub: 'Y', role: 'Z' });
  assert.ok(out.includes('Faction: —'));
});

test('missing role omits the third line', () => {
  const out = formatNpc({ name: 'X', faction: 'Y', hub: 'Z' });
  assert.equal(out.split('\n').length, 2);
  assert.equal(out, '**X**\nFaction: Y  ·  Location: Z');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run from `bot/`:
```
npm test
```
Expected: 4 failures saying `formatNpc is not a function`.

- [ ] **Step 3: Write minimal implementation**

Append to `bot/handlers/read-utils.js`:

```js
export function formatNpc(npc) {
  const lines = [
    `**${npc.name}**`,
    `Faction: ${npc.faction || '—'}  ·  Location: ${npc.hub || '—'}`,
  ];
  if (npc.role) lines.push(npc.role);
  return lines.join('\n');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run from `bot/`:
```
npm test
```
Expected: all 14 tests pass.

- [ ] **Step 5: Commit**

```
git add bot/handlers/read-utils.js bot/test/format-npc.test.js
git commit -m "feat(bot): add formatNpc with tests"
```

---

## Task 6: TDD `formatArc`

Renders an arc record with ID lists resolved to display names.

**Files:**
- Create: `bot/test/format-arc.test.js`
- Modify: `bot/handlers/read-utils.js`

- [ ] **Step 1: Write the failing test**

Create `bot/test/format-arc.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatArc } from '../handlers/read-utils.js';

const hubsIndex = [
  { id: 'hub_shockoe_bottom', name: 'Shockoe Bottom' },
  { id: 'hub_downtown', name: 'Downtown' },
];

const npcsById = {
  npc_maren_voss: { id: 'npc_maren_voss', name: 'Maren Voss' },
};

const playersIndex = [
  { id: 'chris-caustes', name: 'Chris Caustes' },
];

test('renders arc with all ID lists resolved', () => {
  const arc = {
    id: 'arc-001',
    title: 'The Collector',
    hub_ids: ['hub_shockoe_bottom', 'hub_downtown'],
    npc_ids: ['npc_maren_voss'],
    player_ids: ['chris-caustes'],
    summary: 'An entity that catalogs things-that-remember.',
  };
  const out = formatArc(arc, hubsIndex, npcsById, playersIndex);
  assert.equal(
    out,
    '**The Collector**\n' +
    'Hubs: Shockoe Bottom, Downtown\n' +
    'NPCs: Maren Voss\n' +
    'PCs: Chris Caustes\n' +
    'An entity that catalogs things-that-remember.'
  );
});

test('empty ID lists render as —', () => {
  const arc = {
    title: 'Floating',
    hub_ids: [],
    npc_ids: [],
    player_ids: [],
    summary: 'Nowhere yet.',
  };
  const out = formatArc(arc, hubsIndex, npcsById, playersIndex);
  assert.ok(out.includes('Hubs: —'));
  assert.ok(out.includes('NPCs: —'));
  assert.ok(out.includes('PCs: —'));
});

test('unknown IDs in lists are skipped silently', () => {
  const arc = {
    title: 'Partial',
    hub_ids: ['hub_shockoe_bottom', 'hub_unknown'],
    npc_ids: ['npc_unknown'],
    player_ids: ['ghost-player'],
    summary: 'Some known, some not.',
  };
  const out = formatArc(arc, hubsIndex, npcsById, playersIndex);
  assert.ok(out.includes('Hubs: Shockoe Bottom'));
  assert.ok(!out.includes('hub_unknown'));
  assert.ok(out.includes('NPCs: —'));
  assert.ok(out.includes('PCs: —'));
});

test('missing summary omits the trailing line', () => {
  const arc = {
    title: 'No Summary',
    hub_ids: [],
    npc_ids: [],
    player_ids: [],
  };
  const out = formatArc(arc, hubsIndex, npcsById, playersIndex);
  const lines = out.split('\n');
  assert.equal(lines.length, 4);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run from `bot/`:
```
npm test
```
Expected: 4 failures saying `formatArc is not a function`.

- [ ] **Step 3: Write minimal implementation**

Append to `bot/handlers/read-utils.js`:

```js
export function formatArc(arc, hubsIndex, npcsById, playersIndex) {
  const hubsByIdMap = Object.fromEntries((hubsIndex || []).map(h => [h.id, h.name]));
  const playersByIdMap = Object.fromEntries((playersIndex || []).map(p => [p.id, p.name]));

  const resolveList = (ids, lookup) => {
    if (!Array.isArray(ids) || ids.length === 0) return '—';
    const names = ids.map(id => lookup[id]).filter(Boolean);
    return names.length ? names.join(', ') : '—';
  };

  const lines = [
    `**${arc.title}**`,
    `Hubs: ${resolveList(arc.hub_ids, hubsByIdMap)}`,
    `NPCs: ${resolveList(arc.npc_ids, Object.fromEntries(Object.entries(npcsById || {}).map(([id, n]) => [id, n.name])))}`,
    `PCs: ${resolveList(arc.player_ids, playersByIdMap)}`,
  ];
  if (arc.summary) lines.push(arc.summary);
  return lines.join('\n');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run from `bot/`:
```
npm test
```
Expected: all 18 tests pass.

- [ ] **Step 5: Commit**

```
git add bot/handlers/read-utils.js bot/test/format-arc.test.js
git commit -m "feat(bot): add formatArc with tests"
```

---

## Task 7: Move `chunk()` from session.js to read-utils.js, add `sendChunked` and `resolveCharacter` wrapper

This finishes the utility module. `chunk` is a move (no behavior change). `sendChunked` and `resolveCharacter` are the two helpers that touch Discord/GitHub and are exercised by manual smoke later.

**Files:**
- Modify: `bot/handlers/read-utils.js`
- Modify: `bot/handlers/session.js:55-70`

- [ ] **Step 1: Append `chunk`, `sendChunked`, and `resolveCharacter` to read-utils.js**

Append to `bot/handlers/read-utils.js`:

```js
const DISCORD_LIMIT = 1900;

export function chunk(text, limit = DISCORD_LIMIT) {
  if (!text) return [];
  if (text.length <= limit) return [text];
  const parts = [];
  let rest = text;
  while (rest.length > limit) {
    let cut = rest.lastIndexOf('\n\n', limit);
    if (cut < limit / 2) cut = rest.lastIndexOf('\n', limit);
    if (cut < limit / 2) cut = rest.lastIndexOf(' ', limit);
    if (cut <= 0) cut = limit;
    parts.push(rest.slice(0, cut));
    rest = rest.slice(cut).trimStart();
  }
  if (rest.length) parts.push(rest);
  return parts;
}

export async function sendChunked(interaction, content) {
  const parts = chunk(content);
  if (!parts.length) {
    await interaction.editReply({ content: '(empty)' });
    return;
  }
  await interaction.editReply({ content: parts[0] });
  for (const part of parts.slice(1)) {
    await interaction.followUp({ content: part });
  }
}

export async function resolveCharacter(arg, discordUsername) {
  const players = await listPlayers();
  return resolveCharacterFromList(arg, discordUsername, players);
}
```

- [ ] **Step 2: Replace the chunk function in session.js with an import**

In `bot/handlers/session.js`, change line 2 from:

```js
import { writeFile, readFile, readJSON } from './github.js';
```

to:

```js
import { writeFile, readFile, readJSON } from './github.js';
import { chunk } from './read-utils.js';
```

Then delete the local `chunk` function at [bot/handlers/session.js:55-70](../../bot/handlers/session.js#L55-L70) (the constant `DISCORD_LIMIT` on line 6 stays, since session.js still references it elsewhere — actually it doesn't, so delete `DISCORD_LIMIT` on line 6 as well).

- [ ] **Step 3: Run tests + check session.js still parses**

Run from `bot/`:
```
npm test
node --check handlers/session.js
```
Expected: 18 tests pass; `node --check` produces no output.

- [ ] **Step 4: Commit**

```
git add bot/handlers/read-utils.js bot/handlers/session.js
git commit -m "refactor(bot): move chunk to read-utils, add sendChunked and resolveCharacter"
```

---

## Task 8: Refactor `play.js` to use `resolveCharacterFromList`

**Files:**
- Modify: `bot/commands/play.js:86-91`

- [ ] **Step 1: Replace the inline function with an import**

In `bot/commands/play.js`:

Add to the imports block at the top:

```js
import { resolveCharacterFromList } from '../handlers/read-utils.js';
```

Delete the local function at [bot/commands/play.js:86-91](../../bot/commands/play.js#L86-L91):

```js
function resolveCharacter(value, players, fallbackName) {
  if (value === 'new' || value === NEW_CHARACTER_VALUE) {
    return { id: NEW_CHARACTER_VALUE, name: fallbackName };
  }
  return players.find(p => p.id === value || p.name.toLowerCase() === value.toLowerCase()) || null;
}
```

Replace with a thin wrapper at the same location (preserves the `__new__` special case which the shared utility doesn't have):

```js
function resolveCharacter(value, players, fallbackName) {
  if (value === 'new' || value === NEW_CHARACTER_VALUE) {
    return { id: NEW_CHARACTER_VALUE, name: fallbackName };
  }
  return resolveCharacterFromList(value, fallbackName, players);
}
```

The two call sites at lines 34 and 78 are unchanged.

- [ ] **Step 2: Verify it parses**

Run from `bot/`:
```
node --check commands/play.js
```
Expected: no output.

- [ ] **Step 3: Run all tests**

Run from `bot/`:
```
npm test
```
Expected: all 18 tests pass.

- [ ] **Step 4: Commit**

```
git add bot/commands/play.js
git commit -m "refactor(bot): use shared resolveCharacterFromList in /play"
```

---

## Task 9: Build `/hub` command

Simplest of the six — looks up a hub and dumps the markdown.

**Files:**
- Create: `bot/commands/hub.js`

- [ ] **Step 1: Create the command file**

Create `bot/commands/hub.js`:

```js
import { SlashCommandBuilder } from 'discord.js';
import { readFile, readJSON } from '../handlers/github.js';
import { sendChunked } from '../handlers/read-utils.js';

export const data = new SlashCommandBuilder()
  .setName('hub')
  .setDescription('Show the doc for a hub.')
  .addStringOption(o => o
    .setName('name')
    .setDescription('Hub id or name (e.g. "shockoe bottom").')
    .setRequired(true));

export async function execute(interaction) {
  await interaction.deferReply();
  try {
    const query = interaction.options.getString('name').trim();
    const index = await readJSON('hubs/index.json');
    if (!Array.isArray(index)) {
      await interaction.editReply('Hub index missing or malformed.');
      return;
    }
    const hub = findHub(index, query);
    if (!hub) {
      const names = index.map(h => h.name).join(', ');
      await interaction.editReply(`No hub matches "${query}". Known hubs: ${names}`);
      return;
    }
    const content = await readFile(`hubs/${hub.file}`);
    if (!content) {
      await interaction.editReply(`Hub doc for **${hub.name}** is missing on GitHub.`);
      return;
    }
    await sendChunked(interaction, content);
  } catch (err) {
    console.error('/hub failed:', err);
    const msg = err.message?.startsWith('GitHub')
      ? 'GitHub is unreachable right now — try again in a moment.'
      : 'Something went wrong. Check the bot logs.';
    await interaction.editReply({ content: msg });
  }
}

function findHub(index, query) {
  const q = query.toLowerCase();
  const slug = q.replace(/\s+/g, '-');
  return index.find(h => h.id === query)
    || index.find(h => h.name.toLowerCase() === q)
    || index.find(h => h.id.toLowerCase().endsWith(`_${slug}`) || h.id.toLowerCase().endsWith(`-${slug}`))
    || null;
}
```

- [ ] **Step 2: Verify it parses**

Run from `bot/`:
```
node --check commands/hub.js
```
Expected: no output.

- [ ] **Step 3: Commit**

```
git add bot/commands/hub.js
git commit -m "feat(bot): add /hub command"
```

---

## Task 10: Build `/sheet` command

**Files:**
- Create: `bot/commands/sheet.js`

- [ ] **Step 1: Create the command file**

Create `bot/commands/sheet.js`:

```js
import { SlashCommandBuilder } from 'discord.js';
import { readFile, listPlayers } from '../handlers/github.js';
import { resolveCharacterFromList, sendChunked } from '../handlers/read-utils.js';

export const data = new SlashCommandBuilder()
  .setName('sheet')
  .setDescription('Show a character sheet.')
  .addStringOption(o => o
    .setName('character')
    .setDescription('Character id or name (defaults to yours).')
    .setRequired(false));

export async function execute(interaction) {
  await interaction.deferReply({ ephemeral: true });
  try {
    const arg = interaction.options.getString('character');
    const players = await listPlayers();
    const player = resolveCharacterFromList(arg, interaction.user.username, players);
    if (!player) {
      const known = players.map(p => p.id).join(', ');
      await interaction.editReply(`No character found. Try \`character:<id>\` — known: ${known}`);
      return;
    }
    const content = await readFile(`players/${player.id}/sheet.md`);
    if (!content) {
      await interaction.editReply(`No sheet found for **${player.name}**.`);
      return;
    }
    await sendChunked(interaction, content);
  } catch (err) {
    console.error('/sheet failed:', err);
    const msg = err.message?.startsWith('GitHub')
      ? 'GitHub is unreachable right now — try again in a moment.'
      : 'Something went wrong. Check the bot logs.';
    await interaction.editReply({ content: msg });
  }
}
```

- [ ] **Step 2: Verify it parses**

Run from `bot/`:
```
node --check commands/sheet.js
```
Expected: no output.

- [ ] **Step 3: Commit**

```
git add bot/commands/sheet.js
git commit -m "feat(bot): add /sheet command"
```

---

## Task 11: Build `/state` command

**Files:**
- Create: `bot/commands/state.js`

- [ ] **Step 1: Create the command file**

Create `bot/commands/state.js`:

```js
import { SlashCommandBuilder } from 'discord.js';
import { readJSON, listPlayers } from '../handlers/github.js';
import { resolveCharacterFromList, sendChunked } from '../handlers/read-utils.js';

export const data = new SlashCommandBuilder()
  .setName('state')
  .setDescription('Show a character state JSON.')
  .addStringOption(o => o
    .setName('character')
    .setDescription('Character id or name (defaults to yours).')
    .setRequired(false));

export async function execute(interaction) {
  await interaction.deferReply({ ephemeral: true });
  try {
    const arg = interaction.options.getString('character');
    const players = await listPlayers();
    const player = resolveCharacterFromList(arg, interaction.user.username, players);
    if (!player) {
      const known = players.map(p => p.id).join(', ');
      await interaction.editReply(`No character found. Try \`character:<id>\` — known: ${known}`);
      return;
    }
    let state;
    try {
      state = await readJSON(`players/${player.id}/state.json`);
    } catch (parseErr) {
      await interaction.editReply(`state.json for **${player.name}** is malformed: ${parseErr.message}`);
      return;
    }
    if (!state) {
      await interaction.editReply(`No state found for **${player.name}**.`);
      return;
    }
    const body = '```json\n' + JSON.stringify(state, null, 2) + '\n```';
    await sendChunked(interaction, body);
  } catch (err) {
    console.error('/state failed:', err);
    const msg = err.message?.startsWith('GitHub')
      ? 'GitHub is unreachable right now — try again in a moment.'
      : 'Something went wrong. Check the bot logs.';
    await interaction.editReply({ content: msg });
  }
}
```

- [ ] **Step 2: Verify it parses**

Run from `bot/`:
```
node --check commands/state.js
```
Expected: no output.

- [ ] **Step 3: Commit**

```
git add bot/commands/state.js
git commit -m "feat(bot): add /state command"
```

---

## Task 12: Build `/events` command

**Files:**
- Create: `bot/commands/events.js`

- [ ] **Step 1: Create the command file**

Create `bot/commands/events.js`:

```js
import { SlashCommandBuilder } from 'discord.js';
import { readFile } from '../handlers/github.js';
import { parseRecentEvents, sendChunked } from '../handlers/read-utils.js';

export const data = new SlashCommandBuilder()
  .setName('events')
  .setDescription('Show the most recent public events.')
  .addIntegerOption(o => o
    .setName('n')
    .setDescription('How many entries (1–10, default 3).')
    .setMinValue(1)
    .setMaxValue(10)
    .setRequired(false));

export async function execute(interaction) {
  await interaction.deferReply();
  try {
    const n = interaction.options.getInteger('n') ?? 3;
    const md = await readFile('game/events-log.md');
    const sections = parseRecentEvents(md || '', n);
    if (sections.length === 0) {
      await interaction.editReply('No events logged yet.');
      return;
    }
    const body = sections.join('\n\n---\n\n');
    await sendChunked(interaction, body);
  } catch (err) {
    console.error('/events failed:', err);
    const msg = err.message?.startsWith('GitHub')
      ? 'GitHub is unreachable right now — try again in a moment.'
      : 'Something went wrong. Check the bot logs.';
    await interaction.editReply({ content: msg });
  }
}
```

- [ ] **Step 2: Verify it parses**

Run from `bot/`:
```
node --check commands/events.js
```
Expected: no output.

- [ ] **Step 3: Commit**

```
git add bot/commands/events.js
git commit -m "feat(bot): add /events command"
```

---

## Task 13: Build `/npc` command

**Files:**
- Create: `bot/commands/npc.js`

- [ ] **Step 1: Create the command file**

Create `bot/commands/npc.js`:

```js
import { SlashCommandBuilder } from 'discord.js';
import { readJSON } from '../handlers/github.js';
import { formatNpc, sendChunked } from '../handlers/read-utils.js';

export const data = new SlashCommandBuilder()
  .setName('npc')
  .setDescription('Look up an NPC.')
  .addStringOption(o => o
    .setName('name')
    .setDescription('NPC id or name (substring OK).')
    .setRequired(true));

export async function execute(interaction) {
  await interaction.deferReply();
  try {
    const query = interaction.options.getString('name').trim();
    const doc = await readJSON('game/npcs.json');
    const list = doc?.npcs || [];
    const matches = findNpcs(list, query);
    if (matches.length === 0) {
      await interaction.editReply(`No NPC matches "${query}".`);
      return;
    }
    if (matches.length > 1) {
      const names = matches.slice(0, 10).map(n => `• ${n.name}`).join('\n');
      await interaction.editReply(`Multiple NPCs match "${query}":\n${names}\nBe more specific.`);
      return;
    }
    await sendChunked(interaction, formatNpc(matches[0]));
  } catch (err) {
    console.error('/npc failed:', err);
    const msg = err.message?.startsWith('GitHub')
      ? 'GitHub is unreachable right now — try again in a moment.'
      : 'Something went wrong. Check the bot logs.';
    await interaction.editReply({ content: msg });
  }
}

function findNpcs(list, query) {
  const q = query.toLowerCase();
  const byId = list.find(n => n.id === query);
  if (byId) return [byId];
  const byName = list.find(n => n.name.toLowerCase() === q);
  if (byName) return [byName];
  return list.filter(n => n.name.toLowerCase().includes(q));
}
```

- [ ] **Step 2: Verify it parses**

Run from `bot/`:
```
node --check commands/npc.js
```
Expected: no output.

- [ ] **Step 3: Commit**

```
git add bot/commands/npc.js
git commit -m "feat(bot): add /npc command"
```

---

## Task 14: Build `/arcs` command

**Files:**
- Create: `bot/commands/arcs.js`

- [ ] **Step 1: Create the command file**

Create `bot/commands/arcs.js`:

```js
import { SlashCommandBuilder } from 'discord.js';
import { readJSON, listPlayers } from '../handlers/github.js';
import { formatArc, sendChunked } from '../handlers/read-utils.js';

export const data = new SlashCommandBuilder()
  .setName('arcs')
  .setDescription('List active arcs (or filter by status).')
  .addStringOption(o => o
    .setName('status')
    .setDescription('Filter by status (default: active).')
    .addChoices(
      { name: 'active',     value: 'active' },
      { name: 'escalating', value: 'escalating' },
      { name: 'resolved',   value: 'resolved' },
      { name: 'all',        value: 'all' },
    )
    .setRequired(false));

export async function execute(interaction) {
  await interaction.deferReply();
  try {
    const status = interaction.options.getString('status') ?? 'active';

    const [arcsDoc, npcsDoc, hubsIndex, playersIndex] = await Promise.all([
      readJSON('game/arcs.json'),
      readJSON('game/npcs.json'),
      readJSON('hubs/index.json'),
      listPlayers(),
    ]);

    const all = arcsDoc?.arcs || [];
    const filtered = status === 'all' ? all : all.filter(a => a.status === status);

    if (filtered.length === 0) {
      await interaction.editReply(`No arcs with status "${status}".`);
      return;
    }

    const npcsById = Object.fromEntries((npcsDoc?.npcs || []).map(n => [n.id, n]));
    const body = filtered
      .map(a => formatArc(a, hubsIndex || [], npcsById, playersIndex || []))
      .join('\n\n');

    await sendChunked(interaction, body);
  } catch (err) {
    console.error('/arcs failed:', err);
    const msg = err.message?.startsWith('GitHub')
      ? 'GitHub is unreachable right now — try again in a moment.'
      : 'Something went wrong. Check the bot logs.';
    await interaction.editReply({ content: msg });
  }
}
```

- [ ] **Step 2: Verify it parses**

Run from `bot/`:
```
node --check commands/arcs.js
```
Expected: no output.

- [ ] **Step 3: Commit**

```
git add bot/commands/arcs.js
git commit -m "feat(bot): add /arcs command"
```

---

## Task 15: Run final tests and verify auto-discovery

**Files:** none — verification only.

- [ ] **Step 1: Run the full test suite**

Run from `bot/`:
```
npm test
```
Expected: `tests 18  pass 18  fail 0`.

- [ ] **Step 2: Verify all commands parse**

Run from `bot/`:
```
node --check commands/sheet.js && node --check commands/state.js && node --check commands/events.js && node --check commands/npc.js && node --check commands/hub.js && node --check commands/arcs.js && node --check handlers/read-utils.js && node --check handlers/session.js && node --check commands/play.js
```
Expected: no output (all parse).

- [ ] **Step 3: Verify deploy-commands.js sees the new commands locally**

With `bot/.env` populated, from `bot/`:
```
node deploy-commands.js
```
Expected output:
```
Registered 8 commands (guild ...).
```

(Was 2 before; the six new commands bring it to 8.)

If this step is skipped here, it must be done remotely in Task 16.

---

## Task 16: Deploy to Fly and re-register slash commands

**Files:** none — deployment only.

- [ ] **Step 1: Commit the spec and plan files if not already committed**

```
git add docs/superpowers/specs/2026-05-14-bot-read-commands-design.md docs/superpowers/plans/2026-05-14-bot-read-commands.md
git commit -m "docs: spec and plan for bot read commands"
```

- [ ] **Step 2: Push to origin**

```
git push origin main
```

- [ ] **Step 3: Deploy the bot**

From `bot/`:
```
fly deploy
```
Expected: build, push, deploy. Final message: app is running.

- [ ] **Step 4: Re-register slash commands on the deployed bot**

If Task 15 step 3 was not run locally, run remotely:
```
fly ssh console -C "node deploy-commands.js"
```
Expected output:
```
Registered 8 commands (guild ...).
```

- [ ] **Step 5: Smoke-test each command in Discord**

In your guild (the channel does not need to be a thread for these), run:

| Command | Expected |
|---|---|
| `/hub name:shockoe bottom` | Public message with the contents of `hubs/shockoe-bottom.md`. |
| `/hub name:nope` | Public "No hub matches…" reply with the list of known hubs. |
| `/sheet` | Ephemeral message: either your sheet (if your Discord username matches a player name) or a "no character found" message listing known ids. |
| `/sheet character:chris-caustes` | Ephemeral message with `players/chris-caustes/sheet.md`. |
| `/state character:chris-caustes` | Ephemeral message with the state.json in a fenced code block. |
| `/events` | Public message with the 3 most recent H2 sections of the events log. |
| `/events n:1` | Public message with just the newest section. |
| `/npc name:okafor` | Public 3-line block for Det. Sgt. Paulette Okafor. |
| `/npc name:nope` | Public "No NPC matches…" reply. |
| `/arcs` | Public list of all `status: active` arcs in the formatArc shape. |
| `/arcs status:all` | Public list of every arc. |

- [ ] **Step 6: If any smoke test fails, check logs**

```
fly logs
```
Investigate, fix, redeploy. Repeat the relevant smoke test.

---

## Self-Review notes

- Every spec section is covered: commands table → Tasks 9–14; output formatting → Tasks 5, 6, 11, 12, 13, 14; shared utilities → Tasks 2–7; refactor → Tasks 7, 8; error handling → embedded in each command (Tasks 9–14); testing → Tasks 1, 3, 4, 5, 6 plus manual smoke in Task 16.
- No placeholders, TBDs, or "similar to Task N" references.
- Function names and signatures are consistent: `resolveCharacterFromList(arg, username, players)`, `resolveCharacter(arg, username)`, `chunk(text, limit)`, `sendChunked(interaction, content)`, `formatNpc(npc)`, `formatArc(arc, hubsIndex, npcsById, playersIndex)`, `parseRecentEvents(markdown, n)`.
- The `__new__` special case in `/play` is preserved in Task 8 by keeping a thin `resolveCharacter` wrapper that handles `new`/`__new__` before delegating to the shared `resolveCharacterFromList`.
