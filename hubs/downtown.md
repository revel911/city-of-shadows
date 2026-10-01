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

### Countersign
When you ask a Main Street power broker of another Circle to put their name beside yours on a paper that matters (a deal, a bond, a lease, a petition), roll with Heart.
- **10+:** They sign. The paper binds the way Main Street contracts do, and anyone who breaks it answers to them as well as to you.
- **7-9:** They sign, but write in a clause of their own. The MC picks 1:
  - They get first refusal on your next deal.
  - You come when they call, once, no questions.
  - Their name goes above yours, and so does the credit.
- **Miss:** They sign in an ink the Overwrite likes. By morning the paper says something you did not agree to.

### The Long Table
When you host a dinner on Main Street to settle a dispute between two parties and set the seating yourself, roll with Mind when time passes.
- **10+:** They leave with terms, and each owes you a Debt.
- **7-9:** They leave with terms. One owes you a Debt; the other blames you for the seating.
- **Miss:** The terms are signed, and by morning one copy no longer matches the other.

---

## Power on Main Street

Main Street is the old "Wall Street of the South," and the Federal Reserve Bank of Richmond still stands nearby as a plain, mundane landmark of the district's money. Here Power runs on ritual contracts: signatures, seals and handshakes that bind more than the paper says. Downtown stays Night-dominant, but Main Street is contested ground where Power is rising, and every Circle has someone working a table, a bar or a doorway on it.

---

## Residents

| ID | Circle | Resident |
|---|---|---|
| `npc_augustine_pell` | Power | Augustine Pell, a Main Street notary whose seal keeps papers safe from the Overwrite, until this month. |
| `npc_margaux_tillery` | Power | Margaux Tillery, an executive assistant and hedge mage whose calendar decides which version of a meeting happened. |
| `npc_ambrose_kettering` | Wild | Ambrose Kettering, a demon who rents the drained canal locks under Main Street as vaults. |
| `npc_bram_oduya` | Wild | Bram Oduya, a fae coat-check attendant who keeps a little of whatever you check with him. |
| `npc_sabine_deverell` | Night | Sabine Deverell, a vampire who owns the towers' after-hours shredding company and reads what they throw away. |
| `npc_ida_corliss` | Night | Ida Corliss, a ghost elevator operator in a bank tower with more floors than it should have. |
| `npc_ruben_castellanos` | Mortalis | Ruben Castellanos, a bike courier whose envelopes sometimes arrive before they were sent. |
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

## Adaptation Notes

Night does not merely rule Downtown, it seeps into it. Show the ordinary bars, restaurants and late-night counters that give people a reason to be here after dark, so the supernatural has a crowd to hide in. Residents glance over their shoulders more than they admit. Anyone who arrives with something genuinely new, rather than another version of an old offer, earns attention fast.
