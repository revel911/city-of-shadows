# World data model

## Contents

- [Authority](#authority)
- [Entity IDs](#entity-ids)
- [Files](#files)
- [References](#references)
- [Patch rules](#patch-rules)
- [Public data boundary](#public-data-boundary)
- [Validation and graph generation](#validation-and-graph-generation)

## Authority

The repository is the database. Structured JSON is canonical for entity identity
and relationships; Markdown carries prose, rules, and narrative handoffs.

There must be one authoritative definition for each fact. In particular:

- NPC identity, status, personality, and voice live in `game/npcs.json`.
- How one NPC specifically remembers and treats one player character lives in
  `game/npc-character-memory.json`; it never replaces the universal NPC record.
- Named places live in `game/locations.json`.
- Neighborhood lore lives in `hubs/*.md`; the indexed hub identity lives in
  `hubs/index.json`.
- Public relationship truth is the union of `relationships.manual.json` and
  `relationships.derived.json`.
- Public Debt amounts live only in `game/debts.json`; relationship labels may
  describe a social tie but are not a Debt ledger.
- Mystery questions, revelations, clue availability, derived stage, and progress live in `game/mysteries.json`.
- A character’s knowledge of a mystery is derived from clue `discovered_by` IDs; it is not duplicated into another public file.
- Arc pressure lives in `game/arcs.json`: escalation is canonical, while agenda, impulse, next pressure, and clock metadata make behavior explicit when present.
- Character mechanics live under `players/<character-id>/`.

Reference documents may describe schemas, but must not duplicate named NPC facts.

## Entity IDs

| Entity | Pattern | Example |
|---|---|---|
| Hub | `hub_<slug>` | `hub_shockoe_bottom` |
| Location | `loc_<slug>` | `loc_morrows_books` |
| NPC | `npc_<slug>` | `npc_celestine_morrow` |
| Relationship | `rel_<slug>` | `rel_celestine_morrows_books` |
| Arc | `arc-NNN` | `arc-012` |
| Debt | `debt_<slug>` | `debt_jacob_priest` |
| Mystery | `mystery_<slug>` | `mystery_missing_courier` |
| NPC–character memory | `memory_<npc-slug>__<character-slug>` | `memory_celestine_morrow__jacob_boone` |
| Player character | kebab-case | `jacob-boone` |

IDs are permanent. Rename display names without changing IDs. A close-block patch
must reuse the canonical ID shown in the opening world index.

## Files

| Path | Owner | Update mode |
|---|---|---|
| `game/npcs.json` | Bot/MC | Partial records merged by canonical ID; exact-name fallback prevents duplicates |
| `game/npc-character-memory.json` | Bot/MC; Keeper reconcile-only | One revisioned relationship-memory record per NPC/character pair |
| `game/locations.json` | Bot/MC | Partial records merged by canonical ID |
| `game/relationships.manual.json` | Human operator | Hand-curated; never changed by the MC |
| `game/relationships.derived.json` | Bot/MC or rebuild job | Incremental public discoveries |
| `game/arcs.json` | Bot/MC/Keeper | Revisioned pressure entities; deterministic City Keeper candidate and cooldown |
| `game/mysteries.json` | Bot/MC; Keeper reconcile-only | Revisioned revelation/clue maps with bot-derived stage and progress |
| `game/debts.json` | Bot/MC | Public Debt records merged by stable ID |
| `game/events-log.md` | Bot/MC | Public chronology, newest entry first |
| `game/interactions.json` | Bot/MC | ID-based add/update/consume operations |
| `game/world-meta.json` | Bot/Keeper | Monotonic shared-world revision and freshness |
| `game/hub-state.json` | Bot/MC/Keeper | Mutable neighborhood conditions and pressure |
| `game/conflicts.json` | Bot/Keeper | Public-safe same-day continuity conflicts |
| `game/keeper-state.json` | Keeper | Overnight run cursor, cooldowns, and audit history |
| `game/session-ledger/*.json` | Bot | Append-only public-safe world-impact evidence |
| `hubs/index.json` | Human operator | Canonical hub registry |
| `hubs/*.md` | Human operator | Neighborhood prose and MC-facing lore |
| `players/index.json` | Bot | Character registry |
| `players/<id>/handoff.md` | Bot/MC | Full replacement at session close |
| `players/<id>/state.json` | Bot/MC | Partial mechanical merge |
| `players/<id>/sheet.md` | Bot/MC | Full replacement when changed |
| `players/<id>/checkpoint.json` | Bot/MC | Public-safe interrupted-session recovery; retired on successful close |
| `players/<id>/sessions/session_NNN.json` | Bot | Append-only public-safe mechanical receipt |

## References

- Every `hub_id` must exist in `hubs/index.json`.
- Every location belongs to exactly one hub.
- NPC location IDs must exist in `game/locations.json`.
- Every NPC–character memory must resolve both its `npc_id` and `character_id`,
  and its deterministic ID must match that exact pair.
- Arc NPC, hub, and character IDs must resolve.
- Mystery arc, NPC, hub, character, revelation, clue, and clue-source IDs must resolve.
- Every required mystery revelation must have at least three linked clues.
- Derived character knowledge contains only clues discovered by that character; global discovery does not imply personal knowledge.
- Relationship `source` and `target` may point to a hub, location, NPC, arc, or PC,
  but both endpoints must exist.
- Debt `creditor_id` and `debtor_id` must resolve to an NPC or PC and must differ.

An NPC can distinguish:

- `home_location_id`: their stable base.
- `current_location_id`: where the shared world last placed them.
- `associated_location_ids`: other durable ties.

## Patch rules

`npc_patch`, `location_patch`, `relationship_patch`, `debt_patch`, `arc_patch`,
`mystery_patch`, `npc_memory_patch`, and `hub_patch` are arrays of partial records. Existing entities should use
`expected_revision` plus a nested `changes` object. Matching changes increment
the entity revision. A stale scalar change becomes a continuity conflict instead
of silently overwriting newer play; additive ID collections merge as sets.
Concurrent clue discoveries merge monotonically by clue ID (including each
discovering character); contradictory clue states remain reviewable conflicts. After a successful mystery merge, the bot derives mystery stage, clue totals, and supported revelations rather than trusting narrator bookkeeping.
NPC-memory promises, grievances, boundaries, beliefs, and key moments also merge
additively. Conflicting stale changes to disposition, trust, fear, respect, or
relationship state become reviewable conflicts rather than overwrites.

NPC-memory scores are deliberately small and bounded: disposition is -5 through
+5, while trust, fear, and respect are 0 through 5. Formal Debts remain exclusively
in `game/debts.json`. Historical romance never constitutes current consent.

`interaction_ops` is an operation list (`add`, `update`, or `consume`) and never
replaces the full queue. Every close declares `world_impact` as `none`, `personal`,
or `shared`. Shared impact requires a matching world mutation or public event.

At session close the bot, rather than the narrator, increments `last_session`,
validates mechanical ranges, derives `active_arc_ids`, reconciles arc pressure,
and writes the session receipt. See
[`../mc-reference/MECHANICS-CONTRACT.md`](../mc-reference/MECHANICS-CONTRACT.md).

Identity fields should not be casually rewritten. Status, current location,
relationships, notes, and voice evolution are ordinary session changes.

## Public data boundary

This repository and its GitHub Pages dashboard are public. Hiding an edge in CSS
does not make it secret: anyone can fetch the JSON.

Therefore relationship files accept only `visibility: "public"`. Secrets belong
in a private deployment or a future private store; they must not be serialized to
the public relationship graph.

The same warning applies to mystery files: this repository is not a secure GM
vault. Store only truths that may safely exist in the public repository. Character knowledge is filtered for narration but remains a presentation boundary, not access control. A future private store is required for genuinely player-hidden solutions or private per-character knowledge.

## Validation and graph generation

Run:

```console
npm run validate
npm run build:graph
```

Validation rejects duplicate IDs, dangling references, invalid personality
scores, and non-public graph relationships. The graph build writes the public,
browser-ready union to `dashboard/data/world-graph.json` with deterministic node
positions.
