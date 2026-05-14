# Experience-first `/play` character selection

**Date:** 2026-05-14
**Status:** Design approved, pending implementation plan

## Problem

The current onboarding tells operators to manually edit `players/index.json` to add a `discord_user_id` field for every character they want to play (OPERATOR.md step 7). This has three problems:

1. Every new character requires a commit + push before the user can play it.
2. A character can only be played from a single Discord account — a friend, an alt account, or a co-player cannot pick the character up.
3. The live `players/index.json` doesn't actually carry `discord_user_id` fields today, so `/play` falls into the "no character linked" error path until the manual edit is done.

The fix is to drop Discord-identity binding entirely and let any guild member pick any character from a menu.

## Target experience

1. Player runs `/play`.
2. Bot replies with a select menu listing every character plus a `+ New character` entry.
3. Player picks one.
4. Bot loads the character's handoff and opens a private session thread.
5. Player plays in the thread.
6. Player tells the MC they're ending; MC writes a close block; bot commits handoff/state/events and archives the thread.

Discord identity never enters the flow. Guild membership (enforced by `DISCORD_GUILD_ID`) is the only access control.

## Design

### Data model

`players/index.json` is just the roster — no per-character Discord IDs:

```json
[
  { "id": "benjamin-grey", "name": "Benjamin Grey" },
  { "id": "chris-caustes", "name": "Chris Caustes" }
]
```

This is a strict subset of the schema documented today, so no existing entries need migration.

### `/play` flow

- `/play` (no args) → ephemeral reply containing a Discord string-select menu. First option is `+ New character`; remaining options are the character roster (label = `name`, value = `id`).
- On menu submit:
  - `+ New character` → open private thread, run the existing onboarding path (equivalent to today's `character:new`).
  - An existing `id` → concurrency check (below); if clear, open private thread, load `players/<id>/handoff.md`, call existing `startSession`.
- `/play character:<id>` flag is retained as a power-user shortcut that skips the menu but still runs the concurrency check. `character:new` continues to work as a shortcut to the onboarding path.

### Concurrency check

When a user picks an existing character, the bot calls `channel.threads.fetchActive()` on the parent text channel and looks for a thread named `<character.name> — session` (the same name `play.js` already uses on creation). If one exists and is not archived, the bot replies ephemerally:

> `<name>` is currently in a session: <thread link>. Try another character.

Otherwise it proceeds to create the thread. Archiving the thread (which happens on close) clears the lock automatically. Discord is the single source of truth — no `.sessions.json` file, no in-memory map.

### Save & exit

Unchanged. The MC close block already triggers `handoff.md`, `state.json`, and `events-log.md` commits via `bot/handlers/github.js`, then archives the thread.

## Code changes

- **`bot/commands/play.js`** — Remove `discord_user_id` filtering. When invoked without the `character` option, build a `StringSelectMenuBuilder` with `+ New character` plus the roster and reply ephemerally. When invoked with the option, run the concurrency check before creating the thread. The thread-creation block moves to a shared helper so both code paths use it.
- **`bot/handlers/interactions.js`** (new) — Handle `StringSelectMenuInteraction` for the play menu. Dispatches to the shared thread-creation helper.
- **`bot/index.js`** — Route component interactions to the new handler if not already.
- **`bot/handlers/session.js`** — No changes expected; `startSession` is reused as-is.
- **`bot/handlers/github.js`** — No changes; `listPlayers` already returns the right shape.
- **`docs/OPERATOR.md`** — Delete step 7 ("Link your Discord account to a character"). Renumber subsequent steps. Rewrite step 8 ("First session") to describe the menu-driven flow.
- **`players/index.json`** — No edits required.

## Testing

- Run `/play` in the configured guild with no args → menu appears, lists all 5 characters plus `+ New character`.
- Pick an existing character → private thread opens, handoff loads, opening scene posts.
- Pick `+ New character` → onboarding flow runs.
- While a session thread is active, run `/play` and pick the same character from another account → ephemeral block message with link to the live thread.
- Close a session (MC close block) → thread archives → re-running `/play` for that character succeeds.
- `/play character:<id>` (power-user shortcut) → skips menu, still runs concurrency check.

## Out of scope (YAGNI)

- Per-character privacy / ACLs. If specific characters ever need to be locked to specific users, add a `private: true` flag later.
- Multi-player co-op on one character. The concurrency check explicitly blocks it.
- Renaming, merging, or deleting characters.
- Audit log of who played which character when (git history of handoff commits is sufficient).
