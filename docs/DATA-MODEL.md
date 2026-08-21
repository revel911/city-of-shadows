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
- Named places live in `game/locations.json`.
- Neighborhood lore lives in `hubs/*.md`; the indexed hub identity lives in
  `hubs/index.json`.
- Public relationship truth is the union of `relationships.manual.json` and
  `relationships.derived.json`.
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
| Player character | kebab-case | `jacob-boone` |

IDs are permanent. Rename display names without changing IDs. A close-block patch
must reuse the canonical ID shown in the opening world index.

## Files

| Path | Owner | Update mode |
|---|---|---|
| `game/npcs.json` | Bot/MC | Partial records merged by canonical ID; exact-name fallback prevents duplicates |
| `game/locations.json` | Bot/MC | Partial records merged by canonical ID |
| `game/relationships.manual.json` | Human operator | Hand-curated; never changed by the MC |
| `game/relationships.derived.json` | Bot/MC or rebuild job | Incremental public discoveries |
| `game/arcs.json` | Bot/MC | Partial records merged by ID |
| `game/events-log.md` | Bot/MC | Append-only public chronology |
| `game/interactions.json` | Bot/MC | Full queue replacement |
| `hubs/index.json` | Human operator | Canonical hub registry |
| `hubs/*.md` | Human operator | Neighborhood prose and MC-facing lore |
| `players/index.json` | Bot | Character registry |
| `players/<id>/handoff.md` | Bot/MC | Full replacement at session close |
| `players/<id>/state.json` | Bot/MC | Partial mechanical merge |
| `players/<id>/sheet.md` | Bot/MC | Full replacement when changed |

## References

- Every `hub_id` must exist in `hubs/index.json`.
- Every location belongs to exactly one hub.
- NPC location IDs must exist in `game/locations.json`.
- Arc NPC, hub, and character IDs must resolve.
- Relationship `source` and `target` may point to a hub, location, NPC, arc, or PC,
  but both endpoints must exist.

An NPC can distinguish:

- `home_location_id`: their stable base.
- `current_location_id`: where the shared world last placed them.
- `associated_location_ids`: other durable ties.

## Patch rules

`npc_patch`, `location_patch`, and `relationship_patch` are arrays of partial
records. Shared-file writes use read-modify-write with conflict retries. The bot
adds `last_updated` and `updated_by_session` to patched records.

Identity fields should not be casually rewritten. Status, current location,
relationships, notes, and voice evolution are ordinary session changes.

## Public data boundary

This repository and its GitHub Pages dashboard are public. Hiding an edge in CSS
does not make it secret: anyone can fetch the JSON.

Therefore relationship files accept only `visibility: "public"`. Secrets belong
in a private deployment or a future private store; they must not be serialized to
the public relationship graph.

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
