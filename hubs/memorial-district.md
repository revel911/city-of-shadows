# Hub: Memorial District

**Dominant Circle:** Night
**Last updated:** 2026-10-01

---

## Flavor

The west bluff above the James, where Richmond keeps its dead and argues about what they mean. Hollywood Cemetery's hills, the Virginia War Memorial's wall of names, the state offices and old mansions of Gambles Hill, and the iron-stained riverbank of Tredegar all press together here. Everyone in the district is tending a version of the past, and everyone is certain theirs is the one that counts.

Night holds the bluff because the dead are its natural constituency, and because elders have always preferred ground where nobody asks questions after dusk. Power moves through quietly in good coats, trading in whose name is on what. The living come here to grieve, to visit, to jog, and to be seen being respectful.

**Tone:** reverent, political, haunted by who gets remembered.

---

## The Overwrite Manifestation

**Overwrite Effect:** Memory edits itself: names, dates and monuments shift to match a version of the city that no one agreed on.

**Active Anomalies:**
- A grave in Hollywood shows a burial date for someone still alive
- The Virginia War Memorial's Shrine of Memory adds names that are in no record
- Hollywood has sections its groundskeeper does not remember being built
- At Tredegar Edge you can hear Oregon Hill's phantom ironworks shifts through the fence; that echo belongs to Oregon Hill (see `loc_tredegar_overlook`), and down here it is only overheard

---

## Hub Moves

### Read the Stones
When you study the stones, plaques and names at a Memorial District site to learn what really happened there, roll with Mind.
- **10+:** Ask 2 below, and take +1 forward when you act on an answer.
- **7-9:** Ask 1 below.
  - Which name or date here has been changed, and since when?
  - Who still visits this spot, and what do they want kept?
  - What did the Overwrite take out of this record?
- **Miss:** The record notices you. A name you read tonight is gone tomorrow, and someone saw you reading it.

### Speak for the Dead
When you stand at a grave or the wall and speak aloud for someone the city has forgotten, in front of a witness who matters, roll with Heart.
- **10+:** Choose 2 below.
- **7-9:** Choose 1.
  - Your witness owes you a Debt for what they heard.
  - The name holds: the Overwrite cannot edit it while you stay in Richmond.
  - Night on the bluff takes you for a mourner, not a stranger. Take +1 ongoing to Circle moves with Night here until time passes.
- **Miss:** Someone with a stake in forgetting that name hears you, and comes to ask why you said it.

---

## Residents

| ID | Circle | Resident |
|---|---|---|
| `npc_tomasz_wilk` | Wild | Tomasz Wilk, a werewolf who mows Hollywood's steep slopes and keeps the deer, and worse, off the oldest graves. |
| `npc_kelechi_nwosu` | Wild | Kelechi Nwosu, a tow-truck driver bound by a demon's contract to haul whatever it marks. |
| `npc_felix_marchbanks` | Power | Felix Marchbanks, an estate appraiser who returns the possessions of the dead to their families. |
| `npc_harriet_ames` | Power | Harriet Ames, a military genealogist and Consilium mage who checks every new name on the wall. |
| `npc_hester_byrd` | Night | Hester Byrd, vampire elder who claims the cemetery as neutral ground. |
| `npc_ruthie_calhoun` | Night | Ruthie Calhoun, a ghoul and night-shift crematory operator who keeps the ashes nobody claims. |
| `npc_loretta_banfield` | Mortalis | Loretta Banfield, a Gold Star mother who leads the War Memorial's volunteer guides. |
| `npc_gail_brannock` | Mortalis | Gail Brannock, a retired stonemason whose recut headstone letters change after she cuts them. |

A new character rooted here may choose one resident who owes them a Debt (see `mc-reference/character-creation.md` Phase 11).

Emmett Daye, the Hollywood groundskeeper (`npc_emmett_daye`), is an existing character and works this ground too.

---

## Locations

Named locations are maintained in [`game/locations.json`](../game/locations.json)
and rendered by the City dashboard. This file owns neighborhood lore, not duplicate
location records.

Hollywood Cemetery (`loc_hollywood_cemetery`) belongs to this hub. Its border with Oregon Hill (`loc_hollywood_cemetery_border`) stays in Oregon Hill, the same fence seen from the neighborhood side.

---

## Open Threads

- **The Living Grave** — Hollywood's impossible burial date, described under Shockoe Bottom's threads and still unresolved. Groundskeeper Emmett Daye is the closest witness. — *heat: smoldering*
- **The Wall Adds a Name** — Each morning the War Memorial shows a name no record holds, and the newest matches a man who is still alive. Loretta Banfield and Harriet Ames want to know who is writing them, and why. — *heat: smoldering*
- **The Recut Letters** — Gail Brannock's fresh headstone lettering now spells other names, and she has the photographs to prove it. Someone is editing the stones from the inside. — *heat: smoldering*

---

## Adaptation Notes

- Hollywood Cemetery holds presidents and Confederate dead. The supernatural here is about who gets remembered and who gets erased, never about glorifying the Confederacy. Do not turn the Lost Cause into a source of power, a sympathetic cause, or a hero's legend.
- Keep the legacy Hollywood anomalies already in `game/world-bible.md`, including the grave with an impossible burial date and Emmett Daye's unexplained new sections.
- Night and Power are most at home here, but Read the Stones rolls with Mind, so a patient reader with no connections can learn what the powerful would rather keep buried.
- Treat grief and honor seriously. The dead are not set dressing.
