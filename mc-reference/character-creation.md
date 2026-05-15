# City of Shadows — Character Creation Wizard

A script the MC follows when the opening message starts with `New player:`. Phases run in order. Each phase tells you three things: **what to say to the player**, **what to capture**, **what to do with it at close**.

---

## Player-Facing Onboarding Rule

Assume the player is new to both Urban Shadows and the World of Darkness. **Define every game term inline the first time it comes up** — Circles, Debts, Status, Corruption, Harm, moves, triggers, stats, hard hit / weak hit, the Instinct Die, Embrace, Clan, Auspice, Kith, Awakening Path, Shade, Compact. One sentence is enough. Never use a term you haven't already defined. If the player asks for more depth, give it; otherwise keep moving.

---

## Phase 1 — Frame & Safety

**Say:** "City of Shadows is a mythic-noir game set in the World of Darkness. The rules engine is Urban Shadows. Before we start: are there any hard limits — things that should not happen in fiction at all — or soft limits — things we should fade to black on?"

**Capture:** Hard limits and soft limits.

**Where it goes:** `state.json.safety = { hard_limits: [...], soft_limits: [...] }`.

---

## Phase 2 — Concept

**Say:** "Who is this person before the supernatural finds them, and what's pulled them in?"

**Capture:** Name, pronouns, look (1–2 sentences), demeanor (1 sentence), background (1 short paragraph).

**Where it goes:** Sheet `IDENTITY` section.

---

## Phase 3 — Experience Tier

**Say:** "Three options for where your character starts on the experience ladder:
- **Newcomer** — fresh, no advancement history.
- **Established** — 6 advances. Some hard lessons learned. Probably has Debts both directions.
- **Seasoned** — 12 advances. A real operator with significant power and entanglement.
Which fits the concept?"

**Capture:** tier + advance count.

**Where it goes:** Sheet `ARCHETYPE / PLAYBOOK` section (Experience Tier line); resolved in Phase 10.

---

## Phase 4 — Playbook

**First-mention definitions:**
- *Playbook* — your character class. Defines what supernatural creature or person you are, what special moves you can do, and what your dark side costs you.
- *Circle* — the four supernatural factions of the city: Mortalis (humans who know), Night (vampires, ghosts), Power (mages, witches), Wild (shifters, fae, spirits). Every playbook is rooted in one Circle by default.

**Say:** "Twelve playbooks. Pick one." Then list each with its one-line identity from `reference/playbooks.md`:
- The Aware (Mortalis) — mortal who can see the supernatural world
- The Fae (Wild) — faerie being navigating the mortal world
- The Hunter (Mortalis) — mortal dedicated to policing the supernatural
- The Imp (Wild) — demonic creature working the angles
- The Oracle (Power) — seer with visions of what lies ahead
- The Spectre (Night) — ghost bound to the mortal world
- The Sworn (Power) — oath-bound servant of a supernatural order
- The Tainted (Wild) — mortal touched by demonic corruption
- The Vamp (Night) — vampire navigating blood politics
- The Veteran (Mortalis) — hardened mortal who has seen it all
- The Wizard (Power) — arcane practitioner of the magical arts
- The Wolf (Night) — werewolf balancing beast and humanity

After the player picks, summarize the playbook's special mechanic in your own words.

**Capture:** playbook id.

**Where it goes:** Sheet `ARCHETYPE / PLAYBOOK`.

---

## Phase 5 — WoD Extension Decision

**First-mention definitions:** define each extension's sub-type slot the moment it's offered (Clan for Vampire, Awakening Path for Mage, Shade for Orpheus, Auspice/Tribe for Werewolf, Kith for Changeling, Compact for Hunter).

**Say:** "World of Darkness extensions overlay deeper lore on top of your playbook. Each one has a *natural* playbook that grants its prerequisite move for free — but any playbook can run any extension, you just spend a move pick on the prerequisite.

Natural pairings:
- Vampire: The Masquerade → The Vamp (free prerequisite: The Embrace)
- Mage: The Awakening → The Wizard (free prerequisite: Channeling)
- Orpheus → The Spectre (free prerequisite: manifest abilities)
- Werewolf: The Forsaken → The Wolf
- Changeling: The Lost → The Fae
- Demon: The Descent → The Tainted
- Hunter: The Vigil → The Hunter
- Slasher → any Mortalis playbook (Aware, Hunter, Sworn, Veteran)

Want to take an extension? If so, which?"

If the player picks an extension off-natural (e.g., a Veteran wanting Mage: The Awakening), explicitly tell them: "Your character will need [prerequisite move]. That'll cost one of your move picks in the next step — taken cross-archetype from [natural playbook]."

**Capture:** extension id, sub-type slot (Clan name, Awakening Path, Shade type, etc. — read options from `reference/world-of-darkness/<extension>.md`), and flag the prerequisite move as required for Phase 7.

**Where it goes:** Sheet `ARCHETYPE / PLAYBOOK` section (Clan/Path/Sect lines).

---

## Phase 6 — Stats

**First-mention definitions:**
- *Stat* — one of four numbers describing your character: Blood (violence, intimidation, physical endurance), Heart (connection, persuasion, emotional reads), Mind (research, planning, deception), Spirit (willpower, supernatural resistance, rituals).
- *Modifier* — your stat value (-2 to +3). When you roll, you add it to two six-sided dice.

**Say:** Read the playbook's starting stat array from `reference/playbooks.md`. "Pick one of these arrays — they all give you the same total spread but different focus."

**Capture:** stats block.

**Validation:** No stat below -2 or above +3 at character creation.

**Where it goes:** Sheet `STATS` table.

---

## Phase 7 — Moves

**First-mention definitions:**
- *Move* — a specific action with rules. It only fires when you do the thing in the fiction that triggers it. Saying it out loud isn't enough.
- *Trigger* — the specific in-fiction condition that fires a move.
- *Cross-archetype move* — a move you took from a playbook that isn't yours. Available as one of your move picks.

**Say:** "Your playbook gives you [N] free moves automatically, then you pick [M] more from its list."

Apply rules:
- Playbook's `you_get_this_one` moves auto-marked.
- Player picks the remaining count from `reference/playbooks.md` under the chosen playbook.
- **If a WoD extension was taken in Phase 5:**
  - *Natural pairing*: the prerequisite is already the playbook's free starting move — nothing extra.
  - *Off-natural pairing*: one of the player's move picks **must** be the prerequisite move (taken cross-archetype from the natural playbook).
- Sub-type moves (Clan Disciplines, Awakening rotes, Auspice gifts, Kith abilities) come from the relevant `reference/world-of-darkness/<extension>.md` file. Whether a sub-type move costs a pick or is granted free by extension induction follows that file's rules — enforce what the file says.

**Capture:** Moves list with source noted (playbook / cross-archetype / extension / sub-type).

**Where it goes:** Sheet `MOVES` section, grouped by source.

---

## Phase 8 — Circle Ratings & Status

**First-mention definitions:**
- *Circle Rating* — your roll modifier when acting in that Circle's domain. Can be negative.
- *Circle Status* — your social standing within that faction. Affects who returns your calls and how NPCs read you. Tracked separately from rating.

**Say:** "Your playbook's home Circle starts at +1 Status. Others start at 0 unless the playbook says otherwise. Ratings start at 0 for everyone unless changed by advances."

**Capture:** `circle_ratings` and `circle_status` blocks.

**Where it goes:** Sheet `CIRCLES & STATUS` table; `state.json.circle_ratings`, `state.json.circle_status`.

---

## Phase 9 — Debts & Anchors

**First-mention definitions:**
- *Debt* — a favor someone owes you (or you owe them). Currency of the city. You spend Debts to make people help you; you take Debts to get out of trouble.
- *Anchor* — a person, place, or object that keeps you tethered to who you were. Losing one hurts in ways the rules don't fully capture.

**Say:** Read the playbook's intro questions from `reference/playbooks.md`. Use them to seed:
- 1–2 NPCs the character owes a Debt to
- 1–2 NPCs who owe the character
- 2–3 Anchors (people / objects / places)

**Capture:** Debts list (both directions), Anchors list. **Every new NPC introduced here must go into the close-block `<npc_patch>` with full personality-engine scores** (see `npc-personality-engine.md`).

**Where it goes:** Sheet `DEBTS` and `ANCHORS` sections; `<npc_patch>` block at close.

---

## Phase 10 — Resolve Advances (only if Established or Seasoned)

**Say:** "You have [6 / 12] advances to spend. Standard advances first (before 5 total), then after-5 advances unlock more options."

Walk advance list using `reference/rules.md` advancement rules. For each advance, ask the player to pick and narrate briefly: what did your character go through to learn this? (One sentence is enough — adds texture to the sheet.)

**Capture:** Append to sheet `ADVANCEMENT` section. Update stats / moves / Circle Ratings / Status accordingly.

**Where it goes:** Sheet `ADVANCEMENT` section.

---

## Phase 11 — Embed in Hubs

**Say:** "Six neighborhoods anchor the city: [list from `hubs/index.json`]. Pick 1–2 your character is rooted in — where they sleep, where they work, where their stash is."

**Capture:** Notes about each chosen hub.

**Where it goes:** Sheet `GEAR & RESOURCES` section; first handoff `tension_threads` if appropriate.

---

## Phase 12 — Player ID

**Say:** "I'll use `firstname-lastname` (kebab-case) as your character's id in the repo. For [character name], that's `[proposed-id]`. Good?"

**Capture:** player_id.

**Where it goes:** `<player_id>` tag in the close block; folder created automatically by the bot.

---

## Phase 13 — Opener

Wrap onboarding. Transition to a normal session: drop the player into their first scene with one concrete invitation to act. From this point forward, follow normal session protocol per `mc-instructions.md`.

---

## Close-Block at First Session End

After the first scene plays out and the session closes, the close block must include:

- `<player_id>` — kebab-case id from Phase 12
- `<sheet>` — full new sheet built across phases 1–11
- `<state_patch>` — initial state: stats, harm 0, corruption 0, xp 0, circle_ratings, circle_status, safety block, debts, advances
- `<npc_patch>` — every NPC introduced in Phase 9 (or during the opener), with full personality-engine scores
- `<handoff>` — full handoff doc for next session
- `<events_append>` — if the character's arrival is publicly visible, log it

Omit any field you don't need.
