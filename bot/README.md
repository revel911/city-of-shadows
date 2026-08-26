# Bot runtime map

The Discord bot is the retrieval, rules-execution, and persistence boundary
between players, the model, and the GitHub-backed world. Start with
[session.js](handlers/session.js) for the end-to-end flow and
[mc.js](handlers/mc.js) for prompt construction.

## Entry points and directories

| Link | Title | Information within |
|---|---|---|
| [index.js](index.js) | Discord runtime entry point | Client creation, command discovery, interaction routing, login, and top-level error handling |
| [deploy-commands.js](deploy-commands.js) | Command deployment | Discord application-command discovery and registration |
| [package.json](package.json) | Bot package | Runtime dependencies, Node version, test command, and opt-in evaluations |
| [commands/](commands/) | Slash commands | Thin Discord adapters for play, roll, preferences, sheets, state, events, NPCs, hubs, and arcs |
| [handlers/](handlers/) | Runtime services | Session orchestration, model access, rules, persistence, context retrieval, rendering, and safety |
| [test/](test/) | Regression tests | Node test coverage for mechanics, routing, persistence, prompts, safety, and formatting |
| [eval/](eval/) | Model evaluations | Opt-in narrator and move-adjudicator scenarios that require the configured model API |

## Core handlers

| Link | Title | Information within |
|---|---|---|
| [session.js](handlers/session.js) | Session orchestrator | Session start/turn/roll/close lifecycle, locks, checkpoints, parsing, reconciliation, persistence, and Discord posting |
| [mc.js](handlers/mc.js) | Model and prompt layer | Stable reference loading, selective playbook/extension retrieval, opening context, compaction, generation, and move adjudication calls |
| [mechanics.js](handlers/mechanics.js) | Deterministic mechanics | Fast trigger gate, roll requests, modifiers, result records, state reconciliation, Debts, arcs, and session audit |
| [move-adjudicator.js](handlers/move-adjudicator.js) | Semantic move router | Structured triggers, non-triggers, requirements, active character moves, adjudication prompt, and validated decisions |
| [narrative-state.js](handlers/narrative-state.js) | Narrative-state rules | Move-resolution contracts, investigation depth, mysteries, character knowledge, scene pressure, arc pressure, and City Keeper selection |
| [world-state.js](handlers/world-state.js) | World retrieval and merging | Canonical/relevant context, entity compaction, relevance routing, patches, conflicts, interactions, and NPC memory |
| [scene-director.js](handlers/scene-director.js) | Scene director | Hidden scene-mode selection, variation, player-agency safeguards, and broad non-sensitive playstyle signals |
| [character-sheet.js](handlers/character-sheet.js) | Sheet contract | Canonical section order, validation, and live-state rendering |
| [profile.js](handlers/profile.js) | Player profiles | Discord-scoped profile paths, reads/writes, mechanics depth, safety, and ownership |
| [github.js](handlers/github.js) | GitHub persistence | Contents API reads, optimistic writes, retries, and commit boundaries |
| [read-utils.js](handlers/read-utils.js) | Read-command utilities | Character resolution, event parsing, chunking, and world entity formatting |

## Slash commands

| Link | Command | Information within |
|---|---|---|
| [play.js](commands/play.js) | /play | Character selection, ownership checks, private thread creation, and session start |
| [roll.js](commands/roll.js) | /roll | Resolution of the one pending canonical move |
| [prefs.js](commands/prefs.js) | /prefs | Player-scoped mechanics and safety preference surfaces |
| [sheet.js](commands/sheet.js) | /sheet | Character resolution and rendered sheet output |
| [state.js](commands/state.js) | /state | Character mechanical-state output |
| [events.js](commands/events.js) | /events | Recent public-event rendering |
| [npc.js](commands/npc.js) | /npc | Canonical NPC lookup and formatting |
| [hub.js](commands/hub.js) | /hub | Neighborhood hub lookup and rendering |
| [arcs.js](commands/arcs.js) | /arcs | Arc filtering and formatting |

For documentation authority and repository-wide routing, use the
[knowledge map](../docs/README.md). For model-visible rules, use the
[MC reference index](../mc-reference/README.md).
