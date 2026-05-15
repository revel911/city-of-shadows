# Player Entity: Safety + Mechanics Depth as Discord-Scoped Preferences

**Status:** Spec — pending implementation plan
**Date:** 2026-05-15
**Repo:** city-of-shadows

---

## Motivation

Two related problems with the current data model:

1. `safety` (a player's hard/soft content limits) is stored per-character in `state.json`. A player with multiple characters re-declares their limits each time they make one, and there is no single source of truth for "this person's limits."
2. There is no representation of *how mechanically surfaced* a player wants MC narration to be. Some players want named moves, dice modifiers, and stat math visible; others want a story that uses the same engine invisibly. Today every player gets the same surface.

Both are properties of the *person* (Discord user), not the fictional character they're playing. Hard limits don't change when you switch from a Vampire to a Wolf. Whether you want to hear "you triggered Read a Person, roll +Mind" or "the room tells you what it wants to" is also a property of the person.

This spec introduces a real player entity keyed by Discord snowflake, moves `safety` to it, adds a new `mechanics_depth` slider, and renames the existing misnamed `player_id` field (which is actually a character slug) to `character_id`. It also wipes the current test character data so we don't carry inconsistent shapes forward.

---

## Data Model

### New: `players/by-id/<discord-snowflake>/profile.json`

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
  "characters": []
}
```

Fields:

- `discord_id` — the player's numeric Discord snowflake. Authoritative key.
- `display_name` — fetched from Discord at first onboarding; used in dashboards and narration. Editable later via `/prefs`.
- `safety.hard_limits` / `safety.soft_limits` — content limits. Single source of truth for this player across all their characters.
- `mechanics_depth` — integer 1–5. 1 = surface most mechanics (named moves, visible dice and modifiers, stat math). 5 = mechanics fully hidden (rolls and moves happen offscreen, outcomes narrated in story terms). Default 3.
- `mechanics_depth_set` — boolean. `false` until the player has answered the calibration question once. Used by the bot to decide whether to fire the calibration prompt at session close.
- `characters` — array of character slugs this player owns. Reverse index; mirrored by `owner_id` per-entry in `players/index.json`.

### New: `players/_player_template/profile.json`

The template used when the bot first encounters a new Discord user. Same shape as above with empty/default values.

### Modified: `players/<character-slug>/state.json`

- **Remove** the `safety` block.
- **Rename** the `player_id` field to `character_id`. (See "Rename" section below.)

### Modified: `players/index.json`

Each entry gains an `owner_id` field pointing at the Discord snowflake that owns this character:

```json
{ "id": "character-slug", "name": "Character Name", "owner_id": "123456789012345678" }
```

Lookups go both ways: snowflake → characters via `profile.json.characters`, character → owner via `index.json[].owner_id`.

### Modified: `game/arcs.json`

`player_ids` arrays are renamed to `character_ids` and emptied during the wipe (see "Wipe Scope").

---

## Bot and MC Flow

### Flow A — First-time Discord user (no `profile.json` exists)

1. Bot detects no `players/by-id/<snowflake>/profile.json`.
2. Bot creates one from `_player_template`, populating `discord_id` and `display_name` from Discord.
3. MC runs a new **player-onboarding phase** in the thread *before* character creation:
   - Optional display-name confirmation.
   - Safety question — verbatim from old character-creation Phase 1.
   - **Does not ask** `mechanics_depth`. Default of 3 stays silent.
4. MC closes player-onboarding with a `<save_player>` block. Bot parses and writes `profile.json`.
5. MC proceeds into character creation (modified Phase 1 — see Flow B).

### Flow B — Character creation

- Phase 1 renamed from "Frame & Safety" to **"Frame"**. The safety prompt is removed. MC instructions tell the MC: "Safety is on the player profile. Do not re-ask."
- For **returning players** (a `profile.json` exists, second-or-later character creation), a **carryover-confirm beat** runs before Phase 1:
  - MC reads back the player's current safety limits and `mechanics_depth` level.
  - "Your hard limits are X. Your soft limits are Y. Mechanics depth is set to N (1 = surface most, 5 = hide most). Still good for this character, or want to change either?"
  - If unchanged → proceed to Phase 1.
  - If changed → quick edit (one or both fields), bot writes back to `profile.json`, then proceeds.
- All other character-creation phases unchanged.

### Flow C — End-of-session calibration

After every `<close_session>` block, the bot checks the player's `mechanics_depth_set`:

- If `false`: bot posts a follow-up message in the thread (not in MC voice — bot voice, OOC). "Quick calibration — how did the amount of mechanics feel? Pick 1 (more mechanics) – 5 (more story)." Player responds via buttons or `/prefs mechanics N`. On answer, bot writes `mechanics_depth: N` and `mechanics_depth_set: true`.
- If `true`: bot does nothing. No further proactive calibration ever.

This fires exactly once per Discord ID, at the close of the player's first session, regardless of which character that first session was for.

### Flow D — MC prompt assembly

When assembling the MC's opening user message for a session, the bot reads `profile.json` for the thread's owner and injects:

- The `safety` block — for hard-limit enforcement during play.
- The `mechanics_depth: N` value, plus a one-line instruction line resolved from the level. The MC system prompt gains a 5-level rubric so the integer maps to consistent behavior.

The bot continues to read `sheet.md`, `state.json`, `handoff.md` as before. `state.json` no longer contains `safety` (the field has moved to `profile.json`).

### Flow E — `/prefs` slash command

Always available, scoped to the invoking Discord user.

- `/prefs view` — DM the player their current `profile.json` (safety + mechanics_depth + display_name).
- `/prefs mechanics <1-5>` — update `mechanics_depth`. Also sets `mechanics_depth_set: true` so auto-calibration doesn't fire later.
- `/prefs safety` — DM-only flow for editing hard/soft limits. Edits are written to `profile.json`.

### Flow F — Implicit triggers — **out of scope**

Watching player phrasing for "less crunch" / "show me my stats" and offering one-tap adjustments is deferred. The only adjustment paths in v1 are calibration (one-shot, post session 1), the carryover-confirm beat (each new character after the first), and `/prefs`.

---

## Mechanics-Depth Rubric

The 5 levels need a single authoritative description that the MC reads at prompt-assembly time. Drafted here; finalized text lives in `mc-instructions.md` after implementation.

| Level | Name (working) | What's surfaced | What's hidden |
|---|---|---|---|
| 1 | **Open table** | Named moves, dice rolls visible with stat + modifiers, Circle ratings, Harm boxes, stat math, advance options spelled out | — |
| 2 | **Crunch-forward** | Named moves, dice results, modifier totals | Detailed stat math (just the result) |
| 3 | **Balanced** (default) | Move triggers narrated naturally; dice results mentioned without full math; stat references sparingly | Modifier breakdowns, stat math |
| 4 | **Story-forward** | Outcomes only ("you press, and they crack") | Move names, dice, modifiers |
| 5 | **Pure narrative** | Story consequences only | Everything mechanical — no rolls visible, no move names, no stat references |

Backend behavior is identical across all levels: the MC still applies all rules, rolls all dice internally, and tracks Harm/XP/Corruption/Circles correctly. Only the *surface* of narration changes.

---

## Wipe Scope

All current data in this repo is from test play. The wipe is narrow but deliberate:

### Delete

- `players/robert-lagrange/`
- `players/chris-caustes/`
- `players/johan-van-axel/`
- `players/benjamin-grey/`
- `players/john-smith/`
- `players/jacob-brooks/`
- `players/joe-nakama/`

### Reset

- `players/index.json` → `[]`
- `game/arcs.json` — for every arc, set `character_ids` (renamed from `player_ids`) to `[]`. Keep arc titles, summaries, hub references, NPC references, MC notes. The world remembers the arcs; they just no longer have named PCs attached.
- `game/interactions.json` — strip any character-id references; keep NPC-side data.
- `game/npcs.json` — for every NPC, set `player_interaction` back to `"None yet"` (or equivalent neutral default). `arc_ids` references stay intact (arcs are being depopulated, not deleted).
- `game/events-log.md` — narrative pass to remove or genericize any direct character-name references. Most existing entries already use lore-voice phrasing ("a practitioner of note") and can stay verbatim; only entries that name a test character need editing. World events stay.

### Keep as-is

- `mc-reference/` (system prompt material — but updated, see "Docs" below)
- `hubs/` (Richmond neighborhood lore)
- `game/world-bible.md` (city lore foundation)
- `players/_template/state.json` (renamed internal field, kept as template)

The intent: the world stays a living world that already has arcs, NPCs, and events. It is currently between casts. New players walk into a populated city, not a blank slate.

---

## Rename: `player_id` → `character_id`

Atomic rename across the whole project. Two field-name patterns:

- **`player_id` (singular)** → `character_id`. Refers to a character folder slug.
- **`player_ids` (plural array)** → `character_ids`. Arrays of character slugs.

Files affected (per pre-spec audit, 21 files total — discounting historical plan/spec docs):

**Code (bot + dashboard):**
- `bot/handlers/session.js`
- `bot/handlers/read-utils.js`
- `bot/test/save-onboarding.test.js`
- `bot/test/save-onboarding-block.test.js`
- `bot/test/missing-new-char-close-fields.test.js`
- `bot/test/format-arc.test.js`
- `dashboard/app.js` (two call sites for `arc.player_ids`)

**MC reference (system prompt material):**
- `mc-reference/mc-instructions.md`
- `mc-reference/state-schema.md`
- `mc-reference/character-creation.md`
- `mc-reference/bot-output-format.md`

**Data files:**
- `players/_template/state.json` (field rename, no data change)
- `game/arcs.json` (rename array key + empty arrays per wipe)
- Character `state.json` files — N/A, deleted in wipe.

**Not touched (historical):**
- `docs/superpowers/plans/2026-05-14-*`
- `docs/superpowers/specs/2026-05-14-*`

MC instructions and the bot's save-block parser **must move together** — any drift between them causes the next save to fail silently with validation errors. The audit step (below) is the safety net.

The new player concept uses the field name `discord_id`, not `player_id`, so there is no name collision after the rename.

---

## Dashboard

`dashboard/app.js` reads `arc.player_ids` in two places:

- [app.js:62](city-of-shadows/dashboard/app.js#L62) — arc rendering, "PCs" line.
- [app.js:765](city-of-shadows/dashboard/app.js#L765) — arc detail card, with a legacy fallback to `arc.players`.

Both updated atomically with the arcs.json rename. No fallback chain needed — single source of truth.

If the dashboard surfaces player profiles or mechanics_depth in the future, that's a separate change. v1 stops at the arcs rename.

---

## Documentation Updates

- `README.md` — explain player vs character distinction, link to profile shape, document `/prefs`, document calibration timing.
- `docs/OPERATOR.md` — operator-facing changes: new directory layout, new `<save_player>` close block, new `/prefs` command surface, calibration flow.
- `mc-reference/mc-instructions.md` — new player-onboarding phase, carryover-confirm beat copy, 5-level mechanics_depth rubric, `<save_player>` close block schema, renames.
- `mc-reference/state-schema.md` — remove `safety` from character schema, add a new section for `profile.json`, renames.
- `mc-reference/character-creation.md` — drop Phase 1 safety prompt, add carryover-confirm intro for returning players.
- `mc-reference/bot-output-format.md` — renames + new `<save_player>` format.

Per [[feedback-city-of-shadows-player-facing-jargon]], any player-facing language (the carryover-confirm beat, the calibration prompt, the `/prefs` help text) defines jargon on first mention. The 1–5 slider needs a one-sentence framing every time it's surfaced.

---

## Audit Step (Implementation Plan Requirement)

The implementation plan will end with an explicit audit pass before commit:

1. Grep all files for `player_id` and `player_ids` — confirm every match is either renamed or in a historical/non-touched file.
2. Grep all files for `safety` — confirm every match is either reading from `profile.json` (correct) or is in `mc-reference/reference/world-of-darkness/*` lore (different sense of the word, unchanged).
3. Grep all files for `session.player.name` and any place that conflates Discord user with character slug.
4. Run the bot's existing test suite (with fixtures updated for the rename). All tests must pass.
5. Smoke test: simulate a new-user onboarding by adding a dummy snowflake folder, running the save-block parser against a hand-crafted `<save_player>` block, verifying `profile.json` is written correctly. Tear down.

---

## Delivery

Direct commits to `main`. No feature branch. No PR.

Recommend grouping commits by concern so individual steps can be reverted cleanly if a regression appears:

1. Schema files and templates (new `_player_template/profile.json`, modified `_template/state.json`).
2. Wipe (delete character folders, reset/scrub `game/` files).
3. Atomic rename across all code, MC docs, dashboard.
4. New player-onboarding phase + carryover-confirm beat in MC instructions.
5. Bot handlers: player-onboarding parse, `<save_player>` close block, calibration follow-up logic.
6. `/prefs` slash command.
7. Docs: README, OPERATOR, mc-reference updates.
8. Audit + test run.

---

## Out of Scope

- Implicit-trigger detection ("less crunch" phrase-watching). Deferred.
- Re-seeding canonical lore NPCs after the wipe. Tommy can curate `game/npcs.json` separately.
- Dashboard surfacing of player profiles or mechanics_depth.
- Per-character mechanics-depth overrides (the slider is strictly player-scoped).
- Migrating existing character data to the new schema — current data is being wiped, so there is no migration.

---

## Open Questions

None at spec-write time. All design questions raised during brainstorming have been resolved.
