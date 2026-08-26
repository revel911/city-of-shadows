# Maintenance script map

These scripts validate, derive, migrate, and evolve canonical repository state.
Run them from the repository root.

| Link | Title | Information within |
|---|---|---|
| [validate-world.mjs](validate-world.mjs) | World validator | Schema, ID, reference, visibility, clock, relationship, Debt, mystery, and cross-file integrity checks |
| [validate-content-map.mjs](validate-content-map.mjs) | Content-map validator | Completeness and link validation for every Markdown document under docs/ and mc-reference/ |
| [build-graph.mjs](build-graph.mjs) | Graph builder | Converts public canonical world records into dashboard/data/world-graph.json |
| [city-keeper.mjs](city-keeper.mjs) | City Keeper runner | Reconcile, bounded city-turn, and publish phases; model proposal limiting; patches; cooldowns; and audit state |
| [keeper-projection.mjs](keeper-projection.mjs) | Keeper projection | Allowlisted, public-safe model input assembled from canonical state |
| [migrate-narrative-engine.mjs](migrate-narrative-engine.mjs) | Narrative-engine migration | Idempotent arc agenda/impulse/clock and mystery-derived-state migration |
| [world-utils.mjs](world-utils.mjs) | Shared script utilities | Repository root resolution, JSON reading/writing, normalization, and common helpers |

Common commands:

| Command | Purpose |
|---|---|
| npm test | Run bot tests, world validation, and content-map validation |
| npm run validate | Validate world state and both documentation indexes |
| npm run validate:content | Validate documentation inventory and local links only |
| npm run build:graph | Rebuild the public dashboard graph |
| npm run keeper:reconcile | Reconcile established session evidence |
| npm run keeper:city-turn | Advance one eligible city pressure |
| npm run keeper:publish | Run deterministic publish/validation bookkeeping |

See the [Operator Guide](../docs/OPERATOR.md) for environment and scheduled
workflow details.
