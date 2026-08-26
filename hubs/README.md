# Hub index

[index.json](index.json) is the canonical registry of Richmond neighborhood hubs.
Each Markdown file owns neighborhood-scale prose, tone, moves, factions, and open
threads. Named places themselves are canonical in
[game/locations.json](../game/locations.json).

| Link | Title | Information within |
|---|---|---|
| [shockoe-bottom.md](shockoe-bottom.md) | Shockoe Bottom | Historically saturated Mortalis district, the strongest Overwrite manifestations, hub moves, factions, locations, threads, and rumors |
| [the-fan.md](the-fan.md) | The Fan / Museum District | Wild-dominant Victorian and arts district where the Hedge, historical trauma, institutions, and gentrification meet |
| [downtown.md](downtown.md) | Downtown / Canal Walk | Night-dominant financial and tourist district, vampire domains, canal tunnels, institutions, factions, and pressures |
| [university.md](university.md) | The University | Power-dominant VCU/MCV campuses, magical scholarship, the Consilium, hospitals, research, and old-money influence |
| [creighton-court.md](creighton-court.md) | Creighton Court / East End | Mortalis-dominant public-housing community, redevelopment, displacement, institutions, community bonds, and pressure |
| [oregon-hill.md](oregon-hill.md) | Oregon Hill | Mortalis working-class neighborhood, industrial history, community continuity, student/artist change, and gentrification |
| [church-hill.md](church-hill.md) | Church Hill | Night-dominant ridge of old brick, territorial memory, Dara Shin’s pack, locations, and open threads |
| [carytown.md](carytown.md) | Carytown | Mortalis commercial/residential district focused on public routines, familiar vulnerability, locations, and open threads |

## Adding a hub

1. Add a permanent hub_<slug> record to [index.json](index.json).
2. Add its Markdown lore file and catalog row above.
3. Add named places to [game/locations.json](../game/locations.json) with that hub ID.
4. Run npm run validate and npm run build:graph.
