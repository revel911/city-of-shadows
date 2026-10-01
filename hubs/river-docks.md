# Hub: River & Docks

**Dominant Circle:** Wild
**Last updated:** 2026-10-01

---

## Flavor

The James is a working river here, and a thin place. On the south bank the Richmond Marine Terminal, the Commerce Road rail and warehouse corridor, the Manchester floodwall and docks, and the south end of the Mayo Bridge move cargo by day and secrets by night. Across the water the old port of Rocketts Landing keeps the memory of the city's first ships, and in the middle of the current Belle Isle sits where the river likes to keep things it has not decided about.

Wild holds the water because the river is older than any ledger. Mortalis crews do the work, Power forges the paperwork that lets strange goods through, and Night buys what it needs off the barges and asks nobody's name. Everything here is for sale if you know whom to ask and what you will owe.

Canal Walk and Brown's Island belong to Downtown; this hub starts where the working water begins.

**Tone:** liminal, transactional, tidal.

---

## The Overwrite Manifestation

**Overwrite Effect:** An older port writes itself over the new one. The burned colonial town of Warwick (torched in 1781) lies under the terminal, and on certain tides its streets can be walked.

**Active Anomalies:**
- On certain tides the pilings under the terminal open onto walkable colonial streets
- Belle Isle's lights appear where no structures stand, and time is lost after dark
- A bell with no tower rings the hours under the water on the tides when Warwick surfaces
- Manifests from decades past turn up stamped and cleared in the present

**MC anchor rule:** reuse the same warehouse, barge and crew. Do not invent a new warehouse every visit; the river rewards repetition and recurring faces.

---

## Hub Moves

### Next Tide Out
When you ask the river crews to carry something or someone quietly into or out of Richmond on the next tide, roll with Heart.
- **10+:** It goes, and choose 1 below.
- **7-9:** It goes, and choose 1, but the crew boss names a cost first: a shift of your own labor, a Debt, or a favor for whoever stamps their paperwork.
  - A crew member rides with it and will vouch for you at the far end.
  - It comes back with word of who else is moving things on the river this week.
  - It travels on a tide of this year, not one of Warwick's.
- **Miss:** It goes out on a Warwick tide. It arrives, just not when you meant it to, and the MC says who has been holding it in the meantime.

### Fall Line
When you Escape a Situation by trusting yourself to the James (off the floodwall, across the rocks below the Mayo Bridge, into the current past Belle Isle), roll with Spirit instead of Blood and resolve the escape as usual. Then the river decides where you come ashore:
- **10+:** You choose the bank and the landing.
- **7-9:** The Lady of the Falls chooses, and you owe the river one small promise, which the MC will name.
- **Miss:** You come ashore somewhere the river likes, and it keeps one thing you were carrying.

---

## Residents

| ID | Circle | Resident |
|---|---|---|
| `npc_cole_ridley` | Mortalis | Cole Ridley, a longshoreman and union steward organizing the terminal crews. |
| `npc_dee_ashby` | Mortalis | Captain Dee Ashby, a tug captain who runs the river's unofficial rescue and recovery. |
| `npc_lady_of_the_falls` | Wild | The Lady of the Falls, a river fae of the fall line who holds the city to its old promises. |
| `npc_hollis_grey` | Wild | Hollis Grey, a fae-touched flood surveyor whose nightly maps keep finding Warwick's streets under the terminal. |
| `npc_odalys_ferreira` | Power | Odalys Ferreira, a licensed customs broker who also stamps arcane provenance. |
| `npc_theodora_lusk` | Power | Theodora Lusk, the terminal's night harbor dispatcher, who will not berth a crew on a Warwick tide. |
| `npc_benedict_shaw` | Night | Benedict Shaw, a vampire bookkeeper who pays out the dock crews' Night money. |
| `npc_warwick_bellman` | Night | The Warwick Bellman, town crier of burned Warwick, still ringing the drowned town's last market day. |

A new character rooted here may choose one resident who owes them a Debt (see `mc-reference/character-creation.md` Phase 11).

The Shepherd, a wolf who patrols the river corridor (see `game/world-bible.md`), has no character record. Use him in prose as a presence at Belle Isle, never as a contact.

---

## Locations

Named locations are maintained in [`game/locations.json`](../game/locations.json)
and rendered by the City dashboard. This file owns neighborhood lore, not duplicate
location records.

Richmond Marine Terminal, Rocketts Landing, Belle Isle, the Manchester Floodwall, Mayo Bridge (south end), the Commerce Road Yards, and Warwick Beneath belong to this hub.

---

## Open Threads

- **The Warwick Tides** — Theodora Lusk refuses to berth crews on certain tides, and someone keeps asking her to. Hollis Grey's maps show which streets will be dry when the Bellman rings. — *heat: smoldering*
- **Given Back Early** — Dee Ashby's logbook lists a man the river gave back who has not gone into the water yet. She is watching the floodwall for him. — *heat: smoldering*
- **The 1940s Envelopes** — The night crews' cash comes in envelopes from a bank that closed generations ago. Cole Ridley is photographing every one, and Benedict Shaw is deciding whether to hand over his books. — *heat: smoldering*

---

## Adaptation Notes

- Do not name the residential Southside neighborhoods near the terminal (Blackwell, Hillside Court and others) as places where trouble lives. This district is industrial and river land.
- The Manchester Docks start of the Slave Trail is history to be honored, not a horror set-piece. Treat it with the same seriousness as Shockoe Bottom.
- Reuse the same warehouse, barge and crew. Recurring places and faces are the point of the anchor rule.
- Wild and Mortalis crews are most at home on the water. Fall Line rolls with Spirit instead of Blood: the river favors nerve and faith over muscle, and it always has a say in where you land.
- The Shepherd stays a presence and a rumor; do not give him a stat line or an ID.
