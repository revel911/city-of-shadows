# MC Reference & Character Creation Rework — Design

**Date:** 2026-05-14
**Status:** Approved design, ready for implementation plan
**Scope:** `city-of-shadows/mc-reference/` and the Discord bot's prompt-assembly path config

## Problem

Two pain points in how the MC consumes reference material and runs onboarding:

1. **MC misses mechanics or lore.** The MC system prompt today loads two hand-condensed summary docs (`rules-reference.md`, `wod-supplement.md`). The condensed format omits detail, so the MC sometimes runs clans, disciplines, kiths, or extreme failures shallowly. New, more thorough reference material has landed in `mc-reference/Reference-Docs/` and `mc-reference/Reference-Docs/World-of-Darkness/`, but it isn't yet the one the MC reads.

2. **Character creation is unstructured.** The current onboarding flow is a 14-bullet list inside `mc-instructions.md` with no per-step guidance. The MC has to improvise prompts, choices, and defaults, which makes first sessions inconsistent and assumes the player already knows the rules.

Token budget for the system prompt is acceptable to grow — depth of MC behavior is the priority.

## Goals

- Make the new `Reference-Docs/` content the authoritative, MC-loaded reference, with no parallel condensed copy that can drift.
- Give the MC a scripted, phase-by-phase character creation wizard that captures what to say, what to capture, and what to put in the close block.
- Normalize the new reference docs to the repo's conventions (kebab-case, `.md`, no spaces in filenames, Markdown over JSON) before more content layers on the inconsistent format.
- Treat players as new to both Urban Shadows and the World of Darkness during onboarding — define jargon inline on first mention.

## Non-Goals

- No changes to existing player sheets, handoffs, or state files — current shapes already match the wizard's output.
- No changes to `npc-personality-engine.md`, `state-schema.md`, `bot-output-format.md`.
- No changes to world-bible, hubs, NPCs, arcs, or events log.
- No changes to the Discord bot beyond its prompt-assembly file paths.
- No per-playbook split of the wizard (12 files would duplicate `playbooks.md`).

## Approach

**Approach B from brainstorming: Normalize + swap.** Delete the two condensed summary docs, normalize the new reference docs to the repo's `.md`/kebab-case convention, convert JSON-formatted reference files to structured Markdown, and add one new `character-creation.md` wizard script. The two rejected alternatives:

- *Minimal swap (A):* Same swap without normalization — leaves a mixed JSON/text/`.txt` layer the MC has to parse two ways.
- *Per-playbook creation guides (C):* Splits the wizard into 12 files — premature for 5 active players and duplicates `playbooks.md` content.

## Design

### 1. File Layout & Naming

Final tree under `city-of-shadows/mc-reference/`:

```
mc-reference/
├── mc-instructions.md          (updated — references list rewritten; new: block shrinks to wizard pointer)
├── character-creation.md       (NEW — wizard script)
├── npc-personality-engine.md   (unchanged)
├── state-schema.md             (unchanged)
├── bot-output-format.md        (unchanged)
└── reference/                  (renamed from Reference-Docs)
    ├── rules.md                (was Rules.txt — JSON → Markdown)
    ├── basic-moves.md          (was Basic Moves.txt — JSON → Markdown)
    ├── mc-moves.md             (was MC Moves.txt — JSON → Markdown; holds Extreme Failures + Instinct Die)
    ├── playbooks.md            (was Playbooks.txt — JSON → Markdown)
    └── world-of-darkness/      (lowercased)
        ├── changeling.md
        ├── demon.md
        ├── hunter.md
        ├── mage.md
        ├── orpheus.md
        ├── slasher.md
        ├── vampire.md
        └── werewolf.md
```

**Deleted:** `mc-reference/rules-reference.md`, `mc-reference/wod-supplement.md`.

**Naming conventions:** lowercase, kebab-case, `.md` extension, no spaces — matches `hubs/`, `game/`, `players/`.

### 2. Reference Doc Format

The four JSON-formatted files convert to structured Markdown. Markdown with tables and clear headings is more compact than JSON, easier for the MC to scan, and easier to maintain.

**Per-file format:**

- **`rules.md`** — section per topic (`## The Conversation`, `## Framing Scenes`, `## Moves and Dice`, …). Body is the existing prose. Side notes become `> Note:` callouts.

- **`basic-moves.md`** — one `### Move Name` per move:
  ```
  **Trigger:** …
  **Roll:** Blood / Heart / Mind / Spirit

  - **10+:** …
  - **7–9:** …
  - **Miss:** …

  *Advanced (12+):* …
  ```
  Lists become Markdown lists. This is the format already used in the (to-be-deleted) `rules-reference.md` — proven workable.

- **`mc-moves.md`** — four top sections:
  - `## MC Basic Moves` (bulleted list)
  - `## MC Circle Moves` (table: Circle × 4 moves)
  - `## Instinct Die` (mechanic prose + circle-theme table)
  - `## Extreme Failures` (one `### Circle — Theme` per Circle, then `#### Playbook` sub-sections, each a bulleted list of named failures + descriptions)

- **`playbooks.md`** — one `## Playbook Name` per playbook. Per playbook:
  - One-line description
  - `### Special Mechanic` (e.g., "Your Mortal Relationships", "Eternal Hunger")
  - `### Moves` grouped by category (`#### You Get This One`, `#### Choose Three`, `#### Corruption Moves`), each with name in bold + full text
  - `### Starting Stats / Circle` (pulled from JSON if present)

- **`world-of-darkness/<line>.md`** — already prose-heavy. Light pass: top of file gets a summary block (Base Playbook, Key Mechanics in one line each), then headings for Clans / Disciplines / altered moves / etc. as the existing structure suggests. Content kept verbatim except where existing headings are already clear.

**Conversion rule:** zero content loss. If a JSON field has no obvious heading home, surface it as a `> **Note:** …` line rather than dropping it.

### 3. Character Creation Wizard (`character-creation.md`)

A script the MC follows when the opening message starts with `New player:`. Replaces the 14-bullet `new:` block in `mc-instructions.md`.

**Structure:** ordered phases. Each phase tells the MC three things: what to say to the player, what to capture, what to do with it. The MC reads top-to-bottom on a first-session onboarding; it ends with the close block being emitted.

**Top-of-doc rule (applies to every phase):**

> **Player-facing onboarding rule:** Assume the player is new to both Urban Shadows and the World of Darkness. Define every game term inline the first time it comes up in conversation — Circles, Debts, Status, Corruption, Harm, moves, triggers, stats, hard hit / weak hit, the Instinct Die, Embrace, Clan, Auspice, Kith, Awakening Path, Shade, Compact. One sentence is enough. Never use a term you haven't already defined. If the player asks for more depth, give it; otherwise keep moving.

**The phases:**

1. **Frame & Safety** — short intro: City of Shadows is mythic-noir WoD on Urban Shadows. Lines & veils conversation: hard limits (will not happen), soft limits (will fade-to-black). Capture into `state.json.safety` block.

2. **Concept** — one open prompt: *"Who is this person before the supernatural finds them, and what's pulled them in?"* Capture: name, pronouns, look, demeanor, background → sheet `IDENTITY`.

3. **Experience Tier** — Newcomer (0 advances) / Established (6) / Seasoned (12) surfaced with explanation. Capture: tier + advance count.

4. **Playbook** — MC defines "playbook" and "Circle" on first mention, then lists the 12 playbooks with one-line identity (from `playbooks.md` table). Player picks one. MC then summarizes the playbook's special mechanic.

5. **WoD Extension decision** — any extension can be taken with any playbook, as long as its prerequisite move is taken. Each extension has a *natural* base playbook that gives the prerequisite for free; off-natural pairings cost a cross-archetype move pick.

   Natural pairings (the prerequisite move is the playbook's free starting move):
   - Vamp → Vampire: The Masquerade (prerequisite: The Embrace)
   - Wizard → Mage: The Awakening (prerequisite: Channeling)
   - Spectre → Orpheus (prerequisite: manifest abilities)
   - Wolf → Werewolf: The Forsaken
   - Fae → Changeling: The Lost
   - Tainted → Demon: The Descent
   - Hunter → Hunter: The Vigil
   - Any Mortalis (Aware / Hunter / Sworn / Veteran) → Slasher

   Off-natural example: a Veteran character can run Mage: The Awakening by spending a move pick on Channeling (Wizard cross-archetype); a Spectre can run Vampire: The Masquerade by spending a pick on The Embrace.

   MC's job in this phase:
   - Define each sub-type term (Clan, Awakening Path, Shade, Auspice, Kith, Compact) when the extension is offered.
   - Explain the prerequisite-move rule plainly: *"To run [extension], your character has to be able to do [thing]. That comes from the [move] move — it's free if you picked [natural playbook], otherwise it costs you one of your move picks."*
   - Capture: extension id + sub-type slot, and flag the prerequisite move as required for phase 7.

6. **Stats** — MC defines "stat" and "modifier" before listing the playbook's starting stat array (from `playbooks.md`). Player allocates. MC validates cap of +3 / −2. Capture: `stats` block.

7. **Moves** — MC defines "move", "trigger", and "cross-archetype move" on first mention. Playbook's `you_get_this_one` automatically taken. Player picks `choose_three` (or whatever count the playbook specifies) from `playbooks.md`. If a WoD extension was taken in phase 5:
   - If the extension's prerequisite move is the playbook's free starting move (natural pairing), it's already covered — no pick spent.
   - If it isn't (off-natural pairing), one of the player's move picks MUST be the prerequisite (taken cross-archetype from the natural playbook).
   - Sub-type moves (Clan Disciplines, Awakening rotes, Auspice/Tribe gifts, Kith abilities, etc.) come from the relevant `world-of-darkness/<line>.md` file. Whether a sub-type move counts against the move pick budget or is granted by extension induction follows that file's rules; the MC enforces what the file says.

   Capture: `moves` list (with source noted: playbook / cross-archetype / extension).

8. **Circle Ratings & Status** — MC defines the distinction between Circle Rating (modifier when acting in that faction's world) and Status (social standing within that faction). Playbook starting Circle gets +1 Status. Others start 0 unless playbook says otherwise. Capture: `circle_ratings`, `circle_status`.

9. **Debts & Anchors** — MC defines "Debt" (favor currency) and "Anchor" (mortal/object/place tether). Reads playbook intro questions to seed Debts (usually 1–2 NPCs the character owes, 1–2 who owe them) and Anchors (2–3). New NPCs introduced here go in the close-block `npc_patch` with full personality-engine scores.

10. **Resolve Advances (if Established / Seasoned)** — walk advance list using `rules.md` advancement rules (standard before 5, after-5 after 5). MC asks player to pick advances one at a time, narrating each. Capture: append to `ADVANCEMENT` section of sheet.

11. **Embed in Hubs** — MC names the 6 Richmond hubs from `hubs/index.json`, invites player to pick 1–2 the character is rooted in. Capture: notes into sheet `GEAR & RESOURCES` and `tension_threads` of handoff.

12. **Player ID** — MC proposes a kebab-case id (`firstname-lastname`), confirms with player.

13. **Opener** — MC drops into the first scene. From this point forward it's a normal session; the MC plays it out and emits a close block at session end.

**Close-block contents on first-session-end:** full `<handoff>`, full `<sheet>`, initial `<state_patch>` (stats/harm/corruption/xp/circles/debts), any `<npc_patch>` entries, and `<events_append>` for the public arrival if relevant.

**Cross-references:** each phase that pulls from another reference doc points to it by anchor (e.g., "see `reference/playbooks.md#the-vamp`"). No content duplicated.

### 4. `mc-instructions.md` Updates

Three targeted changes; everything else in that file stays as-is.

**Change 1 — Reference Documents block** (lines 33–38). Rewrite the list:

```
REFERENCE DOCUMENTS (already concatenated into this system prompt — no fetch required):
- `mc-reference/reference/rules.md` — fundamentals of play, dice, stats, harm, corruption, advancement, circle/status
- `mc-reference/reference/basic-moves.md` — all basic moves
- `mc-reference/reference/mc-moves.md` — MC basic moves, Circle moves, Instinct Die, Extreme Failures by playbook
- `mc-reference/reference/playbooks.md` — all 12 playbooks with full move text and special mechanics
- `mc-reference/reference/world-of-darkness/` — 8 WoD extension files (vampire, mage, orpheus, werewolf, changeling, demon, hunter, slasher), each with clans/kiths/sects/disciplines, altered moves, and extension-specific advancement
- `mc-reference/character-creation.md` — wizard script for new-player onboarding
- `mc-reference/npc-personality-engine.md` — NPC voice and personality scoring system
- `mc-reference/state-schema.md` — state.json field reference
- `mc-reference/bot-output-format.md` — close-block emission schema
```

**Change 2 — Onboarding section** (lines ~462–480). The `new:` step-list shrinks to a wizard pointer:

```
new:
  protocol: follow mc-reference/character-creation.md phase-by-phase
  output: at close, emit the full sheet, initial state_patch, npc_patch (for any NPCs introduced), and first handoff
```

The current 14-bullet list is removed — the wizard doc owns that flow now.

**Change 3 — No other content changes.** Tone, session flow, roll protocol, document model, hard rules, NPC personality engine, player authority, interaction system, truth hierarchy, MC pressure — all unchanged.

### 5. Migration & Cutover

Ordered to keep each step reversible until the final delete:

1. **Build the new format.** Create `mc-reference/reference/` and convert the four JSON files + 8 WoD `.txt` files to kebab-case `.md` per section 2. Verify content-completeness against the originals (no fields dropped). Old files remain in place — nothing yet loads from the new ones.

2. **Write the wizard.** Create `mc-reference/character-creation.md` per section 3, including the jargon rule and per-phase explainers.

3. **Update the bot's prompt assembly.** The bot reads file paths to build the system prompt. Update those paths to point at the new locations. Riskiest single step — get it right before deleting anything.

4. **Update `mc-instructions.md`.** Apply the three changes from section 4.

5. **Smoke-test.** Start a fresh thread, confirm the system prompt assembles correctly with no missing-file errors. Ideally run a `New player:` opener and watch the MC pull from the wizard. If the bot supports a dry-run preview, that's the cheapest way to catch path bugs.

6. **Delete the old files.** Remove `mc-reference/rules-reference.md`, `mc-reference/wod-supplement.md`, and the old `Reference-Docs/` folder. Commit order: convert → update bot → update instructions → smoke test → delete.

**Active session caveat:** the bot loads the system prompt fresh at session start, so in-progress threads aren't affected by the cutover itself. Existing player files (sheets, handoffs, state) are not touched.

## Out of Scope

- Existing player sheets (Robert Lagrange, Chris Caustes, Johan van Axel, Benjamin Grey, John Smith) — no migration needed.
- `npc-personality-engine.md`, `state-schema.md`, `bot-output-format.md` — unchanged.
- World-bible, hubs, NPCs, arcs, events log — unchanged.
- Discord bot beyond prompt-assembly path updates — unchanged.
