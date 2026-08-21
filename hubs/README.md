# Hub index

`index.json` is the canonical registry of Richmond neighborhood hubs. Each listed
Markdown file contains that neighborhood's prose, tone, moves, factions, and open
threads. Named places themselves are canonical in `game/locations.json`.

When adding a hub:

1. Add a permanent `hub_<slug>` record to `index.json`.
2. Add its Markdown lore file.
3. Add named places to `game/locations.json` with that `hub_id`.
4. Run `npm run validate` and `npm run build:graph`.
