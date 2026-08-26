# Game state index

Machine-readable shared-world state lives here. See the
[World data model](../docs/DATA-MODEL.md) for schemas, ownership, references,
patch rules, and public-data boundaries.

| Link | Title | Information within |
|---|---|---|
| [npcs.json](npcs.json) | Canonical NPCs | Named NPC identity, aliases, voice, personality axes, status, roles, faction and location ties |
| [npc-character-memory.json](npc-character-memory.json) | NPC–character memory | Pair-specific trust, fear, respect, attitudes, promises, grievances, boundaries, beliefs, and callbacks |
| [locations.json](locations.json) | Canonical locations | Named place identity, hub membership, type, atmosphere, controllers, and status |
| [relationships.manual.json](relationships.manual.json) | Manual relationships | Human-curated public relationships between canonical entities |
| [relationships.derived.json](relationships.derived.json) | Derived relationships | Public entity relationships established through play and reconciled at close |
| [arcs.json](arcs.json) | Arcs and threats | Active/resolved story pressures, connected entities, agenda, impulse, next pressure, escalation, and clocks |
| [mysteries.json](mysteries.json) | Mysteries | Questions, clues, revelations, themes, motifs, character discovery, derived progress, and pressure |
| [debts.json](debts.json) | Debt ledger | Canonical public creditor, debtor, amount, status, source, and note records |
| [events-log.md](events-log.md) | Public event chronology | Newest-first shared events visible to players and future sessions |
| [interactions.json](interactions.json) | Cross-character interactions | Pending asynchronous PC-to-PC effects, targets, expiry, and consumption state |
| [world-meta.json](world-meta.json) | World metadata | Shared revision, player update, Keeper run, commit, and maintenance freshness |
| [hub-state.json](hub-state.json) | Mutable hub state | Neighborhood conditions, rumors, pressure, status, and clocks |
| [conflicts.json](conflicts.json) | Continuity conflicts | Stale or contradictory patch evidence awaiting safe review or resolution |
| [keeper-state.json](keeper-state.json) | Keeper state | Automation cursor, city-turn date, arc cooldowns, and bounded run audit |
| [session-ledger/README.md](session-ledger/README.md) | Session ledger | Public-safe evidence envelopes and mechanical receipts from completed sessions |
| [city-pulse.md](city-pulse.md) | City pulse | Latest bounded overnight city-turn summary |
| [world-bible.md](world-bible.md) | World bible | Setting-wide premise, factions, metaphysics, tone, and shared city truth |

## Ownership rules

- game/npcs.json is the only source for named NPC identity, personality, and voice.
- game/locations.json is the only source for named place identity; hub Markdown
  owns neighborhood-scale lore.
- arcs.json escalation and clock.current describe the same four-segment pressure.
- Mystery knowledge is derived from clues and revelations discovered by a
  character; the public repository is a presentation boundary, not secrecy.
- Relationship files and generated dashboard data must remain public-safe.

Run npm run validate after editing structured data and npm run build:graph after
changes that affect the public graph.
