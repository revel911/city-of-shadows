# Bot read commands

**Date:** 2026-05-14
**Status:** Design approved, pending implementation plan

## Problem

The bot exposes two slash commands today (`/play` and `/roll`). Every other piece of game state — character sheets, state JSON, events log, NPCs, hubs, arcs — is only reachable inside an active session thread, or via the dashboard at the GitHub Pages URL. Players who want a quick "what's in my state.json" or "remind me who Det. Okafor is" have to leave Discord.

This sub-project adds six read-only slash commands that surface that information in-channel without opening a session.

## Scope

This spec covers sub-project **B** of a larger four-part plan for bot commands. The other sub-projects (session lifecycle, roll improvements, operator/MC tools) get their own specs.

In scope:

- `/sheet`, `/state`, `/events`, `/npc`, `/hub`, `/arcs` slash commands.
- A new `bot/handlers/read-utils.js` module for shared helpers.
- Lightweight refactor: move `chunk()` from `handlers/session.js` and `resolveCharacter` from `commands/play.js` into `read-utils.js`; the originals re-import from there.
- Node's built-in test runner (`node --test`) wired up for the new pure helpers.

Out of scope:

- Any write commands.
- A new MC / operator role check or permission model (everyone is a player; the public repo and dashboard already expose all this data).
- Embeds with custom colors / Discord components — text only.

## Design

### Commands

Each command is its own file under `bot/commands/`, matching the existing one-file-per-command pattern. `bot/deploy-commands.js` already auto-discovers; no changes there.

| Command | Args | Reply visibility | Behavior |
|---|---|---|---|
| `/sheet [character]` | optional string `character` | ephemeral | Resolve character (arg → players/index lookup; else Discord username → players/index). Read `players/<id>/sheet.md`. Send via `sendChunked`. |
| `/state [character]` | optional string `character` | ephemeral | Same resolution as `/sheet`. Read `players/<id>/state.json`. Send as pretty-printed JSON inside a fenced code block via `sendChunked`. |
| `/events [n]` | optional integer `n` (default 3, min 1, max 10; enforced by Discord option validation) | public | Read `game/events-log.md`. Use `parseRecentEvents` to extract the first N H2-sections (the file is newest-first by existing convention). Join with `\n\n---\n\n` and send via `sendChunked`. |
| `/npc <name>` | required string `name` | public | Read `game/npcs.json`. Match by `id` exact → `name` case-insensitive exact → substring on `name`. On ambiguous substring match, list candidates and ask the user to be more specific. Render via `formatNpc` and send. |
| `/hub <name>` | required string `name` | public | Read `hubs/index.json`. Match by `id` exact → `name` case-insensitive exact → slug-of-name. Read `hubs/<file>` and send via `sendChunked`. |
| `/arcs [status]` | optional string `status` with `active`/`escalating`/`resolved`/`all` choices (default `active`) | public | Read `game/arcs.json`. Filter by status. Render each via `formatArc` joined by blank lines and send via `sendChunked`. |

Character resolution for `/sheet` and `/state` mirrors the existing pattern in [bot/commands/play.js:86](../../bot/commands/play.js#L86). If both the arg-based lookup and the Discord-username fallback fail, the bot replies (ephemeral) with the list of known character IDs and a suggestion to pass `character:<id>`.

### Output formatting

NPC and arc Discord output is intentionally minimal — the file keeps the full record, but only the player-relevant fields are rendered.

**`/npc <name>` output:**

```
**Det. Sgt. Paulette Okafor**
Faction: Mortalis  ·  Location: Shockoe Bottom
RPD cold case detective; unofficial breach manager for supernatural incidents
```

Rendered fields: `name`, `faction`, `hub`, `role`. Missing values render as `—`.

**`/arcs [status]` output** — one block per arc, separated by a blank line:

```
**The Collector**
Hubs: Shockoe Bottom, Downtown, University
NPCs: Maren Voss
PCs: Chris Caustes
An entity that catalogs things-that-remember — living artifacts, creatures with memory, and supernatural witnesses. Killed graduate student Maren Voss eight months ago. Still active in the city.
```

Rendered fields: `title`, resolved `hub_ids` → hub names (via `hubs/index.json`), resolved `npc_ids` → NPC names (via `game/npcs.json`), resolved `player_ids` → player names (via `players/index.json`), `summary`. Empty ID lists render as `—`. Unknown IDs are skipped silently.

**`/sheet` and `/hub`:** raw markdown content from the source file, chunked.

**`/state`:** `JSON.stringify(state, null, 2)` wrapped in a fenced ` ```json ` block, chunked.

**`/events [n]`:** the first N H2-section blocks of `game/events-log.md` (newest first per the file's convention), joined with `\n\n---\n\n`, chunked.

### Shared utilities

New file `bot/handlers/read-utils.js`:

```js
// Character resolution — replaces commands/play.js:86 resolveCharacter
export async function resolveCharacter(arg, discordUsername) { /* see below */ }

// Chunked send — replaces handlers/session.js:55 chunk + the inline loop in postMCResponse
export function chunk(text, limit = 1900) { /* extracted from session.js */ }
export async function sendChunked(interaction, content) { /* uses chunk */ }

// Pure formatters
export function formatNpc(npc) { /* 4-line output, see Output formatting */ }
export function formatArc(arc, hubsIndex, npcsById, playersIndex) { /* see Output formatting */ }

// Pure parser
export function parseRecentEvents(markdown, n) { /* returns array of H2-section strings */ }
```

`resolveCharacter` signature and behavior:

```js
export async function resolveCharacter(arg, discordUsername) {
  const players = await listPlayers(); // imported from handlers/github.js
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

`sendChunked` signature and behavior:

```js
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
```

Visibility is established by each command's `interaction.deferReply({ ephemeral: <bool> })` call before invoking `sendChunked`. The helper does not need to know.

### Refactor of existing code

- [bot/commands/play.js:86](../../bot/commands/play.js#L86) `resolveCharacter` is removed; the import switches to `read-utils.js`. Its current signature `(value, players, fallbackName)` is adapted at the call sites — `play.js` already has a `players` array in hand, so it can either keep a thin local wrapper or call the new shape with the list pre-fetched.
- [bot/handlers/session.js:55](../../bot/handlers/session.js#L55) `chunk()` is removed; the import switches to `read-utils.js`. The inline `for (const part of chunk(visible))` loop in `postMCResponse` stays as-is — `sendChunked` is shaped for `Interaction` objects, not `Thread`, so the session sender is not retrofitted in this sub-project.

These are targeted improvements made because the functions are about to grow a second caller, not unrelated cleanup.

### Error handling

Each command wraps its body in try/catch and edits the deferred reply with a short message on failure. Console-logs the full error.

Per-command error messages:

| Command | Failure | Message |
|---|---|---|
| `/sheet`, `/state` | Character not resolved | `No character found. Try \`character:<id>\` — known: <comma-separated ids from players/index>` |
| `/sheet` | File missing | `No sheet found for **<name>**.` |
| `/state` | File missing | `No state found for **<name>**.` |
| `/state` | JSON parse error | `state.json for **<name>** is malformed: <error>` |
| `/events` | events-log.md missing or no H2 sections | `No events logged yet.` |
| `/npc` | No match | `No NPC matches "<query>".` |
| `/npc` | Multiple substring matches | `Multiple NPCs match "<query>": <list>. Be more specific.` |
| `/hub` | No match | `No hub matches "<query>". Known hubs: <list of names from hubs/index.json>` |
| `/arcs` | Zero results after filter | `No arcs with status "<status>".` |
| any | GitHub API 5xx, timeout, network error | `GitHub is unreachable right now — try again in a moment.` |
| any | Unexpected exception | `Something went wrong. Check the bot logs.` |

Argument validation is pushed to Discord wherever possible:

- `/events n` uses `setMinValue(1).setMaxValue(10)` on the integer option.
- `/arcs status` uses `addChoices(...)` with the four valid values.

### Testing

`bot/package.json` gains a `test` script using Node's built-in runner (no new dependencies):

```json
"test": "node --test test/"
```

Pure-function tests only — no Discord, no GitHub, no `fetch`.

| File | Function | Cases |
|---|---|---|
| `bot/test/format-npc.test.js` | `formatNpc` | Full NPC → 4-line output. NPC missing `hub` → `Location: —`. NPC missing `role` → omits line. |
| `bot/test/format-arc.test.js` | `formatArc` | Arc with populated ID lists → resolves to names. Empty ID lists → `—`. Unknown ID in list → skipped. |
| `bot/test/parse-events.test.js` | `parseRecentEvents` | Markdown with 5 H2 sections, n=3 → returns first 3. Markdown with no H2 → returns `[]`. n > available → returns all. |
| `bot/test/resolve-character.test.js` | `resolveCharacter` | arg matches `id`. arg matches `name` case-insensitive. no arg, username matches a player. no arg, no match → null. Stubs `listPlayers` via a small fixture (no network). |

Discord-layer code (`commands/*.js` `execute` functions) is verified manually after implementation: run each of the six commands once with valid args and once with invalid args, confirm visibility matches the spec.

## Open questions / known constraints

- The match-by-substring branch in `/npc` could return surprising results if NPC names share substrings (e.g., querying `voss` could match `Maren Voss` and any other `…voss…`). The "list candidates" path covers this; no fuzzier matching planned for this sub-project.
- `parseRecentEvents` assumes the events log stays newest-first per the comment at [game/events-log.md:8](../../game/events-log.md#L8). If that convention changes, parsing logic changes with it.
- The refactor leaves `session.js`'s post-MC loop using `chunk()` directly rather than `sendChunked`, because `sendChunked` is interaction-shaped. A future unification could move the session sender onto a thread-shaped variant; not in scope here.
