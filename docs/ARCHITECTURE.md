# City of Shadows — Architecture

How the platform is put together and why. For setup instructions see
[OPERATOR.md](OPERATOR.md); for where the project is headed see
[VISION.md](VISION.md).

---

## Contents

- [The one-line model](#the-one-line-model)
- [Components](#components)
- [The session loop](#the-session-loop)
- [Data model](#data-model)
- [The MC contract](#the-mc-contract)
- [Cross-cutting concerns](#cross-cutting-concerns)
- [Deployment](#deployment)

## The one-line model

> **The repository is the database. The MC is a stateless function over it.**

There is no application server holding game state, no SQL, no session store that
survives a restart. The world lives as plain-text and JSON files in this Git
repo. A session reads those files into a language model's context, plays out, and
writes new files back. Everything else is plumbing around that loop.

---

## Components

| Component | Runtime | Responsibility |
|-----------|---------|----------------|
| **This repo** | GitHub | Single source of truth for all game state. Every session-close is one or more commits. |
| **`bot/`** | Node.js 20 on Fly.io | Discord gateway, command routing, MC context assembly, model calls, write fan-out. |
| **`mc-reference/`** | (data) | The MC's system prompt — rules, moves, playbooks, WoD extensions, schemas, output contract. Loaded every session. |
| **`game/`, `hubs/`, `players/`** | (data) | The world: NPCs, arcs, events, interactions, neighborhood lore, per-player profiles, per-character state. |
| **`dashboard/`** | Static site on GitHub Pages | Read-only window into the world, rendered from raw GitHub content. |
| **DeepSeek API** | external | The MC. `deepseek-chat` via the OpenAI-compatible SDK. |

The bot is the only writer. The dashboard is a pure reader. The model never
touches GitHub directly — it emits structured text that the bot parses and
commits.

---

## The session loop

This is the heart of the system. One full turn:

```
Discord message in a session thread
        │
        ▼
 session.js  ── per-thread async lock (serialize turns) ──┐
        │                                                  │
        ▼                                                  │
 mc.js  buildOpeningContext()  (first turn only)           │
        │  reads handoff, sheet, state.json, events tail,   │
        │  interactions, player profile from GitHub         │
        ▼                                                  │
 mc.js  getSystemPrompt()  (cached: full mc-reference)      │
        │                                                  │
        ▼                                                  │
 DeepSeek chat.completions  ◄── maybeCompact() if long ────┘
        │
        ▼
 session.js  parse + strip structured blocks
        │   <save_player> → profile.json
        │   <save_onboarding> → sheet/state/npcs/index (mid-session)
        │   <close_session> → handoff/state/events/npcs/arcs/interactions
        │
        ▼
 sanitizePlayerFacingText()  strip any leaked tags
        │
        ▼
 post cleaned narrative to the Discord thread
        │
        ▼  (on close)
 github.js  write fan-out (retrying, read-modify-write)
        │
        ▼
 archive thread; drop in-memory session
```

### Statelessness

The bot keeps an in-memory `messages[]` array **only while a thread is live**.
On session close — or a bot restart — that array is discarded. If a player types
into a thread whose in-memory session is gone (restart), the bot tells them to
`/play` again rather than silently dropping the message.

Continuity is therefore a property of the *documents*, not the chat log:

- `players/<id>/handoff.md` — last beat, who's present, mood, open threads
- `players/<id>/state.json` — mechanical state (stats, harm, XP, circles, gear)
- `players/<id>/sheet.md` — the character sheet
- `game/events-log.md` — public world events (tail loaded each session)
- `game/interactions.json` — pending asynchronous player-to-player effects

Every session opens by feeding these back in. The MC reads them and drops the
player into the scene where they left off.

---

## Data model

### Player vs. character

A deliberate split (added in 0.1.0):

- A **player** is a Discord user — one human, one profile, keyed by their Discord
  snowflake at `players/by-id/<snowflake>/profile.json`. Holds content-safety
  limits and a mechanics-depth preference. **Carries forward across every
  character that person creates.**
- A **character** is a fictional PC — stats, sheet, gear, advances — at
  `players/<character-slug>/`. One player can own many; characters are linked
  back to their owner via `owner_id` in the roster and `characters[]` in the
  profile.

Safety and mechanics depth live on the *player*, never on the character, so they
can't drift between a person's PCs.

### State files

```
players/
├── index.json                  roster: [{ id, name, owner_id }]
├── by-id/<snowflake>/profile.json   player-scoped (safety, mechanics_depth, characters[])
├── _player_template/profile.json
├── _template/state.json        canonical full state shape
└── <character-id>/
    ├── state.json              stats, harm, corrupt, xp, advances, circles, gear, arc ids
    ├── sheet.md
    └── handoff.md

game/
├── npcs.json                   canonical NPC identity, voice, status, location refs
├── locations.json              canonical named places linked to hubs
├── relationships.manual.json   human-curated public ties
├── relationships.derived.json  public ties discovered in play
├── arcs.json                   story arcs (status: active/escalating/resolved)
├── interactions.json           pending player-to-player effects
├── events-log.md               public timeline (markdown H2 entries)
└── world-bible.md              setting truth, factions, Overwrite premise

hubs/
├── index.json
└── <neighborhood>.md           per-hub lore
```

`freshCharacterState()` in `session.js` mirrors `_template/state.json` and seeds
every new character so a sparse MC patch never leaves the dashboard reading a
missing field.

---

## The MC contract

The model is steered entirely through documents and a structured output format —
there is no fine-tuning and no tool-calling.

**In (system prompt):** `getSystemPrompt()` concatenates the entire
`mc-reference/` tree into one labeled prompt (rules, basic/MC moves, all
playbooks, 8 WoD extensions, character-creation wizard, NPC personality engine,
state schema, output format). It is built once and cached for the process
lifetime (`resetSystemCache()` clears it).

**In (per session):** `buildOpeningContext()` assembles the player profile plus
either the new-character onboarding brief or the returning character's
handoff/sheet/state/events/interactions. Both paths also receive the canonical
hub/NPC/location/public-relationship index, so different players encounter the
same identities, statuses, places, and voices.

**Out (structured blocks):** the MC embeds machine-parseable blocks in otherwise
natural prose. `session.js` extracts them, acts on them, and strips them before
posting:

| Block | When | Writes |
|-------|------|--------|
| `<save_player>` | end of first-time player onboarding | `profile.json` |
| `<save_onboarding>` | new character created mid-session | sheet, state, NPCs, locations, public relationships, roster, profile link |
| `<close_session>` | session ends | handoff, state, events, NPCs, locations, public relationships, arcs, interactions, world event |

Because the MC writes free prose around these tags, a defense-in-depth
`sanitizePlayerFacingText()` pass strips any leaked, truncated, or orphaned
structured tags before they reach a player, and triggers a bounded next-turn
re-emit nudge when persistence didn't land.

---

## Cross-cutting concerns

**Concurrency.** A per-session `lock()` serializes turns within a thread so two
fast messages can't produce two consecutive user turns (which chat-completions
APIs reject). Across sessions, shared-file writes go through `updateFile` /
`updateJSON`, which read-modify-write with retry on 409/422 so two close blocks
touching `npcs.json` merge instead of one overwriting the other.

**Context cost.** The system prompt is large (full reference layer + WoD
extensions + wizard). Two mechanisms keep cost bounded:
- DeepSeek's automatic disk-based prefix cache means the stable system prompt +
  opening message are cached transparently across a multi-turn session (logged as
  `cache_hit` / `cache_miss`).
- `maybeCompact()` summarizes the middle of a long transcript once it crosses
  `COMPACT_AT` turns, keeping the head and the last `KEEP_RECENT` turns verbatim.

**Provider abstraction.** The MC is reached through the OpenAI-compatible client,
so swapping providers (Anthropic ⇄ DeepSeek ⇄ others) is a base-URL, key, and
model-name change in `mc.js` rather than a rewrite. The platform migrated from
Claude Sonnet 4.6 to `deepseek-chat` this way (see [CHANGELOG](../CHANGELOG.md)).

**Dashboard freshness.** The dashboard sanitizes markdown through DOMPurify
before `innerHTML` and bumps a `?v=` token on refresh to defeat the raw-content
CDN's ~5-minute cache.

---

## Deployment

| Piece | Host | Notes |
|-------|------|-------|
| Bot | Fly.io | 256MB shared-cpu instance; secrets via `fly secrets`. |
| Dashboard | GitHub Pages | `.github/workflows/pages.yml` deploys `dashboard/` on push to `main`. |
| State | GitHub repo | Public repo required (Pages + raw-content reads). |
| MC | DeepSeek API | `DEEPSEEK_API_KEY`. |

Full setup in [OPERATOR.md](OPERATOR.md).
