# Changelog

## 2026-09-26 - Faster turns, one-tap rolls, and restart-proof sessions

- The bot now writes every roll prompt itself: move, canonical modifier, and
  **Roll for me**, **Enter my dice**, and **Cancel action** buttons. The model
  only emits the roll request, so roll turns no longer regenerate over wording.
- Players can send both dice in one message, Instinct die first (`4 2`), or use
  the dice form; totals still work and ask for the Instinct die only on a miss.
- Ambiguous turns run the move adjudicator alongside the narrator instead of
  before it. The narration is used as-is unless the adjudicator requires a roll.
- Play turns no longer wait on GitHub: character state and the world revision are
  cached, and recovery checkpoints are written after the reply is posted.
- Session closes and character saves land as one atomic commit instead of 6-9
  separate commits, so a save is all or nothing and triggers one Pages build.
- Character creation commits drafts at stage changes, explicit saves, and
  readiness instead of after every choice, and still confirms each choice in
  the thread.
- Live sessions are snapshotted to the bot's private volume after every turn.
  After a restart or deploy, the next message resumes the exact conversation,
  pending roll, and draft instead of asking the player to run `/play`.
- Long replies keep the typing indicator alive and post a short "still working"
  note after about 25 seconds; closes post the narration before save status.
- Removed the unreachable roll-confirmation path and the per-file close retry
  bookkeeping that atomic commits replace.

## 2026-09-25 - Private session transcript archive

- Archive published session messages separately from narrator summaries and public world state.
- Capture edits/deletions with a durable outbox, private-repository checks, retries, and Discord history recovery.
- Export chronological Markdown and JSON by character, thread, or date, retaining observed revisions.
- Recover accessible historical sessions without adding transcripts to model context.

## 2026-09-24 - Natural roll replies and consistent move formatting

- Accept bare dice totals immediately and recognize contextual roll confirmations.
- Ask for the two-dice total in plain language without suggesting a result.
- Normalize visible move names to bold before posting to Discord.

## 2026-09-21 — Mechanics clarification follow-through

- Accumulate the original action and follow-up answers while clarifying a move.
- Prevent the move router from repeating an already-answered question.
- Preserve an active clarification in recovery checkpoints and allow the player
  to cancel it with “never mind” or “change of plan.”
- Add the reported Figure Someone Out exchange to unit and live evaluations.

## 2026-09-19 — Character and session lifecycle

- Clarify MC ownership of clues and mysteries, finish unresolved discoveries,
  and preserve player agency and completed object actions.
- Present character creation as Concept, Abilities, Connections, and Review;
  save repeatable drafts, resume unfinished choices, and gate play on readiness.
- Add in-thread creation, recap, correction, save, and end controls. Recover
  existing threads by stable ID after restart and preserve pending rolls.
- Confirm saves after successful persistence, keep failed closes open, and avoid
  reapplying successful writes during a live close retry.
- Extend offline lifecycle coverage and opt-in live narrator evaluations.
- Validation: 255 automated tests passed, world/content validation and graph
  build passed; 20/20 live narrator scenarios passed (17 on the first attempt,
  three with a bounded repair).


All notable changes to City of Shadows are recorded here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
This project uses date-stamped releases rather than strict [SemVer](https://semver.org/) —
the game world is the product, so "releases" mark meaningful changes to how the
platform behaves, not API compatibility.

## [Unreleased]

### Changed
- MC guidance now explicitly supports lasting losses and character death when
  decisions, rolls, and established danger warrant them. Consequences follow
  through without convenient rescues while preserving earned success, player
  agency, armor, Scar choices, end moves, and safety limits.
- Plain OOC markers no longer require a colon, and out-of-character comments
  no longer trigger character recaps by themselves. Continuity repair now saves
  player reports directly, pauses mechanics, and reloads reports after restart.
  Reconciled the player-confirmed gym fire, Ray rescue, heart-box removal, and
  envelope retrieval without inventing a present location or merging artifacts.
- NPC personality now separates warmth from verbosity and adds humor style/frequency,
  contextual contrasts, evidence notes, and optional flirtation/intimacy traits.
  All 51 NPCs retain their existing voices and histories with authored starting
  social profiles, including adult flirtation/intimacy and explicit inapplicable
  exceptions. Opening and hydration prompts use the traits; new NPC saves
  require complete profiles and existing edits preserve omitted fields with
  revision conflict protection.
- Bot, narrator evaluations, and City Keeper now default to DeepSeek-V4.1-Flash
  (`deepseek-flash`) with thinking explicitly disabled to preserve response
  budgets and temperature controls. `DEEPSEEK_MODEL` overrides the bot model;
  bot logs include the model returned by the API.
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
