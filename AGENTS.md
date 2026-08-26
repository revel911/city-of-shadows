# AI contributor guide

Start with the repository [knowledge map](docs/README.md), then load only the
documents routed for the task. Read [`docs/AI-CONTEXT.md`](docs/AI-CONTEXT.md) and
[`docs/DATA-MODEL.md`](docs/DATA-MODEL.md) before changing world persistence.

## Repository rules

- The configured GitHub branch is the durable database; the model itself is
  stateless between sessions.
- `game/npcs.json` is the only source for named NPC identity, personality, and
  voice. Do not duplicate named NPC facts in `mc-reference/` or hub prose.
- `game/locations.json` owns named places. Hub Markdown owns neighborhood lore.
- Reuse canonical IDs. Do not create a new entity when an exact ID or name match
  already exists.
- The repository and dashboard are public. Never add secret or MC-only facts to
  relationship JSON or `dashboard/data/world-graph.json`.
- Preserve player safety data and never surface it in public world files.
- `docs/superpowers/` is historical context, not the current contract.

## Required checks

```console
npm test
npm run build:graph
git diff --check
```

The Pages workflow runs world validation and rebuilds the graph before publishing.
