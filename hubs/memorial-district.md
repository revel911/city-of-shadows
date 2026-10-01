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
- The shift bell at the old Tredegar works rings when no one is there to ring it

---

## Hub Moves

### Remember Their Names
When you consult Night or Power contacts about the city's buried history, roll with Mind instead of your Status.
- **10+:** Ask 3 below, and you may trade one unasked question for a favor from a Status-3 NPC (they name the price).
- **7-9:** Ask 1 below.
  - Who was really buried here, and who was erased?
  - Whose name does someone powerful want forgotten?
  - What did the city promise the dead, and break?
- **Miss:** Your questions wake something that expected to be left alone.

### For the City
When you refuse to honor a Debt because the city's need outweighs it, and you say why out loud, roll with Heart.
- **10+:** Erase the Debt completely by crossing out one advance you have taken (not change playbook or retire). The creditor accepts it, grudgingly.
- **7-9:** As 10+, but the creditor tells others what you did.
- **Miss:** Refuse a Debt as usual, and the creditor's whole Circle hears that you hide behind the city.

---

## Residents

| ID | Circle | Resident |
|---|---|---|
| `npc_samira_aziz` | Wild | Samira Aziz, a jinn who keeps Hollywood's lost-and-found of things left on graves. |
| `npc_knuckles_okoro` | Wild | "Knuckles" Okoro, muscle for a demon-backed crew on the Belvidere corridor. |
| `npc_abernathy_vale` | Power | Abernathy Vale, antiquarian whose Belvidere curio shop sells memorial relics. |
| `npc_the_pallbearer` | Power | The Pallbearer, a spectre bound to the War Memorial's wall of names. |
| `npc_hester_byrd` | Night | Hester Byrd, vampire elder who claims the cemetery as neutral ground. |
| `npc_ruthie_calhoun` | Night | Ruthie Calhoun, a ghoul who restores headstones and paints portraits of the dead. |
| `npc_amos_freeman` | Mortalis | Amos Freeman, a man who came back from a death the city marked as a martyrdom. |
| `npc_gail_brannock` | Mortalis | Gail Brannock, ex-bodyguard, now on the cemetery night security shift. |

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
- **The Wall Adds a Name** — Each morning the War Memorial shows a name no record holds. The Pallbearer wants to know who is writing them. — *heat: smoldering*
- **The Deed Buyer** — Someone is quietly buying old cemetery deeds, and a Night elder is watching who. — *heat: smoldering*

---

## Adaptation Notes

- Hollywood Cemetery holds presidents and Confederate dead. The supernatural here is about who gets remembered and who gets erased, never about glorifying the Confederacy. Do not turn the Lost Cause into a source of power, a sympathetic cause, or a hero's legend.
- Keep the legacy Hollywood anomalies already in `game/world-bible.md`, including the grave with an impossible burial date and Emmett Daye's unexplained new sections.
- Night and Power are most at home here. Remember Their Names rolls with Mind, not Status, so a quiet researcher can out-read a well-connected one.
- Treat grief and honor seriously. The dead are not set dressing.
