# Game state index

Machine-readable shared-world state lives here. See
[`docs/DATA-MODEL.md`](../docs/DATA-MODEL.md) for schemas and reference rules.

| File | Purpose |
|---|---|
| `npcs.json` | Canonical NPC identity, voice, status, and location ties |
| `locations.json` | Canonical named places grouped by hub |
| `relationships.manual.json` | Human-curated public relationship truth |
| `relationships.derived.json` | Public relationships discovered in play |
| `arcs.json` | Threats and story arcs |
| `events-log.md` | Append-only public chronology |
| `interactions.json` | Pending asynchronous PC-to-PC effects |
| `world-bible.md` | Setting-wide prose and faction truth |

Run `npm run validate` after editing structured data. Do not store secrets in
relationship JSON; this repository is public.
