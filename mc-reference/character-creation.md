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
- **Established** — 6 advances. Some hard-won lessons. Probably owes favors and is owed favors by others in the city.
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
- The Sword (Power) — sworn servant of a Power faction (academy, abbey, or council)
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

**First-mention definitions** (use the one that matches the player's chosen extension):
- *Clan* (Vampire) — your bloodline. Determines your Disciplines (vampiric powers) and your place in vampire society.
- *Awakening Path* (Mage) — the metaphysical orientation that defines what magic you can do best (Acanthus, Mastigos, Moros, Obrimos, or Thyrsus).
- *Shade* (Orpheus) — what kind of ghost you are. Defines your Manifestation Forms.
- *Auspice* / *Tribe* (Werewolf) — auspice is the moon phase you were born under; tribe is the spiritual lineage you serve.
- *Kith* (Changeling) — the type of fae you are; determines your specific magical gifts.
- *Compact* (Hunter) — the organization or covenant you hunt with. Defines your tactical advantages and Gospel moves.

**Say:** "World of Darkness extensions overlay deeper lore on top of your playbook. Each one has a *natural* playbook — the playbook the extension was built for. Any playbook can still run any extension; it just costs extra.

How induction works:
- **Natural pairing**: you trade your beginning archetype Move for induction into a Clan / Path / Auspice / Shade / Kith / Compact / Undertaking. You get the sub-type slot (Discipline, Rote, Gift, Manifestation, etc.) in exchange.
- **Off-natural pairing**: you keep your archetype Move, but one of your move picks in Phase 7 must be the extension's prerequisite move — taken cross-archetype from the natural playbook.

Natural pairings:
- Vampire: The Masquerade → The Vamp (induction trades beginning move for a Clan + first Discipline)
- Mage: The Awakening → The Wizard (induction trades beginning move for an Awakening Path + first Rote)
- Orpheus → The Spectre (induction trades beginning move for a Shade + first Manifestation Form)
- Werewolf: The Forsaken → The Wolf (induction trades beginning move for an Auspice/Tribe + gift)
- Changeling: The Lost → The Fae (induction trades beginning move for a Kith + Contract)
- Demon: The Descent → The Tainted (induction trades beginning move per demon.md)
- Hunter: The Vigil → The Hunter (induction trades beginning move per hunter.md)
- Slasher → any Mortalis playbook (induction trades beginning move per slasher.md)

You may also decline induction entirely on a natural pairing and keep your beginning archetype Move — but then you don't get the sub-type slot or its abilities.

Want to take an extension? If so, which, and are you inducting?"

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
  - *Natural pairing with induction*: the player gives up their beginning archetype Move (the one normally auto-marked) in exchange for the extension's sub-type slot and its starting ability (first Discipline / Rote / Gift / Manifestation Form / Contract / etc.). They do **not** spend a move pick on the prerequisite — induction handles it.
  - *Natural pairing without induction*: the player keeps their beginning archetype Move and gets no extension sub-type. Treat the extension as flavor only.
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

**Say:** "The city has several anchored neighborhoods: [list from `hubs/index.json`]. Pick 1–2 your character is rooted in — where they sleep, where they work, where their stash is."

**Capture:** Notes about each chosen hub.

**Where it goes:** Sheet `GEAR & RESOURCES` section; first handoff `tension_threads` if appropriate.

---

## Phase 12 — Player ID

**Say:** "I'll use `firstname-lastname` (kebab-case) as your character's id in the repo. For [character name], that's `[proposed-id]`. Good?"

**Capture:** player_id.

**Where it goes:** `<player_id>` tag in the `<save_onboarding>` block (Phase 12.5); folder created automatically by the bot.

---

## Phase 12.5 — Save Character (mandatory, before any play)

Character creation must be persisted **before** the first scene begins. After Phase 12, ask the player explicitly:

> *"Anything else to lock in before we drop into your first scene? If you're ready, I'll save the character now."*

When the player confirms — or at any earlier trigger below — emit a `<save_onboarding>` block in your response. See `bot-output-format.md` for the schema. The block contains:

- `<player_id>` — required
- `<sheet>` — required, full sheet built across phases 1–11 (TBD for anything still unfilled)
- `<state_patch>` — JSON with `character_name`, `stats`, `harm: 0`, `corrupt: 0`, `xp: 0`, `advances`, `circle_ratings`, `circle_status`, `safety`, `gear`, `active_arc_ids: []`, `last_session: "session_000"`, `notes`
- `<npc_patch>` — every NPC introduced in Phase 9, with full personality-engine scores
- `<events_append>` — only if the character's arrival is publicly visible

### Early-save triggers (override phase order)

You must emit `<save_onboarding>` immediately, even if onboarding isn't complete, when:

1. **Player says "save"** (or equivalent: "save my character", "commit this", "lock it in"). Emit `<save_onboarding>` with whatever is filled in so far. Use "TBD" for unfilled sheet fields and a minimal `state_patch` (omit `stats` if not yet chosen — they can be filled in via a later `<state_patch>`). Acknowledge: *"Saved. We can keep going from where we left off."*
2. **Player wants to start the story before onboarding is done** (e.g. "let's just start", "I'm ready to play", "skip the rest, drop me in"). Emit `<save_onboarding>` first, then open the scene in the same response. Do not begin Phase 13 narrative before the save block is in the message.

In both cases, persist what exists. A partial sheet on disk is far better than data lost in chat history.

The bot validates the block, writes everything to GitHub, registers the character in `players/index.json`, and updates the session in-place. After the save succeeds, the session continues as a normal returning-player loop — the close block at session end no longer needs `<sheet>` or `<state_patch>` unless something changed during play.

---

## Phase 13 — Opener

Wrap onboarding. Transition to a normal session: drop the player into their first scene with one concrete invitation to act. From this point forward, follow normal session protocol per `mc-instructions.md`.

---

## Close-Block at First Session End

The save in Phase 12.5 already persisted the sheet, state, and NPCs. The closing `<close_session>` block at session end only needs:

- `<player_id>` — same kebab-case id
- `<handoff>` — full handoff doc for the next session
- `<state_patch>` — any mechanical state changes from the first scene (harm taken, xp marked, etc.). Omit if nothing changed.
- `<events_append>` — if anything publicly visible happened during the first scene
- `<world_event>` — single line for `#world-events`, if applicable

If Phase 12.5 was skipped for any reason (legacy session, MC oversight), the close block must carry the full first-session payload: `<sheet>`, the full initial `<state_patch>`, and `<npc_patch>`. The bot will retry on incomplete onboarding closes, so do not let a new-character session end without persisting the sheet — re-emit the close block in full if asked.
