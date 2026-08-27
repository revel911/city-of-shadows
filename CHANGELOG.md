# Changelog

All notable changes to City of Shadows are recorded here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
This project uses date-stamped releases rather than strict [SemVer](https://semver.org/) —
the game world is the product, so "releases" mark meaningful changes to how the
platform behaves, not API compatibility.

## [Unreleased]

### Changed
- Pending moves now accept either bot-rolled dice through `/roll`, a manual 2d6
  subtotal such as `I rolled an 8`, or both individual dice. A subtotal resolves
  immediately on a modified 7+; on a miss, the bot asks only for the Instinct
  Die. Every path shares canonical modifiers, tiers, receipts, and Extreme
  Failure rules.
- **MC engine migrated from Anthropic Claude (`claude-sonnet-4-6`) to DeepSeek (`deepseek-chat`).**
  The bot now talks to the DeepSeek API through the OpenAI-compatible SDK
  (`openai` npm package pointed at `https://api.deepseek.com`). Generation runs at
  a controlled creative temperature (1.0); the mid-session summarizer runs at 0
  for faithful recaps.
- Prompt caching is now handled by DeepSeek's automatic disk-based context cache
  (keyed on the longest shared prefix) instead of explicit Anthropic cache
  breakpoints — no code-side cache markers needed. Per-turn logs report
  `cache_hit` / `cache_miss` token counts.
- Configuration: `ANTHROPIC_API_KEY` replaced by `DEEPSEEK_API_KEY` in
  `bot/.env.example` and the Fly.io secrets.
- Player actions that clearly trigger a basic move now pass through a
  deterministic mechanics gate. The narrator must request `/roll`, stop before
  the outcome, and use the canonical modifier. Skipped, malformed, mismatched,
  continued, or prematurely resolved move requests are regenerated, with a
  bot-authored fallback and `/roll` recovery if the model still fails.
- Contextual danger now participates in move detection, including precarious
  physical tasks that trigger Keep Your Cool. Every active-play turn receives a
  move audit, and a three-turn roll drought tells the MC to bring existing
  pressure onstage without manufacturing checks for routine actions. Pending
  rolls must be resolved or explicitly canceled before narration continues.
- Ambiguous turns now pass through a strict pre-narration move adjudicator after
  the fast deterministic gate. It checks every basic move plus rollable moves on
  the active character sheet, validates move names and modifiers, and retries one
  malformed decision before falling back to the narrator audit. Mechanics depths
  1-3 must visibly name a triggered move before `/roll`.
- Put a Name to a Face is restricted to connecting a person’s name and face;
  recalling or recognizing symbols is not this move. Longer roll droughts
  hard-frame existing threats and costs instead of continuing setup or lore
  delivery.
- Added a layered narrative/rules/world engine: structured trigger, non-trigger,
  and prerequisite definitions for all twelve basic moves; move-specific
  post-roll resolution contracts; fail-forward investigation depth; derived
  mystery stage and character knowledge; pressure-intersection scene ranking;
  deterministic City Keeper candidates and cooldowns; and public mystery
  dashboard/graph projections. Mandatory weak-hit Let It Out corruption is now
  reconciled automatically, and 12+ outcomes require an actually advanced move.
- Documentation now has validated knowledge maps with linked titles, descriptions,
  authority, and runtime-load classifications for every file under docs/ and
  mc-reference/. Local bot, dashboard, and script maps describe the remaining
  implementation structure; the MC loads the reference authority map before rules.
- Normal turns now receive lightweight prose-quality checks for accidental word
  repetition, broken pronoun clauses, and contradictory physical details.
  Rejected prose is regenerated before it reaches Discord.
- Direct player questions and messages marked OOC now pause fiction and character
  creation. They bypass mechanics adjudication and pending-roll blocking without
  consuming the roll, and OOC replies cannot emit roll or persistence blocks.
  OOC clarifications inherit the pause, while echoed or question-only non-answers
  are rejected and regenerated.
- Opening hooks with deadlines must include the current in-fiction time. The
  response guard also rejects impossible object timelines such as declaring an
  envelope gone and then inviting the player to watch it be collected.
- Returning recaps may not infer character-specific ties from canonical NPC or
  location records. Character creation checks new NPC names against the canonical
  directory and cannot repurpose an existing identity, role, owner, or history.
- Character creation now separates extension compatibility from concept fit.
  Slasher is no longer suggested merely because a playbook is Mortalis; an
  explicitly supernatural-hunter concept is offered Hunter: The Vigil first,
  with any off-natural move cost explained.

## [0.1.0] — 2026-05-16

The first working platform: an async, multiplayer Urban Shadows / World of
Darkness game run by an LLM Master of Ceremonies, with all world state living in
this repository as plain text.

### Added

**Core platform**
- Discord bot (Node.js 20, ESM, discord.js 14) that opens a private session
  thread per `/play`, streams turns with the MC, and writes results back to the
  repo on session close.
- GitHub Contents API as the single source of truth for world state — characters,
  NPCs, arcs, hubs, events log, handoffs. Every session close is a set of commits.
- Static dashboard (`dashboard/`) published to GitHub Pages, rendering the live
  world state read-only from raw GitHub content.
- MC reference layer (`mc-reference/`) loaded as the system prompt on every
  session: rules, basic moves, MC moves, all 12 playbooks, 8 World of Darkness
  extensions, the NPC personality engine, the state schema, and the bot
  output-format contract.
- `<close_session>` structured close block: the MC emits handoff, state patch,
  events append, NPC/arc patches, interactions patch, and an optional world
  event; the bot parses and fans them out to the repo.
- Document-driven continuity — no chat history persists between sessions. Each
  session is reconstructed from `handoff.md`, `state.json`, `sheet.md`, the
  events-log tail, and the interaction queue.

**Mid-session context management**
- Automatic conversation compaction: once a session exceeds `COMPACT_AT` turns,
  the middle of the transcript is summarized and replaced, keeping `KEEP_RECENT`
  turns verbatim. Both thresholds are env-tunable.

**Player experience**
- `/play` character-pick menu (replacing the original Discord-ID-to-character
  binding) — anyone in the guild can pick any character, or `+ New character` to
  onboard. An open session locks a character against a second `/play`.
- Six read commands sharing `read-utils.js`: `/sheet`, `/state`, `/events`,
  `/npc`, `/hub`, `/arcs`.
- `/roll` — raw 2d6 with an Instinct Die; the MC applies the stat modifier.
- 13-phase character-creation wizard (`character-creation.md`) walking new
  players from playbook through first scene.

**Player vs. character model**
- Player profile entity (`players/by-id/<discord-snowflake>/profile.json`)
  separated from character state. A profile holds content-safety limits and a
  mechanics-depth preference and carries forward across every character a person
  creates.
- `<save_player>` block + first-time player-onboarding phase: safety limits and
  optional mechanics depth collected before character creation.
- `/prefs` command (`view`, `mechanics <1-5>`, `safety`).
- 5-level mechanics-depth rubric (1 = full crunch → 5 = pure narrative) with a
  one-shot post-first-session calibration prompt; `profile_patch` can update the
  profile from a close block.
- `<save_onboarding>` mid-session persistence so a new character's sheet/state
  lands in the repo before the session formally closes; new characters are
  linked to their owner via `owner_id` and `profile.characters[]`.

**Reliability**
- Per-session async lock so concurrent messages can't interleave model calls and
  break turn alternation.
- `writeFile`/`updateFile`/`updateJSON` retry 409/422 conflicts with jittered
  backoff and do read-modify-write, so concurrent close blocks touching shared
  files (`npcs.json`, `arcs.json`, `events-log.md`) merge instead of clobbering.
- Output sanitization: leaked or truncated structured blocks
  (`save_onboarding` / `close_session` / `save_player` / bare structured tags)
  are stripped before anything reaches Discord, with a next-turn re-emit nudge
  and bounded retry budgets.
- Close-block parser anchored to end-of-response so the MC can't end a session by
  quoting the schema mid-narrative.
- Full `state.json` schema seeding on first save so dashboard reads never hit
  missing fields.

**Tooling & docs**
- `node --test` unit suite for the pure helpers (parsers, formatters, resolvers,
  sanitizer).
- Player-facing `README.md` and operator-facing `docs/OPERATOR.md`.

[Unreleased]: https://github.com/revel911/city-of-shadows/compare/main...HEAD
[0.1.0]: https://github.com/revel911/city-of-shadows/releases/tag/v0.1.0
