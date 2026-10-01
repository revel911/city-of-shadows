# Hub — Creighton Court / East End

**Hub Type:** Mortalis (Dominant)

**Setting:** Richmond's East End is home to four of the city's six major public housing communities within a single square mile. Creighton Court, built in 1952, sits on the border with Henrico County near Interstate 64 and Nine Mile Road. The community is currently undergoing "Renaissance" — a controversial redevelopment that has displaced families while promising mixed-income housing. The East End carries the weight of generational poverty, but also fierce community bonds forged by shared struggle.

---

## The Overwrite Manifestation

**Overwrite Effect:** Temporal displacement — different eras of the East End coexist simultaneously, creating geographic time loops.

**Active Anomalies:**
- Residents sometimes encounter neighbors who moved away years ago, still living in demolished buildings
- Construction sites reveal foundations of homes that were never officially built
- RRHA records show families receiving services from programs that don't exist yet
- Children play in playgrounds that were removed decades ago but still appear functional
- Bus routes sometimes stop at addresses that aren't on current maps
- Demolished buildings cast shadows that don't match any current structures

---

## Primary Faction

**Mortalis:** Dominant through necessity and community organization. Residents have learned to navigate both mundane bureaucracy and supernatural anomalies with equal resilience. Strong informal networks keep the community functioning when official systems fail.

**Faction Status:**
- Mortalis: **3** (dominant through community solidarity)
- Power: **1** (RRHA, city planners, some social workers)
- Wild: **1** (street art, grassroots activism, community gardens)
- Night: **0** (actively avoided, bad history with gentrification)

---

## Locations

Named locations are maintained in [`game/locations.json`](../game/locations.json)
and rendered by the City dashboard. This file owns neighborhood lore, not duplicate
location records.

---

## Hub Moves

### Community Network
**Trigger:** When you need help navigating bureaucracy, finding resources, or solving a practical problem.
**Roll:** Heart
- **10+:** The community has your back. Choose 2: you get exactly what you need | someone vouches for you with authority | you discover an alternative solution | you build lasting relationships
- **7-9:** You get help, but choose 1 from above and the MC adds a complication.
- **Miss:** You're on your own, and word spreads that you couldn't handle your business.

### Generational Memory
**Trigger:** When you seek knowledge about the community's history or the Overwrite's effects on the East End.
**Roll:** Spirit
- **10+:** The old heads remember everything. Choose 2: you learn exactly what you need to know | you gain insight into how the Overwrite works here | an elder becomes your ally | you see through a current temporal anomaly
- **7-9:** You learn something useful but choose 1 from above.
- **Miss:** The memories are painful, and sharing them opens old wounds or creates new problems.

### Call the Patrol
When you phone the Creighton tenant patrol and need them on the block now, roll with Mortalis.
- **10+:** They turn out in force. Choose 1 complication below.
- **7-9:** They turn out. Choose 2 complications below.
  - Somebody on the patrol turns the volume up and makes it bigger than it was.
  - They came ready for a different kind of trouble than the one in front of them.
  - Before they step in, they want you to take the first risk yourself.
- **Miss:** The patrol hangs back at the corner and keeps its eyes on you instead.

### The Lot Has Everything
When you work the weekend night market in the Nine Mile Road lot for something rare or uncanny, roll with Mind.
- **10+:** A vendor has something close to it and wants a fair trade, and they have badly underpriced it. Take it cheap.
- **7-9:** A vendor has something close to it, for a trade of equal value.
- **Miss:** A local crew notices what you are hunting for and steps in to ask why.

---

## Residents

| ID | Circle | Resident |
|---|---|---|
| `npc_lorenzo_pugh` | Mortalis | Deacon Lorenzo Pugh runs the tenant patrol. |
| `npc_marisol_echevarria` | Mortalis | Marisol Echevarría, tenant-council secretary, a changeling raised mortal who doesn't fully know it. |
| `npc_scrapheap` | Wild | Scrapheap, spirit of the Nine Mile Road scrap lot, hoards what people throw away. |
| `npc_miss_odessa` | Wild | Miss Odessa, a retired cafeteria manager whose rooftop hives hum in whichever year the bees remember. |
| `npc_bettina_sorrells` | Power | Bettina Sorrells, redevelopment liaison, secretly retained by the Consilium. |
| `npc_tobias_mensah` | Power | Tobias Mensah, night-bus operator whose route still stops at addresses on no current map. |
| `npc_little_andre` | Night | Little Andre, a ghost only children and the very old can see. |
| `npc_midnight_truck` | Night | The Midnight Truck, an urban legend: an ice-cream truck that runs after 2am. |

A new character rooted here may choose one resident who owes them a Debt (see `mc-reference/character-creation.md` Phase 11).

---

## Adaptation Notes

The Block layer stresses that the community holds its own ground, and every Circle is nibbling at the edges. No one here is neutral. Residents are people with plans, not victims or props.

---

## Threats & Complications

- **Redevelopment Displacement:** RRHA's plans force families into cycles of temporary housing while promising eventual return to "better" communities. The Overwrite makes some families disappear into past timelines during moves.
- **Temporal Confusion:** Children sometimes attend schools that were demolished, or receive mail from family members who moved away decades ago. Keeping track of what's "real" becomes a survival skill.
- **Resource Scarcity:** Food pantries serve meals to families from multiple time periods simultaneously, straining already limited resources. Some assistance programs exist only in certain temporal layers.
- **Authority Scrutiny:** RRHA caseworkers, police, and city officials don't understand why residents sometimes reference services, people, or places that "don't exist." This leads to investigations and increased surveillance.

---

## Fragments & Beats

- Mama Dee holds community meetings where some attendees are families who were displaced months ago but somehow still live in demolished buildings. She treats this as normal.
- Sister Catherine's food pantry serves three times as many families as official counts suggest, because she feeds people from multiple timeline layers of the community.
- J-Rock's murals sometimes appear overnight depicting community events from decades past, painted in contemporary styles with residents who look exactly like current families.
- Children walk to schools that were torn down years ago, and attend classes taught by teachers who officially transferred to other districts. Their report cards arrive at current addresses with grades from programs that "ended" in 2019.
- The corner store on 29th Street sometimes stocks products that weren't available locally until recently, but has receipts showing sales from the 1990s.
- Bus stops serve routes that connect present-day Richmond to earlier versions of the East End, allowing residents to commute between temporal layers of their own neighborhood.
- Construction equipment working on Renaissance Phase B sometimes unearths personal belongings of families who haven't lived there yet, but will in the redeveloped timeline.
- Oakland Cemetery holds funerals for residents who are still alive, while families visit graves of relatives who are currently living in the community.

---

## Key NPCs

- **Sister Catherine Burke** — Mortalis, East End Family Resource Center. Hub anchor. Has been quietly managing temporal anomalies as a pastoral matter for years without naming what they are. *(See arc-013)*
