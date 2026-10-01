# Hub — Downtown / Canal Walk

**Hub Type:** Night (Dominant)

**Setting:** Corporate towers by day, vampire domains by night. The financial district bleeds into the Canal Walk tourist corridor along the James River. Law firms, banks, and government offices create a formal atmosphere that masks older powers. The canal system runs beneath it all — old shipping channels now converted for tourism above, but the real business happens in the tunnels below.

---

## The Overwrite Manifestation

**Overwrite Effect:** Administrative anomaly — legal records shifting, contracts rewriting themselves, impossible precedents.

**Active Anomalies:**
- Court records change retroactively, affecting ongoing cases
- Building permits appear for structures that have existed for decades
- Street addresses shift, causing mail and legal documents to go astray
- The Canal Walk sometimes extends further than it should, with additional locks and channels that "have always been there"
- Law firms occasionally have more floors than their buildings should contain

---

## Primary Faction

**Night:** Dominant through careful legal and financial influence. Vampire courts operate through legitimate business fronts. The canal tunnels provide discrete meeting spaces and secure transportation.

**Faction Status:**
- Night: **3** (dominant, deeply entrenched)
- Power: **2** (overlapping interests in government and law)
- Mortalis: **1** (day-shift workers, security)
- Wild: **0** (actively excluded)

---

## Locations

Named locations are maintained in [`game/locations.json`](../game/locations.json)
and rendered by the City dashboard. This file owns neighborhood lore, not duplicate
location records.

---

## Hub Moves

### Legal Leverage
**Trigger:** When you use legal knowledge or bureaucratic channels to pressure someone into compliance.
**Roll:** Mind
- **10+:** The law is on your side. Choose 2: they comply immediately | you gain lasting legal advantage | you learn something about their vulnerabilities | you establish a useful legal precedent
- **7-9:** They comply, but choose 1 from above and the MC chooses a complication.
- **Miss:** The law cuts both ways. You're exposed to legal consequences.

### Underground Network
**Trigger:** When you use the canal tunnels to move secretly or access restricted areas.
**Roll:** Mind or Blood (your choice)
- **10+:** The tunnels serve you well. Choose 2: you reach your destination unseen | you discover something useful along the way | you avoid the dangerous residents | you find a new route for future use
- **7-9:** You get where you're going but choose 1 from above.
- **Miss:** The tunnels have their own agenda. You encounter something that doesn't want you there.

### A Seat at Their Table
When you go hat in hand to a Status-3 power broker of another Circle on Main Street, roll with Heart. On a hit, they take up your cause as if you were family and put their people and money behind it, but first they set a price from this list: a Debt owed to you by a Status-2+ member of your own Circle; leverage on someone they count as an enemy; an object of real worth that you hand over for good.
- **10+:** They name one.
- **7-9:** They name two.
- **Miss:** They name all three, and you take -1 ongoing with their Circle until the price is paid.

### Gala Season
When you send out invitations to a private evening on Main Street, roll with Mind when time passes.
- **10+:** All three below.
- **7-9:** Choose 1.
  - A Status-3 NPC of your choice comes, with a present worth the room.
  - A Status-2 NPC of your choice trades you a Debt for a place on the list.
  - A Status-1 NPC of your choice is frozen out of Main Street society for good.
- **Miss:** The night is remembered for the guests you least wanted.

---

## Power on Main Street

Main Street is the old "Wall Street of the South," and the Federal Reserve Bank of Richmond still stands nearby as a plain, mundane landmark of the district's money. Here Power runs on ritual contracts: signatures, seals and handshakes that bind more than the paper says. Downtown stays Night-dominant, but Main Street is contested ground where Power is rising, and every Circle has someone working a table, a bar or a doorway on it.

---

## Residents

| ID | Circle | Resident |
|---|---|---|
| `npc_the_ledger` | Power | The Ledger, an entity that tracks every transaction of consequence in the city. |
| `npc_priya_vance` | Power | Priya Vance, artifact dealer who sets prices by games of chance. |
| `npc_ambrose_kettering` | Wild | Ambrose Kettering, a demon who rents the drained canal locks under Main Street as vaults. |
| `npc_bram_oduya` | Wild | Bram Oduya, a fae coat-check attendant who keeps a little of whatever you check with him. |
| `npc_lucien_fairbanks` | Night | Lucien Fairbanks, vampire bartender who sips ambition, not blood. |
| `npc_ida_corliss` | Night | Ida Corliss, a ghost elevator operator in a bank tower with more floors than it should have. |
| `npc_kidane_haile` | Mortalis | Kidane Haile, busker at Kanawha Plaza whose songs predict the markets. |
| `npc_imani_rowe` | Mortalis | Imani Rowe, a court stenographer whose shorthand keeps the transcripts that rewrite themselves honest. |

A new character rooted here may choose one resident who owes them a Debt (see `mc-reference/character-creation.md` Phase 11).


---

## Threats & Complications

- **The Breach:** Something came through a sealed access point in Serrano's domain. He's been defensive and secretive about what happened, sealing off entire sections of tunnel. *(See arc-011)*
- **Legal Surveillance:** Night faction monitors legal proceedings for supernatural exposure risks. They have influence but not control, creating delicate balancing acts.
- **Tunnel Wars:** The underground isn't empty. Different factions claim different sections, and territorial disputes can turn violent.
- **Administrative Overwrite:** The Overwrite's effects on legal documents could expose or protect supernatural activities depending on how it shifts.

---

## Fragments & Beats

- The Canal Walk construction uncovered several "forgotten" tunnel entrances. The city sealed them, but not before Serrano's people mapped the new connections.
- The Exchange restaurant has a wine cellar that connects to the tunnel system. The sommelier has keys to both the wine racks and the hidden doors.
- Court cases involving property disputes along the canal route have unusually high settlement rates. Lawyers joke about the "Canal Walk Effect," not knowing how literal it is.
- Recent flooding in the tunnel system wasn't from the river — something was deliberately opened to wash out evidence of the breach.
- John Smith (PC ghost) has an anchor place somewhere in Downtown that he hasn't found yet. The pull is real.
- Benjamin Grey (PC) operates out of St. Angust Parish in this hub as a parish priest cover.
