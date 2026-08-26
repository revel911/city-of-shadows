# City of Shadows knowledge map

This is the canonical table of contents for humans, coding agents, and engine
maintenance. It describes what each document owns so a task can load the
smallest authoritative set instead of scanning the repository alphabetically.

> Links are navigation metadata, not automatic retrieval. The live MC can use
> only files explicitly loaded by bot/handlers/mc.js or supplied in session
> context. See the [MC reference index](../mc-reference/README.md) for that load
> policy.

## Route by task

| Task | Primary source | What information it contains | Follow with |
|---|---|---|---|
| Understand the product | [Vision](VISION.md) | Product promise, design pillars, intended experience, and non-goals | [Architecture](ARCHITECTURE.md) |
| Understand a live session | [Architecture](ARCHITECTURE.md) | Components, prompt assembly, session lifecycle, persistence, and deployment boundaries | [AI context](AI-CONTEXT.md) |
| Change narrative or move behavior | [Narrative, Rules, and World Engine](NARRATIVE-RULES-WORLD-ENGINE.md) | Fiction-to-mechanics loop, investigation, consequences, mysteries, knowledge, pressure, and scenes | [MC reference index](../mc-reference/README.md) |
| Change move execution | [Mechanics Execution Contract](../mc-reference/MECHANICS-CONTRACT.md) | Bot-versus-model authority, rolls, advanced results, Debts, automatic bookkeeping, and mechanics depth | [Basic Moves](../mc-reference/reference/basic-moves.md) |
| Change persisted world data | [World data model](DATA-MODEL.md) | Canonical ownership, IDs, references, patch rules, concurrency, and public-data boundaries | [Game state index](../game/README.md) |
| Review model context | [AI context and review guide](AI-CONTEXT.md) | What the model receives, retrieval order, restart boundaries, and review checklist | [MC reference index](../mc-reference/README.md) |
| Operate or deploy | [Operator Guide](OPERATOR.md) | Environment, Discord setup, hosting, workflows, commands, and troubleshooting | [Architecture](ARCHITECTURE.md) |
| Review current work | [Changelog](../CHANGELOG.md) | Shipped changes in chronological order | [Roadmap](../ROADMAP.md) |

## Current documentation

| Link | Title | Information within | Authority |
|---|---|---|---|
| [README.md](README.md) | Knowledge map | Repository routing, document inventory, folder ownership, and historical-document index | Canonical navigation |
| [VISION.md](VISION.md) | City of Shadows — Vision | Product pitch, design pillars, setting promise, player experience, and non-goals | Product intent |
| [ARCHITECTURE.md](ARCHITECTURE.md) | City of Shadows — Architecture | Runtime components, session loop, prompt construction, GitHub persistence, concurrency, and deployment | Current runtime design |
| [DATA-MODEL.md](DATA-MODEL.md) | World data model | Entity ownership, schemas, IDs, references, patches, conflicts, validation, and public-data policy | Persistence contract |
| [AI-CONTEXT.md](AI-CONTEXT.md) | AI context and review guide | Online truth, model memory, context routing, review order, and consistency checklist | Agent navigation |
| [NARRATIVE-RULES-WORLD-ENGINE.md](NARRATIVE-RULES-WORLD-ENGINE.md) | Narrative, Rules, and World Engine | Implemented narrative loop, semantic move routing, fail-forward investigation, structured knowledge, mysteries, pressure, and scene derivation | Narrative-engine design |
| [OPERATOR.md](OPERATOR.md) | City of Shadows — Operator Guide | Installation, configuration, Discord/Fly/GitHub operation, commands, workflows, and recovery | Operations contract |

## Root-level guides

| Link | Title | Information within |
|---|---|---|
| [README.md](../README.md) | City of Shadows | Player-facing product overview, Discord commands, shared-world explanation, hosting entry point, and documentation links |
| [AGENTS.md](../AGENTS.md) | AI contributor guide | Repository authority, canonical entity ownership, public-data safety, historical-doc status, and required checks |
| [CHANGELOG.md](../CHANGELOG.md) | Changelog | Date-stamped shipped and unreleased behavior changes |
| [ROADMAP.md](../ROADMAP.md) | Roadmap | Planned platform and game-world improvements, priorities, and future direction |

## Repository folders

| Link | Area | Information within | Start here |
|---|---|---|---|
| [Repository root](../) | Product entry point | Player-facing overview, commands, setup pointers, changelog, and roadmap | [Root README](../README.md) |
| [docs/](./) | Engineering and operating documentation | Current design contracts, navigation, and dated historical records | [This knowledge map](README.md) |
| [mc-reference/](../mc-reference/) | Live MC instruction library | Mechanics, narration, scenes, schemas, output format, playbooks, and World of Darkness extensions | [MC reference index](../mc-reference/README.md) |
| [bot/](../bot/) | Discord and model runtime | Commands, session orchestration, prompt assembly, deterministic mechanics, routing, tests, and evals | [Bot runtime map](../bot/README.md) |
| [game/](../game/) | Shared city state | NPCs, locations, arcs, mysteries, Debts, relationships, events, interactions, conflicts, and Keeper state | [Game state index](../game/README.md) |
| [hubs/](../hubs/) | Neighborhood lore | Hub registry and prose for Richmond neighborhoods; named locations remain in game/locations.json | [Hub index](../hubs/README.md) |
| [players/](../players/) | Player and character persistence | Player profiles, ownership, character sheets, state, checkpoints, and handoffs | [Player and character state](../players/README.md) |
| [dashboard/](../dashboard/) | Public read-only world view | Browser UI, styles, generated graph data, and public-data constraints | [Dashboard map](../dashboard/README.md) |
| [scripts/](../scripts/) | Maintenance automation | Validation, graph generation, Keeper phases, projection, migration, and shared utilities | [Script map](../scripts/README.md) |
| [.github/workflows/](../.github/workflows/) | Hosted automation | Pages validation/build/deploy and scheduled City Keeper runs | [Pages workflow](../.github/workflows/pages.yml) |

## Historical design records

These files explain earlier decisions and implementation sequences. They are
not current contracts. When they conflict with current documentation, running
code, tests, and the current documents above win.

### Specifications

| Link | Title | Information within |
|---|---|---|
| [Bot read commands design](superpowers/specs/2026-05-14-bot-read-commands-design.md) | Bot read commands | Original problem, scope, and design for /sheet, /state, /events, /npc, /hub, and /arcs |
| [MC reference rework design](superpowers/specs/2026-05-14-mc-reference-rework-design.md) | MC Reference & Character Creation Rework | Rationale and design for normalized references, selective loading, and guided creation |
| [Play character selection design](superpowers/specs/2026-05-14-play-character-selection-design.md) | Experience-first /play character selection | Original character-picker and ownership-free selection design |
| [Player entity design](superpowers/specs/2026-05-15-player-entity-design.md) | Player Entity: Safety + Mechanics Depth | Discord-scoped profile, safety, mechanics-depth, and character-ownership design |
| [Structured-block safety design](superpowers/specs/2026-05-16-strip-structured-blocks-from-discord-design.md) | Strip Structured Blocks From Discord | Failure analysis and defensive design for preventing machine payload leaks |

### Implementation plans

| Link | Title | Information within |
|---|---|---|
| [Bot read commands plan](superpowers/plans/2026-05-14-bot-read-commands.md) | Bot Read Commands Implementation Plan | Original task sequence, files, tests, and verification for read-only commands |
| [MC reference rework plan](superpowers/plans/2026-05-14-mc-reference-rework.md) | MC Reference & Character Creation Rework Plan | Original conversion, routing, onboarding, and verification tasks |
| [Player entity plan](superpowers/plans/2026-05-15-player-entity.md) | Player Entity Implementation Plan | Original migration and implementation steps for player-scoped profiles |
| [Structured-block safety plan](superpowers/plans/2026-05-16-strip-structured-blocks-from-discord.md) | Strip Structured Blocks From Discord Plan | Original sanitizer, recovery, contract, and regression-test steps |

## Retrieval and maintenance rules

1. Load the primary source for the task, then follow only the links needed to
   resolve authority or schema questions.
2. Do not load docs/superpowers/ for current behavior unless investigating
   history or intent behind an old implementation.
3. Do not infer named NPC or location truth from documentation. Use canonical
   records under game/.
4. A new Markdown file under docs/ must be listed here. A new Markdown file
   under mc-reference/ must be listed in its local index.
5. Run npm run validate:content after changing either documentation tree.
