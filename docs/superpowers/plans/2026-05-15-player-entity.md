# Player Entity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce a Discord-snowflake-keyed player entity that owns safety + mechanics_depth, rename the misnamed `player_id` field to `character_id`, wipe test character data while keeping the world populated, and update all bot/MC/docs/dashboard surfaces accordingly.

**Architecture:** Players now have a separate file at `players/by-id/<snowflake>/profile.json` storing player-scoped preferences. Characters at `players/<slug>/` keep their state but lose `safety` (it's now on the player). The bot reads both at session start and injects them into the MC's prompt. A new player-onboarding phase runs once per Discord ID before their first character; a carryover-confirm beat runs before every additional character; a one-shot calibration prompt fires after the player's first session close.

**Tech Stack:** Node.js 20+ ESM, Discord.js 14, Anthropic SDK 0.32, `node:test` for tests, vanilla JS for the dashboard, Markdown for MC reference and docs. Commits go directly to `main` (no PR flow).

**Spec:** [docs/superpowers/specs/2026-05-15-player-entity-design.md](../specs/2026-05-15-player-entity-design.md)

---

## Conventions

- All paths below are relative to the repo root `city-of-shadows/`.
- Tests run from `bot/` with `npm test` (calls `node --test test/*.test.js`).
- Commit messages follow the existing pattern (`feat(bot): …`, `docs: …`, `chore: …` etc — see `git log`).
- Each task ends in one or more commits. Commits inside a task are scoped to that task.

---

## Task 1: Add player profile template

**Files:**
- Create: `players/_player_template/profile.json`

- [ ] **Step 1: Create the template file**

Create `players/_player_template/profile.json`:

```json
{
  "discord_id": "",
  "display_name": "",
  "safety": {
    "hard_limits": [],
    "soft_limits": []
  },
  "mechanics_depth": 3,
  "mechanics_depth_set": false,
  "characters": []
}
```

- [ ] **Step 2: Commit**

```bash
git add players/_player_template/profile.json
git commit -m "feat(schema): add player profile template at players/_player_template/profile.json"
```

---

## Task 2: Update character template — remove safety, rename `player_id`

**Files:**
- Modify: `players/_template/state.json`

- [ ] **Step 1: Rewrite the template**

Replace `players/_template/state.json` contents with:

```json
{
  "character_id": "kebab-case-folder-name",
  "character_name": "Full Character Name",
  "playbook": "The PlaybookName",
  "wod_extension": "Supplement (Subtype / Order)",
  "stats": {
    "Blood":  0,
    "Heart":  0,
    "Mind":   0,
    "Spirit": 0
  },
  "harm": 0,
  "corrupt": 0,
  "xp": 0,
  "advances": 0,
  "circle_ratings": {
    "Mortalis": 0,
    "Night":    0,
    "Power":    0,
    "Wild":     0
  },
  "circle_status": {
    "Mortalis": 0,
    "Night":    0,
    "Power":    0,
    "Wild":     0
  },
  "gear": [],
  "active_arc_ids": [],
  "last_session": "session_000",
  "notes": ""
}
```

Two changes from current: `player_id` → `character_id`, and the `safety` block is removed.

- [ ] **Step 2: Commit**

```bash
git add players/_template/state.json
git commit -m "feat(schema): rename player_id to character_id and remove safety from character template"
```

---

## Task 3: Wipe test character folders

**Files:**
- Delete: `players/robert-lagrange/`, `players/chris-caustes/`, `players/johan-van-axel/`, `players/benjamin-grey/`, `players/john-smith/`, `players/jacob-brooks/`, `players/joe-nakama/`
- Modify: `players/index.json`

- [ ] **Step 1: Delete the seven character folders**

```bash
git rm -r players/robert-lagrange players/chris-caustes players/johan-van-axel players/benjamin-grey players/john-smith players/jacob-brooks players/joe-nakama
```

- [ ] **Step 2: Reset `players/index.json`**

Replace `players/index.json` contents with:

```json
[]
```

- [ ] **Step 3: Verify only `_template` and `_player_template` remain under `players/`**

Run: `ls players/`
Expected: `_player_template`, `_template`, `index.json`

- [ ] **Step 4: Commit**

```bash
git add players/index.json
git commit -m "chore: wipe test character folders; reset players/index.json"
```

---

## Task 4: Scrub `game/arcs.json` — rename field, depopulate

**Files:**
- Modify: `game/arcs.json`

- [ ] **Step 1: Read the current file structure**

Read `game/arcs.json`. Confirm each arc entry has a `player_ids` array.

- [ ] **Step 2: Rename `player_ids` → `character_ids` and empty every array**

For every arc entry in `game/arcs.json`, replace the `player_ids` field name with `character_ids` and set its value to `[]`. Keep all other arc fields (title, summary, hub references, NPC references, MC notes) unchanged.

After the change, no `player_ids` should remain in the file. Verify:

```bash
grep -c '"player_ids"' game/arcs.json
```
Expected: `0`

```bash
grep -c '"character_ids": \[\]' game/arcs.json
```
Expected: matches the number of arcs in the file (14 at spec-write time).

- [ ] **Step 3: Commit**

```bash
git add game/arcs.json
git commit -m "chore(game): rename arcs.player_ids to character_ids and depopulate"
```

---

## Task 5: Scrub `game/npcs.json` — reset player_interaction strings

**Files:**
- Modify: `game/npcs.json`

- [ ] **Step 1: Read current state**

Read `game/npcs.json`. Note which NPCs have `player_interaction` strings other than `"None yet"`.

- [ ] **Step 2: Reset every `player_interaction` to "None yet"**

For every NPC in `game/npcs.json`, set the `player_interaction` field to `"None yet"`. Keep `arc_ids` references intact (arcs are being depopulated, not deleted, so the NPC ↔ arc graph stays).

Verify:

```bash
grep -o '"player_interaction": "[^"]*"' game/npcs.json | sort -u
```
Expected: a single line, `"player_interaction": "None yet"`.

- [ ] **Step 3: Commit**

```bash
git add game/npcs.json
git commit -m "chore(game): reset player_interaction strings on all NPCs"
```

---

## Task 6: Scrub `game/events-log.md` — narrative pass

**Files:**
- Modify: `game/events-log.md`

- [ ] **Step 1: Read the events log**

Read `game/events-log.md` in full. Identify each entry's voice — most existing entries use lore-voice phrasing ("a practitioner of note", "the city whispers") and don't reference specific character slugs or names.

- [ ] **Step 2: Edit only entries that name a test character**

For each entry that references one of the deleted characters by name or slug (Robert, Chris Caustes, Johan van Axel, Benjamin Grey, John Smith, Jacob Brooks, Joe Nakama), rewrite that reference to lore-voice (e.g. "a practitioner", "a witness", "someone the Bottom does not name"). Keep world events, hub references, and consequences intact. Do not delete entries.

If no entries name a test character, no edits are needed; record this in the commit message instead.

- [ ] **Step 3: Verify no character slugs remain in the file**

```bash
grep -E "(robert-lagrange|chris-caustes|johan-van-axel|benjamin-grey|john-smith|jacob-brooks|joe-nakama|Robert Lagrange|Chris Caustes|Johan van Axel|Benjamin Grey|John Smith|Jacob Brooks|Joe Nakama)" game/events-log.md
```
Expected: no matches (exit code 1).

- [ ] **Step 4: Commit**

```bash
git add game/events-log.md
git commit -m "chore(game): scrub test-character references from events log; keep world events"
```

---

## Task 7: Rename `player_id` → `character_id` in bot handlers + tests

**Files:**
- Modify: `bot/handlers/session.js`
- Modify: `bot/handlers/read-utils.js`
- Modify: `bot/test/save-onboarding.test.js`
- Modify: `bot/test/save-onboarding-block.test.js`
- Modify: `bot/test/missing-new-char-close-fields.test.js`
- Modify: `bot/test/format-arc.test.js`

This task uses a refactor pattern: update tests first to reflect the new field name (they will fail), then update the implementation, then run tests until they pass.

- [ ] **Step 1: Audit current usage in each file**

Run:

```bash
grep -n "player_id" bot/handlers/session.js bot/handlers/read-utils.js bot/test/*.test.js
```

Note every line number. Both the parser logic (`session.js`) and the MC's emitted XML tag (`<player_id>...</player_id>`) need to change together.

- [ ] **Step 2: Update test fixtures and assertions**

In each of the four test files, replace:
- The XML tag `<player_id>...</player_id>` → `<character_id>...</character_id>` inside SAMPLE/fixture strings.
- The JS property name `player_id` (in object literals and assertions) → `character_id`.
- Error message expectations like `['player_id']` → `['character_id']`.

After edits, every occurrence of `player_id` in `bot/test/` should be gone.

Verify:

```bash
grep -rn "player_id" bot/test/
```
Expected: no matches.

- [ ] **Step 3: Run tests to confirm they fail**

```bash
cd bot && npm test
```
Expected: FAIL. Output will show assertions failing because the parser still produces `player_id` keys, not `character_id`.

- [ ] **Step 4: Rename in `bot/handlers/session.js`**

Replace every occurrence of `player_id` with `character_id` in `bot/handlers/session.js`. This includes:
- Regex/string literals that match `<player_id>...</player_id>` tags → `<character_id>...</character_id>`.
- Object property names in returned parsed objects.
- Field names in `missingSaveOnboardingFields` and `missingNewCharCloseFields` return arrays.
- Any comments that reference the old field name.

Note: do not rename function names like `missingSaveOnboardingFields` — only the *data* field name changes.

- [ ] **Step 5: Rename in `bot/handlers/read-utils.js`**

Replace every occurrence of `player_id` with `character_id` in `bot/handlers/read-utils.js`. The match at [read-utils.js:62](../../bot/handlers/read-utils.js#L62) is reading `arc.player_id` — change to `arc.character_id` (or `arc.character_ids`, depending on whether the existing code reads singular or plural; preserve singular/plural).

If the file reads `arc.player_ids` (plural), it should now read `arc.character_ids`. If it reads a singular `player_id`, it should now read `character_id`.

- [ ] **Step 6: Run tests to confirm they pass**

```bash
cd bot && npm test
```
Expected: all tests pass.

- [ ] **Step 7: Verify no `player_id` references remain in `bot/`**

```bash
grep -rn "player_id" bot/
```
Expected: no matches.

- [ ] **Step 8: Commit**

```bash
git add bot/handlers/session.js bot/handlers/read-utils.js bot/test/
git commit -m "refactor(bot): rename player_id to character_id in handlers and tests"
```

---

## Task 8: Rename in `dashboard/app.js`

**Files:**
- Modify: `dashboard/app.js` (lines 62 and 765)

- [ ] **Step 1: Find both occurrences**

```bash
grep -n "player_id" dashboard/app.js
```

Expect two hits: one at line 62 (arc rendering "PCs" line) and one at line 765 (arc detail card with legacy fallback to `arc.players`).

- [ ] **Step 2: Update line 62**

Locate this line:

```javascript
`PCs: ${resolveList(arc.player_ids, playersByIdMap)}`,
```

Change to:

```javascript
`PCs: ${resolveList(arc.character_ids, playersByIdMap)}`,
```

- [ ] **Step 3: Update line 765**

Locate this line:

```javascript
players:     Array.isArray(arc.player_ids) ? arc.player_ids : (Array.isArray(arc.players) ? arc.players : []),
```

Change to:

```javascript
players:     Array.isArray(arc.character_ids) ? arc.character_ids : (Array.isArray(arc.players) ? arc.players : []),
```

The fallback to `arc.players` is preserved because it predates this change; leaving it does no harm and protects against any legacy data that hadn't been migrated.

- [ ] **Step 4: Verify no `player_id` references remain in `dashboard/`**

```bash
grep -rn "player_id" dashboard/
```
Expected: no matches.

- [ ] **Step 5: Commit**

```bash
git add dashboard/app.js
git commit -m "refactor(dashboard): rename arc.player_ids to character_ids"
```

---

## Task 9: Rename in MC reference docs

**Files:**
- Modify: `mc-reference/mc-instructions.md`
- Modify: `mc-reference/state-schema.md`
- Modify: `mc-reference/character-creation.md`
- Modify: `mc-reference/bot-output-format.md`

This task only handles the rename. New content (player-onboarding phase, carryover beat, mechanics_depth rubric, `<save_player>` block) is added in subsequent tasks.

- [ ] **Step 1: Audit current usage**

```bash
grep -n "player_id" mc-reference/*.md
```

Note every line. There should be ~18 occurrences across the four files.

- [ ] **Step 2: Rename in each file**

For each of the four files, replace every occurrence of `player_id` with `character_id`. This includes:
- XML tag schemas like `<player_id>...</player_id>` → `<character_id>...</character_id>`.
- Field names in JSON examples (`"player_id": "..."` → `"character_id": "..."`).
- Prose references ("the `player_id` field", "the player_id slug") → use `character_id` instead.

- [ ] **Step 3: Verify no `player_id` references remain**

```bash
grep -rn "player_id" mc-reference/
```
Expected: no matches.

- [ ] **Step 4: Commit**

```bash
git add mc-reference/mc-instructions.md mc-reference/state-schema.md mc-reference/character-creation.md mc-reference/bot-output-format.md
git commit -m "docs(mc-reference): rename player_id to character_id"
```

---

## Task 10: Add `<save_player>` block schema to `bot-output-format.md`

**Files:**
- Modify: `mc-reference/bot-output-format.md`

- [ ] **Step 1: Read the current file**

Read `mc-reference/bot-output-format.md` in full to understand the existing block schemas (`<save_onboarding>`, `<close_session>`).

- [ ] **Step 2: Add a new section for `<save_player>`**

Add a new section after the existing `<save_onboarding>` section. The new section documents the format the MC uses when closing the player-onboarding phase (before any character creation):

```markdown
### `<save_player>` — emitted at the end of the player-onboarding phase

Used the first time the bot meets a Discord user, after the MC has captured safety preferences. The bot parses this block and writes `players/by-id/<discord_id>/profile.json`. The block fires exactly once per Discord ID; subsequent character creations skip player-onboarding entirely.

```xml
<save_player>
<discord_id>123456789012345678</discord_id>
<display_name>Tommy</display_name>
<safety>
{
  "hard_limits": ["..."],
  "soft_limits": ["..."]
}
</safety>
</save_player>
```

Fields:
- `discord_id` — required. The player's Discord snowflake. Provided to the MC in the prompt context.
- `display_name` — optional. If omitted, the bot falls back to the Discord username it already has.
- `safety` — required. JSON object with `hard_limits` and `soft_limits` arrays. Both may be empty arrays.

The MC does **not** emit `mechanics_depth` in this block. That value is set to the default (3) and the flag `mechanics_depth_set` to `false` so the bot can fire its post-session-1 calibration prompt automatically.
```

- [ ] **Step 3: Commit**

```bash
git add mc-reference/bot-output-format.md
git commit -m "docs(mc-reference): document <save_player> close block"
```

---

## Task 11: Add player-onboarding phase + carryover-confirm beat to MC instructions

**Files:**
- Modify: `mc-reference/mc-instructions.md`
- Modify: `mc-reference/character-creation.md`

- [ ] **Step 1: Add a new "Player Onboarding" section to `mc-instructions.md`**

Add a new section, placed before the character-creation section. It instructs the MC how to handle a first-time Discord user.

```markdown
## Player Onboarding (first-time Discord user)

If the bot signals that this is the player's first time (no `profile.json` exists yet), run player-onboarding before character creation.

The bot will tell you in the system prompt context whether the player is new. If new:

1. Greet the player by their Discord display name.
2. Briefly orient them: City of Shadows is a mythic-noir game in the World of Darkness, run async per-thread.
3. Ask the safety question — verbatim:

> "Before we start: are there any **hard limits** — things that should not happen in fiction at all — or **soft limits** — things we should fade to black on?"

   Define both terms inline (per the player-facing-jargon rule). Capture the player's answer.
4. Close the player-onboarding phase by emitting a `<save_player>` block (see `bot-output-format.md`). The block must include `discord_id`, optional `display_name`, and a `safety` object.
5. Then proceed to character creation Phase 1 (Frame) for this player's first character.

**Do not ask mechanics_depth at this stage.** The bot handles calibration automatically after the first session closes.

**Returning players** (a `profile.json` exists) skip this section entirely. Go directly to character creation, starting with the carryover-confirm beat.
```

- [ ] **Step 2: Add a "Carryover-Confirm Beat" section to `mc-instructions.md`**

Add immediately after the Player Onboarding section:

```markdown
## Carryover-Confirm Beat (every new character after the first)

When a returning player begins creating a new character (their second-or-later), run this beat **before** Phase 1 (Frame).

The bot will inject the player's current `safety.hard_limits`, `safety.soft_limits`, and `mechanics_depth` (1-5) into your prompt context.

Say (paraphrase, but keep the structure):

> "Quick check before we start your new character. Your hard limits on file are: [list]. Soft limits: [list]. Mechanics depth is set to [N] (where 1 surfaces most mechanics — named moves, dice, modifiers — and 5 keeps the mechanics fully behind the curtain). Are these still right for you, or do you want to change either?"

If the player wants to change safety or mechanics_depth, capture the new values and indicate the change in your close-session block's `state_patch` under a `profile_patch` key. The bot will write back to `profile.json`.

If unchanged, proceed straight into Phase 1 (Frame) without further preamble.
```

- [ ] **Step 3: Update `mc-reference/character-creation.md` Phase 1**

Locate the section starting with `## Phase 1 — Frame & Safety` (around line 13).

Change the header to:

```markdown
## Phase 1 — Frame
```

Remove the entire safety capture block (the "Say:", "Capture:", "Where it goes:" lines that capture hard/soft limits). The new Phase 1 contains only the framing prose for the scene — no safety prompt.

At the top of the file (above Phase 1), add a one-line reminder:

```markdown
> **Note:** Safety limits are now player-scoped, captured during player-onboarding (see `mc-instructions.md`). Do not re-ask them in character creation. For returning players, the carryover-confirm beat (also in `mc-instructions.md`) runs *before* Phase 1.
```

- [ ] **Step 4: Commit**

```bash
git add mc-reference/mc-instructions.md mc-reference/character-creation.md
git commit -m "docs(mc-reference): add player-onboarding phase and carryover-confirm beat; drop safety from char-creation Phase 1"
```

---

## Task 12: Add mechanics_depth rubric to MC instructions

**Files:**
- Modify: `mc-reference/mc-instructions.md`

- [ ] **Step 1: Add a "Mechanics Depth" section**

Add a new top-level section to `mc-instructions.md` (suggested placement: near the top, alongside other player-scoped behavior). The section is the MC's rubric for resolving the player's `mechanics_depth` integer (1-5) into narration style.

```markdown
## Mechanics Depth

The bot injects the current player's `mechanics_depth` integer (1-5) into your prompt context. It controls how much of the engine is visible in your narration. Backend behavior — applying rules, rolling dice internally, tracking Harm/XP/Corruption/Circles — is **identical** at every level. Only the surface of your prose changes.

| Level | Style | What you surface | What you hide |
|---|---|---|---|
| **1** | Open table | Named moves, dice rolls with stat + modifiers, Circle ratings, Harm boxes, stat math, advance options spelled out | — |
| **2** | Crunch-forward | Named moves, dice results, modifier totals | Detailed stat math (just the result) |
| **3** | Balanced *(default)* | Move triggers narrated naturally; dice results mentioned without full math; stat references sparingly | Modifier breakdowns, stat math |
| **4** | Story-forward | Outcomes only ("you press, and they crack") | Move names, dice, modifiers |
| **5** | Pure narrative | Story consequences only | Everything mechanical — no rolls visible, no move names, no stat references |

When a player explicitly asks about mechanics ("what's my Heart stat?", "did I roll well?") at level 4 or 5, answer honestly in that moment — the rubric is about your *default voice*, not a gag order. After the answer, return to the player's chosen level for the next beat.

If the player asks for a different level mid-session ("less crunch", "more dice please"), acknowledge and apply going forward. Do **not** edit `profile.json` from inside the MC — the player can set the level explicitly via `/prefs mechanics N` and the bot will persist it.
```

- [ ] **Step 2: Commit**

```bash
git add mc-reference/mc-instructions.md
git commit -m "docs(mc-reference): add mechanics_depth 5-level rubric"
```

---

## Task 13: Update `state-schema.md` — remove safety from character, add profile.json section

**Files:**
- Modify: `mc-reference/state-schema.md`

- [ ] **Step 1: Remove the character `safety` section**

In `mc-reference/state-schema.md`, locate the `### Safety (set during onboarding, rarely changes)` section. Delete it in its entirety.

Also locate any reference to `state.json.safety` elsewhere in the doc and update or remove it.

- [ ] **Step 2: Add a new `profile.json` section**

Add a new top-level section near the start of the file:

```markdown
## Player Profile (`players/by-id/<discord_id>/profile.json`)

Player-scoped data, keyed by Discord snowflake. Single source of truth for safety and narration preferences across all characters a player owns.

```json
{
  "discord_id": "123456789012345678",
  "display_name": "Tommy",
  "safety": {
    "hard_limits": [],
    "soft_limits": []
  },
  "mechanics_depth": 3,
  "mechanics_depth_set": false,
  "characters": ["robert-lagrange", "chris-caustes"]
}
```

**Fields:**

- `discord_id` — numeric Discord snowflake. Authoritative key.
- `display_name` — fetched from Discord at first onboarding; editable via `/prefs`.
- `safety.hard_limits` / `safety.soft_limits` — content limits. Player-scoped, applied to every character.
- `mechanics_depth` — integer 1-5. See `mc-instructions.md` for the rubric.
- `mechanics_depth_set` — boolean. `false` until the player has answered the post-session-1 calibration question. The bot reads this to decide whether to fire the calibration prompt at session close.
- `characters` — array of character slugs (folder names) the player owns. Reverse index; `players/index.json` carries the matching `owner_id` per character.
```

- [ ] **Step 3: Update the "Sheet/state field reference" tables**

If any table in the doc lists `safety` as a character-state field, remove that row. If any table mentions `player_id`, rename it to `character_id`.

- [ ] **Step 4: Document the `players/index.json` entry shape**

Add or update a section describing the per-character entry:

```markdown
## Character Roster (`players/index.json`)

Top-level array of character entries. Each entry:

```json
{
  "id": "character-slug",
  "name": "Character Name",
  "owner_id": "123456789012345678"
}
```

- `id` — the character folder slug under `players/`.
- `name` — display name.
- `owner_id` — the Discord snowflake of the player who owns this character. Mirrors the `characters` array in that player's `profile.json`.
```

- [ ] **Step 5: Commit**

```bash
git add mc-reference/state-schema.md
git commit -m "docs(mc-reference): move safety to player profile schema; remove from character state"
```

---

## Task 14: Bot — parseSavePlayerBlock parser + tests

**Files:**
- Create: `bot/test/save-player.test.js`
- Modify: `bot/handlers/session.js`

- [ ] **Step 1: Write the failing test**

Create `bot/test/save-player.test.js`:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseSavePlayerBlock,
  missingSavePlayerFields,
} from '../handlers/session.js';

const SAMPLE = `Welcome, Tommy. A few questions before we start.

<save_player>
<discord_id>123456789012345678</discord_id>
<display_name>Tommy</display_name>
<safety>
{
  "hard_limits": ["sexual assault"],
  "soft_limits": ["graphic torture"]
}
</safety>
</save_player>

Let's begin with your first character.`;

test('parses a save_player block embedded mid-message', () => {
  const save = parseSavePlayerBlock(SAMPLE);
  assert.ok(save);
  assert.equal(save.discord_id, '123456789012345678');
  assert.equal(save.display_name, 'Tommy');
  assert.match(save.safety, /hard_limits/);
});

test('returns null when no save_player block is present', () => {
  assert.equal(parseSavePlayerBlock('just narrative, no tags'), null);
});

test('missingSavePlayerFields: complete block returns []', () => {
  const save = parseSavePlayerBlock(SAMPLE);
  assert.deepEqual(missingSavePlayerFields(save), []);
});

test('missingSavePlayerFields: missing discord_id is flagged', () => {
  assert.deepEqual(
    missingSavePlayerFields({ discord_id: null, safety: '{}' }),
    ['discord_id']
  );
});

test('missingSavePlayerFields: whitespace discord_id is flagged', () => {
  assert.deepEqual(
    missingSavePlayerFields({ discord_id: '   ', safety: '{}' }),
    ['discord_id']
  );
});

test('missingSavePlayerFields: missing safety is flagged', () => {
  assert.deepEqual(
    missingSavePlayerFields({ discord_id: '123', safety: null }),
    ['safety']
  );
});

test('missingSavePlayerFields: display_name is optional', () => {
  assert.deepEqual(
    missingSavePlayerFields({ discord_id: '123', safety: '{}', display_name: null }),
    []
  );
});
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
cd bot && npm test -- --test-name-pattern="save_player"
```

Expected: FAIL with `parseSavePlayerBlock is not a function` (or equivalent ESM import error).

- [ ] **Step 3: Implement `parseSavePlayerBlock` and `missingSavePlayerFields` in `bot/handlers/session.js`**

Add these exports to `bot/handlers/session.js`, modeled on the existing `parseSaveOnboardingBlock` and `missingSaveOnboardingFields`:

```javascript
const SAVE_PLAYER_OPEN = '<save_player>';
const SAVE_PLAYER_CLOSE = '</save_player>';

export function parseSavePlayerBlock(text) {
  if (typeof text !== 'string') return null;
  const openIdx = text.indexOf(SAVE_PLAYER_OPEN);
  const closeIdx = text.indexOf(SAVE_PLAYER_CLOSE);
  if (openIdx === -1 || closeIdx === -1 || closeIdx <= openIdx) return null;
  const body = text.slice(openIdx + SAVE_PLAYER_OPEN.length, closeIdx);
  const get = (tag) => {
    const m = body.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`));
    return m ? m[1].trim() : null;
  };
  return {
    discord_id: get('discord_id'),
    display_name: get('display_name'),
    safety: get('safety'),
  };
}

export function missingSavePlayerFields(save) {
  if (!save) return ['discord_id', 'safety'];
  const missing = [];
  const did = typeof save.discord_id === 'string' ? save.discord_id.trim() : '';
  if (!did) missing.push('discord_id');
  const sa = typeof save.safety === 'string' ? save.safety.trim() : '';
  if (!sa) missing.push('safety');
  return missing;
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd bot && npm test
```

Expected: all tests pass (existing + new).

- [ ] **Step 5: Commit**

```bash
git add bot/handlers/session.js bot/test/save-player.test.js
git commit -m "feat(bot): parse <save_player> close block from player-onboarding phase"
```

---

## Task 15: Bot — profile.json read/write helpers + tests

**Files:**
- Create: `bot/handlers/profile.js`
- Create: `bot/test/profile.test.js`

- [ ] **Step 1: Write the failing tests**

Create `bot/test/profile.test.js`:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readProfile, writeProfile, profilePath } from '../handlers/profile.js';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('profilePath builds the correct path', () => {
  const root = '/tmp/repo';
  const p = profilePath(root, '123456789012345678');
  assert.equal(p, '/tmp/repo/players/by-id/123456789012345678/profile.json');
});

test('readProfile returns null when the file does not exist', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cos-'));
  try {
    const p = readProfile(dir, '123456789012345678');
    assert.equal(p, null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('writeProfile creates the directory and file; readProfile returns the parsed object', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cos-'));
  try {
    const profile = {
      discord_id: '123456789012345678',
      display_name: 'Tommy',
      safety: { hard_limits: [], soft_limits: [] },
      mechanics_depth: 3,
      mechanics_depth_set: false,
      characters: [],
    };
    writeProfile(dir, profile);
    const round = readProfile(dir, '123456789012345678');
    assert.deepEqual(round, profile);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('writeProfile rejects a profile missing discord_id', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cos-'));
  try {
    assert.throws(
      () => writeProfile(dir, { safety: { hard_limits: [], soft_limits: [] } }),
      /discord_id/
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd bot && npm test -- --test-name-pattern="profile"
```

Expected: FAIL with import error (module does not exist yet).

- [ ] **Step 3: Implement `bot/handlers/profile.js`**

Create the file:

```javascript
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';

export function profilePath(repoRoot, discordId) {
  return join(repoRoot, 'players', 'by-id', String(discordId), 'profile.json');
}

export function readProfile(repoRoot, discordId) {
  const p = profilePath(repoRoot, discordId);
  if (!existsSync(p)) return null;
  const raw = readFileSync(p, 'utf8');
  return JSON.parse(raw);
}

export function writeProfile(repoRoot, profile) {
  if (!profile || typeof profile.discord_id !== 'string' || !profile.discord_id.trim()) {
    throw new Error('writeProfile: discord_id is required');
  }
  const p = profilePath(repoRoot, profile.discord_id);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(profile, null, 2) + '\n', 'utf8');
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd bot && npm test
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add bot/handlers/profile.js bot/test/profile.test.js
git commit -m "feat(bot): add profile.json read/write helpers keyed by discord_id"
```

---

## Task 16: Bot — wire profile injection into MC prompt assembly

**Files:**
- Modify: `bot/handlers/mc.js` (or wherever the MC prompt is assembled — verify with grep)

- [ ] **Step 1: Locate the MC prompt assembly site**

```bash
grep -rn "system" bot/handlers/ | grep -i "prompt\|message"
```

Identify the file/function that assembles the MC's opening user message (the one that already injects sheet/state/handoff). This is most likely `bot/handlers/mc.js`. Read it in full.

- [ ] **Step 2: Add a profile-loading step**

In the MC prompt assembly function:

1. Determine the Discord ID of the thread's owner (already available from the Discord interaction context — `interaction.user.id` or equivalent).
2. Call `readProfile(repoRoot, discordId)`. If `null`, treat as a first-time player and signal that to the MC (see Step 3).
3. If non-null, append a profile context block to the prompt — placed near the existing sheet/state injections.

The profile context block should look like:

```javascript
const profileContext = profile
  ? `## PLAYER PROFILE
**Discord ID:** ${profile.discord_id}
**Display name:** ${profile.display_name || 'unknown'}
**Safety:**
- Hard limits: ${profile.safety.hard_limits.join('; ') || '(none)'}
- Soft limits: ${profile.safety.soft_limits.join('; ') || '(none)'}
**Mechanics depth:** ${profile.mechanics_depth} (apply the rubric from mc-instructions.md)
`
  : `## PLAYER PROFILE
**FIRST-TIME PLAYER — no profile.json exists yet.** Run the player-onboarding phase (see mc-instructions.md) before character creation. Emit a <save_player> block at the end of onboarding.
`;
```

Append `profileContext` to the existing prompt-assembly string.

- [ ] **Step 3: Add an import**

At the top of the file, add:

```javascript
import { readProfile } from './profile.js';
```

- [ ] **Step 4: Smoke test by reading an absent profile**

Run the existing test suite to confirm no regressions:

```bash
cd bot && npm test
```

Expected: all tests pass. (No new test for this task — it's a wiring change inside the MC prompt builder. The behavior is exercised by the existing test suite and by manual smoke-testing in the audit step.)

- [ ] **Step 5: Commit**

```bash
git add bot/handlers/mc.js
git commit -m "feat(bot): inject player profile into MC prompt; signal first-time players"
```

---

## Task 17: Bot — handle `<save_player>` close block on player-onboarding

**Files:**
- Modify: `bot/handlers/session.js` (or wherever close-block dispatch happens — likely the same file)

- [ ] **Step 1: Locate the close-block dispatch site**

```bash
grep -n "parseSaveOnboardingBlock\|parseCloseSession" bot/handlers/*.js
```

Identify the function that runs after the MC's response is received and routes the close block to the right writer (sheet writer, state writer, etc.). It's likely `processMcResponse` or similar in `bot/handlers/session.js`.

- [ ] **Step 2: Add a save_player dispatch branch**

Where the existing code checks for `parseSaveOnboardingBlock`, add a parallel branch that checks for `parseSavePlayerBlock` *first* (before save_onboarding — a brand-new user emits save_player, then later in the same response or next turn emits save_onboarding for their first character).

```javascript
import { parseSavePlayerBlock, missingSavePlayerFields, parseSaveOnboardingBlock, missingSaveOnboardingFields } from './session.js';
import { writeProfile } from './profile.js';

// ...

const savePlayer = parseSavePlayerBlock(mcResponseText);
if (savePlayer) {
  const missing = missingSavePlayerFields(savePlayer);
  if (missing.length) {
    console.warn(`save_player missing fields: ${missing.join(', ')}`);
    // Optionally: send a soft re-prompt to the MC; for v1, log and move on.
  } else {
    let safetyParsed;
    try {
      safetyParsed = JSON.parse(savePlayer.safety);
    } catch {
      safetyParsed = { hard_limits: [], soft_limits: [] };
    }
    const profile = {
      discord_id: savePlayer.discord_id,
      display_name: savePlayer.display_name || '',
      safety: safetyParsed,
      mechanics_depth: 3,
      mechanics_depth_set: false,
      characters: [],
    };
    writeProfile(repoRoot, profile);
  }
}
```

- [ ] **Step 3: Run the existing test suite**

```bash
cd bot && npm test
```

Expected: all tests pass. (No new behavioral test here — the parser tests cover parsing; the writer tests cover writing; this task wires them together. Wiring is exercised by the smoke test in Task 22.)

- [ ] **Step 4: Commit**

```bash
git add bot/handlers/session.js
git commit -m "feat(bot): persist save_player blocks to profile.json"
```

---

## Task 18: Bot — post-close profile maintenance (profile_patch + calibration)

**Files:**
- Modify: `bot/handlers/session.js` (or wherever `<close_session>` is handled)

This task does two things in a fixed order after every successful close-session write:
1. Apply any `profile_patch` the MC put inside the close-session `state_patch` (from a carryover-confirm beat at character creation).
2. Check whether the player still has `mechanics_depth_set: false` and, if so, post the one-shot calibration prompt.

- [ ] **Step 1: Locate the close-session post-write hook**

Find where the bot finishes writing close-session artifacts (sheet, state, events). Both behaviors below run immediately after those writes succeed.

- [ ] **Step 2: Apply `profile_patch` if present in `state_patch`**

The MC may include a `profile_patch` key inside the close-session `state_patch` JSON when the player updated safety or mechanics_depth during the carryover-confirm beat. The bot reads it and merges into `profile.json`.

```javascript
import { readProfile, writeProfile } from './profile.js';

// After close-session writes succeed:
const discordId = interaction.user.id;
let profile = readProfile(repoRoot, discordId);

// 1. Apply profile_patch if present
if (profile && close.state_patch) {
  let statePatchParsed;
  try {
    statePatchParsed = JSON.parse(close.state_patch);
  } catch {
    statePatchParsed = null;
  }
  const patch = statePatchParsed && statePatchParsed.profile_patch;
  if (patch && typeof patch === 'object') {
    if (patch.safety && typeof patch.safety === 'object') {
      profile.safety = {
        hard_limits: Array.isArray(patch.safety.hard_limits) ? patch.safety.hard_limits : profile.safety.hard_limits,
        soft_limits: Array.isArray(patch.safety.soft_limits) ? patch.safety.soft_limits : profile.safety.soft_limits,
      };
    }
    if (typeof patch.mechanics_depth === 'number' && patch.mechanics_depth >= 1 && patch.mechanics_depth <= 5) {
      profile.mechanics_depth = patch.mechanics_depth;
      profile.mechanics_depth_set = true;
    }
    writeProfile(repoRoot, profile);
  }
}
```

The patch is permissive: it accepts partial updates (`safety` only, `mechanics_depth` only, or both). Unknown keys are ignored. Out-of-range mechanics_depth values are ignored.

- [ ] **Step 3: Re-read the profile (it may have been patched above) and run the calibration check**

```javascript
profile = readProfile(repoRoot, discordId);
if (profile && profile.mechanics_depth_set === false) {
  await thread.send({
    content:
      `Quick calibration — how did the amount of mechanics feel this session? ` +
      `Pick a level from **1** (surface most mechanics — named moves, dice, modifiers) ` +
      `to **5** (mechanics fully hidden, pure story). ` +
      `\n\nReply with \`/prefs mechanics N\` (where N is 1–5) and that will be your default going forward.`,
  });
}
```

Because Step 2 sets `mechanics_depth_set: true` whenever a valid `mechanics_depth` is in the patch, the calibration prompt fires only when the player has neither (a) answered calibration before nor (b) updated mechanics_depth via the carryover beat or `/prefs`.

For v1 we do not implement React button UI — a text reply via `/prefs mechanics N` is enough. (The `/prefs` command itself is built in Task 19; until then, this message will be informational only.)

- [ ] **Step 4: Run the existing test suite**

```bash
cd bot && npm test
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add bot/handlers/session.js
git commit -m "feat(bot): apply profile_patch on close; fire one-shot mechanics calibration"
```

---

## Task 19: Bot — `/prefs` slash command

**Files:**
- Create: `bot/commands/prefs.js`
- Modify: `bot/deploy-commands.js`

- [ ] **Step 1: Read existing command structure**

Inspect `bot/commands/` and `bot/deploy-commands.js` to understand how commands are registered. (Skipping a test-first pattern here — Discord slash commands are difficult to unit-test in isolation; coverage is via smoke testing.)

- [ ] **Step 2: Create `bot/commands/prefs.js`**

```javascript
import { SlashCommandBuilder } from 'discord.js';
import { readProfile, writeProfile } from '../handlers/profile.js';

const REPO_ROOT = process.env.COS_REPO_ROOT || process.cwd();

export const data = new SlashCommandBuilder()
  .setName('prefs')
  .setDescription('View or update your player preferences (safety, mechanics depth)')
  .addSubcommand((sc) =>
    sc.setName('view').setDescription('DM your current profile')
  )
  .addSubcommand((sc) =>
    sc
      .setName('mechanics')
      .setDescription('Set mechanics depth (1 = surface most, 5 = hide most)')
      .addIntegerOption((o) =>
        o
          .setName('level')
          .setDescription('1 through 5')
          .setRequired(true)
          .setMinValue(1)
          .setMaxValue(5)
      )
  )
  .addSubcommand((sc) =>
    sc.setName('safety').setDescription('Start a DM flow to edit hard/soft limits')
  );

export async function execute(interaction) {
  const sub = interaction.options.getSubcommand();
  const discordId = interaction.user.id;
  const profile = readProfile(REPO_ROOT, discordId);

  if (!profile) {
    await interaction.reply({
      content:
        "You don't have a player profile yet. Start a session in your private thread and the MC will run player-onboarding.",
      ephemeral: true,
    });
    return;
  }

  if (sub === 'view') {
    const text =
      `**Your profile**\n` +
      `**Hard limits:** ${profile.safety.hard_limits.join('; ') || '(none)'}\n` +
      `**Soft limits:** ${profile.safety.soft_limits.join('; ') || '(none)'}\n` +
      `**Mechanics depth:** ${profile.mechanics_depth} (1 = surface most, 5 = hide most)\n` +
      `**Characters:** ${profile.characters.join(', ') || '(none yet)'}`;
    await interaction.user.send(text);
    await interaction.reply({ content: 'Sent to your DMs.', ephemeral: true });
    return;
  }

  if (sub === 'mechanics') {
    const level = interaction.options.getInteger('level');
    profile.mechanics_depth = level;
    profile.mechanics_depth_set = true;
    writeProfile(REPO_ROOT, profile);
    await interaction.reply({
      content: `Mechanics depth set to **${level}**.`,
      ephemeral: true,
    });
    return;
  }

  if (sub === 'safety') {
    await interaction.user.send(
      `To edit safety limits, reply here with one line per change:\n` +
      `\`add-hard: <thing>\`, \`remove-hard: <thing>\`, \`add-soft: <thing>\`, \`remove-soft: <thing>\`\n` +
      `Reply \`done\` when finished. (v1: this is informational only — manual edit of profile.json in the repo is the v1 mechanism.)`
    );
    await interaction.reply({ content: 'Check your DMs.', ephemeral: true });
    return;
  }
}
```

Note: `/prefs safety` is a v1 placeholder. Full DM-edit flow with state machine is out of scope; the message points the user at manual edit. If you want richer safety editing in v1, file a follow-up.

- [ ] **Step 3: Register the command in `bot/deploy-commands.js`**

Locate where existing commands are imported and added to the deploy array. Add a line for `prefs`:

```javascript
import * as prefs from './commands/prefs.js';
// ...
const commands = [
  // existing commands...
  prefs.data.toJSON(),
];
```

Also ensure `bot/index.js` (or the message handler) loads the command. Most discord.js setups iterate `commands/*.js` automatically — check that pattern and follow it.

- [ ] **Step 4: Deploy commands locally to test (optional dev step)**

If a dev guild is configured:

```bash
cd bot && node deploy-commands.js
```

This is dev-only. Production deploy happens on the bot's normal release path.

- [ ] **Step 5: Run tests**

```bash
cd bot && npm test
```

Expected: all tests pass (no new tests; command behavior smoke-tested manually).

- [ ] **Step 6: Commit**

```bash
git add bot/commands/prefs.js bot/deploy-commands.js
git commit -m "feat(bot): add /prefs slash command (view, mechanics, safety placeholder)"
```

---

## Task 20: Update `README.md`

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Read the current README**

Read `README.md` in full.

- [ ] **Step 2: Add a "Player vs Character" section**

Add a new section (placement: after the project overview, before any setup instructions). Suggested content:

```markdown
## Player vs Character

City of Shadows separates two concepts that used to be conflated in this repo:

- A **player** is a Discord user. They have content-safety preferences and a mechanics-depth preference (how visible the rules engine is in MC narration). One person, one profile.
- A **character** is a fictional PC the player runs. Stats, sheets, gear, advances. One person can own multiple characters.

**Player data** lives at `players/by-id/<discord-snowflake>/profile.json`. See `mc-reference/state-schema.md` for the schema.

**Character data** lives at `players/<character-slug>/`: `sheet.md`, `handoff.md`, `state.json`. The `players/index.json` file is the character roster with `owner_id` pointing at the Discord snowflake who owns each one.

### Mechanics Depth

A player picks an integer 1–5 that controls how much of the engine the MC surfaces. 1 = full table-top crunch (named moves, visible dice, stat math). 5 = pure narrative (mechanics happen entirely behind the curtain). Default is 3. The bot fires a one-time calibration prompt at the end of the player's first session; after that, the player can adjust anytime with `/prefs mechanics N`.

### `/prefs` Command

- `/prefs view` — DMs you your current profile.
- `/prefs mechanics 1-5` — set mechanics depth.
- `/prefs safety` — (v1 placeholder) instructions for editing limits.
```

- [ ] **Step 3: Update any existing references to `state.json.safety` or `player_id`**

Search the README:

```bash
grep -in "safety\|player_id" README.md
```

For any matches, update them to point at the new profile location and the renamed `character_id` field.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: explain player vs character distinction; document /prefs and mechanics_depth"
```

---

## Task 21: Update `docs/OPERATOR.md`

**Files:**
- Modify: `docs/OPERATOR.md`

- [ ] **Step 1: Read the current operator doc**

Read `docs/OPERATOR.md` in full to understand its tone and structure.

- [ ] **Step 2: Update the directory layout section**

If the doc has a "Repo Layout" or similar section, update it to reflect:

```
players/
  by-id/<snowflake>/profile.json   # player-scoped (NEW)
  _player_template/profile.json     # (NEW)
  _template/state.json              # character schema; safety removed; player_id → character_id
  <character-slug>/                 # character folders
  index.json                        # roster; entries now include owner_id
```

- [ ] **Step 3: Update any section that documents close blocks**

Add `<save_player>` to the list of MC-emitted close blocks (alongside `<save_onboarding>` and `<close_session>`). Reference `mc-reference/bot-output-format.md` for the schema.

- [ ] **Step 4: Update any section that mentions safety**

Safety is now player-scoped, not character-scoped. Any operator instructions that say "to update a character's safety, edit state.json" → change to "to update a player's safety, edit profile.json under players/by-id/<snowflake>/".

- [ ] **Step 5: Document `/prefs` in any "Slash Commands" section**

If the doc has a slash-commands reference, add `/prefs view`, `/prefs mechanics`, `/prefs safety`. Otherwise, add a short subsection.

- [ ] **Step 6: Document the calibration flow**

Add a short note under operator-facing flows: the bot fires a one-time calibration prompt after a player's first session close. Operators can override `mechanics_depth_set: true` manually in `profile.json` to suppress it.

- [ ] **Step 7: Commit**

```bash
git add docs/OPERATOR.md
git commit -m "docs(operator): document profile.json, /prefs, and calibration flow"
```

---

## Task 22: Audit pass

**Files:** none (verification only); fix any stragglers in-place.

- [ ] **Step 1: Grep for residual `player_id` references**

```bash
grep -rn "player_id" --include="*.js" --include="*.json" --include="*.md" \
  --exclude-dir=node_modules --exclude-dir=.git \
  --exclude="docs/superpowers/plans/2026-05-14-*" \
  --exclude="docs/superpowers/specs/2026-05-14-*" \
  .
```

Expected: no matches. If matches appear, decide per-file whether they need renaming. Old plan/spec docs (2026-05-14-*) are historical and not touched.

- [ ] **Step 2: Grep for residual `safety` in character state**

```bash
grep -rn '"safety"' players/ game/
```

Expected: no matches. The `safety` block only exists inside `players/by-id/<snowflake>/profile.json` files (none yet, but the `_player_template/profile.json` should be the only match).

- [ ] **Step 3: Grep for `session.player.name` and similar character/Discord conflations**

```bash
grep -rn "session.player.name" bot/
```

Review each match. Confirm the comment at `bot/handlers/session.js:499-504` is updated if the field name changed.

- [ ] **Step 4: Run the full test suite**

```bash
cd bot && npm test
```

Expected: all tests pass with no skipped tests.

- [ ] **Step 5: Smoke test — simulate a first-time-user save_player block**

Create a temporary script (do not commit) or run a Node REPL session:

```javascript
import { parseSavePlayerBlock, missingSavePlayerFields } from './bot/handlers/session.js';
import { writeProfile, readProfile } from './bot/handlers/profile.js';

const sample = `<save_player>
<discord_id>999999999999999999</discord_id>
<display_name>SmokeTest</display_name>
<safety>{ "hard_limits": ["x"], "soft_limits": ["y"] }</safety>
</save_player>`;

const parsed = parseSavePlayerBlock(sample);
console.log('parsed:', parsed);
console.log('missing:', missingSavePlayerFields(parsed));

const profile = {
  discord_id: parsed.discord_id,
  display_name: parsed.display_name,
  safety: JSON.parse(parsed.safety),
  mechanics_depth: 3,
  mechanics_depth_set: false,
  characters: [],
};
writeProfile(process.cwd(), profile);
console.log('written:', readProfile(process.cwd(), parsed.discord_id));
```

Expected: parse returns the object; missing returns `[]`; readProfile returns the full structure.

Delete the test profile after smoke-testing:

```bash
rm -rf players/by-id/999999999999999999
```

- [ ] **Step 6: Final verification commit (only if fixes were needed)**

If Steps 1-3 surfaced any stragglers and you fixed them inline:

```bash
git add <fixed files>
git commit -m "chore: address audit findings (player_id, safety, conflations)"
```

If everything was clean, no commit is needed. The audit is the gate, not a deliverable.

---

## Done

After Task 22, the change is complete. The repo is on `main`, all commits direct. Next time a Discord user starts a thread, the bot detects no `profile.json`, the MC runs player-onboarding, the player provides safety, the bot writes the profile, character creation begins. End-of-first-session calibration fires once; never again. `/prefs` is available throughout.

---

## Out of Scope (do not implement; spec lists these as future work)

- Implicit phrase-watching ("less crunch" → auto-adjust mechanics_depth).
- Re-seeding canonical lore NPCs in `game/npcs.json` after the depopulation pass.
- Dashboard surfacing of player profiles or mechanics_depth (current dashboard touch is the rename only).
- Per-character mechanics_depth overrides.
- Rich DM-driven safety editing in `/prefs safety` (placeholder only in v1).
