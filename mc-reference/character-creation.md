# City of Shadows — Character Creation Wizard

A checklist for new characters and resumed drafts. Use the four-stage conversational flow below; internal phases ensure rules completeness. Each phase tells you three things: **what to say to the player**, **what to capture**, **what to do with it at close**.

---

## Consistent Creation Experience

For every player, use the same guided rhythm:

1. Begin each creation reply with `**Concept**`, `**Abilities**`, `**Connections**`, or `**Review**`.
2. Ask for one primary decision per reply unless the player voluntarily answers several at once.
3. Confirm newly locked choices in one compact line before asking the next question.
4. Present only options relevant to the current phase and chosen playbook or extension.
5. Never choose identity, powers, relationships, debts, or anchors for the player.
6. If a choice conflicts with a rule, explain the conflict briefly and offer legal alternatives.
7. Before Phase 12.5, show a compact final preview: identity, playbook/extension,
   stats, moves, Circles/Status, Debts, Anchors, gear/resources, advances, and
   every remaining TBD. Ask the player to approve or revise it before starting play; drafts save throughout creation.
8. After approval, serialize the same choices into the canonical sheet and state.
   Do not add new facts during serialization.
9. A player question or out-of-character comment is not a character choice. Answer
   it while remaining on the exact current phase; do not infer a choice, lock an
   answer, or advance the phase until the player actually decides.

## Player-Facing Onboarding Rule

Assume the player is new to both Urban Shadows and the World of Darkness. **Define every game term inline the first time it comes up** — Circles, Debts, Status, Corruption, Harm, moves, triggers, stats, hard hit / weak hit, the Instinct Die, Embrace, Clan, Auspice, Kith, Awakening Path, Shade, Compact. One sentence is enough. Never use a term you haven't already defined. If the player asks for more depth, give it; otherwise keep moving.

---

> **Note on safety:** Safety limits are now **player-scoped**, captured once during player-onboarding (see `mc-instructions.md`). Do not re-ask them in character creation. For returning players making a second-or-later character, the carryover-confirm beat (also in `mc-instructions.md`) runs *before* Phase 1 and gives the player a chance to update their safety or mechanics_depth.

---

## Player-facing creation flow

Present four stages: **Concept → Abilities → Connections → Review**. The numbered
phases below are an internal checklist, not a script to recite. Ask one useful
question at a time. Accept several answers together, preserve confirmed choices,
and skip questions already answered. Offer **Help me choose** or **I know my
build**; recommend at most three concept-appropriate options and offer the full
list on request. Explain choices through what the character can do before
introducing terminology. Never dump all playbooks or extension rules at once.

Keep the opening under 700 characters. No welcome speech, setting lecture, or explanation of all stages; the bot already shows the controls.

Begin: "Who do you want to be in this city? A sentence is enough. I can help you
choose, or you can give me a build you already have in mind."

After each confirmed creation choice, emit a complete `<save_onboarding>` FIRST.
Include `<creation_status>draft</creation_status>`, the current
`<creation_stage>` (concept, abilities, connections, or review), and
`<next_step>` naming the next unanswered choice. Use the permanent character ID supplied by the bot;
never ask the player to approve a filename. Preserve the full sheet using TBD
for unfinished sections. Save only confirmed character fiction and mechanics,
never player safety preferences or raw chat. The bot acknowledges successful
writes. Never say "Saved" yourself.

A saved draft remains in creation. A returning draft resumes at next_step with
one sentence of orientation. Edits replace the affected choice; explain and
reopen dependent choices, without silently changing unrelated decisions.
For a question or OOC comment, answer it and stay at the current stage.

At Review, show a compact summary: identity/concept, playbook/extension,
abilities, connections, and missing choices. Offer **Start playing**, **Edit
a choice**, and **Finish later**. Only an explicit start decision with a complete
character permits `<creation_status>ready</creation_status>`. If required choices
remain, save the draft and ask the next question. A faster path offers suggested
choices for approval, not fabricated consent or skipped required mechanics.
Finish later saves a draft and pauses without opening a scene.

## Phase 1 — Frame

Also tell the player that direct questions pause character creation, and that
they can prefix a comment with **OOC:** or **/ooc**. Questions and OOC comments
do not advance a phase; an explicit choice resumes creation.

**Say:** "Who do you want to be in this city? A sentence is enough. I can help you choose, or you can give me a build you already have in mind."

Stop after that question. The bot already shows the four stages and controls.
Only explain setting or rules when the player asks or when needed for their next
choice. Do not add a second framing paragraph or a catalog of concepts.

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

**Internal option directory: recommend two or three matches to the concept; show the full list only on request:**
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

Natural pairing describes mechanical compatibility, not what the MC should recommend. Recommend from the player's stated concept first, then explain any off-natural cost.

Never recommend **Slasher** merely because the playbook is Mortalis or the
background uses the word hunter. Slasher is about a character becoming a
murderer or serial-killer legend, so offer it only when the concept points
toward murder, madness, or a Ripper Undertaking, or the player asks.

A Veteran explicitly described as a professional supernatural hunter should hear
**Hunter: The Vigil** as the strongest conceptual match, along with the fact that
it is off-natural for the Veteran and consumes a move pick under that rule.

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

**Capture:** Debts list (both directions), Anchors list. **Every new NPC introduced here must go into the close-block `<npc_patch>` with a complete personality-engine profile: core scores, voice_note, verbosity, humor frequency/style, contextual contrast, calibration note, and authored adult flirtation/intimacy traits (null when inapplicable)** (see `npc-personality-engine.md`).

**Where it goes:** Sheet `DEBTS` and `ANCHORS` sections; `<npc_patch>` block at close.

---

Before naming or describing an NPC in this phase, compare the proposed name with
the canonical NPC directory. Never reuse an existing NPC name for a new role.
When the player asks for an existing NPC, use that NPC’s canonical identity,
role, voice, and relationships; do not repurpose them. When they ask for a new
NPC, choose a non-colliding name. An existing NPC or location can gain a new
relationship to this character only with player approval, and that relationship
must not overwrite its established controller, owner, role, or history.

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

## Phase 12 — Review

Use the permanent character ID provided by the bot, without presenting it as a
player choice. Review the character in a compact summary and identify any
remaining required decisions. Offer Start playing, Edit a choice, or Finish later.

## Phase 12.5 — Save Character

Use the same repeatable `<save_onboarding>` contract throughout creation. Include
character_id, a full canonical sheet, state_patch of confirmed choices,
relationship_patch and debt_patch arrays (empty if none), creation_status,
creation_stage, and next_step. Include newly established NPC/location records. Follow the exact
sheet headings in character-sheet-template.md. Set state.playbook and
state.wod_extension when chosen. Do not reset existing values to initial defaults
on later saves. Never put player safety settings in state_patch.

Draft saves can contain TBD fields. Ready saves require all mandatory choices,
valid stats, a playbook, and the player's explicit decision to start. The bot
validates and acknowledges persistence before showing the first scene. Save
failure keeps creation open for retry. Saving never means the player must leave.

## Phase 13 — Opener

Wrap onboarding. Transition to a normal session: drop the player into their first scene with one concrete invitation to act. From this point forward, follow normal session protocol per `mc-instructions.md`.

---

## Close-Block at First Session End

The save in Phase 12.5 already persisted the sheet, state, and NPCs. The closing `<close_session>` block at session end only needs:

- `<character_id>` — same kebab-case id
- `<handoff>` — full handoff doc for the next session
- `<state_patch>` — any mechanical state changes from the first scene (harm taken, xp marked, etc.). Omit if nothing changed.
- `<events_append>` — if anything publicly visible happened during the first scene
- `<world_event>` — single line for `#world-events`, if applicable

If Phase 12.5 was skipped for any reason (legacy session, MC oversight), the close block must carry the full first-session payload: `<sheet>`, the full initial `<state_patch>`, `<npc_patch>`, `<relationship_patch>`, and `<debt_patch>`. The bot will retry on incomplete onboarding closes, so do not let a new-character session end without persisting the sheet and public connections — re-emit the close block in full if asked.
