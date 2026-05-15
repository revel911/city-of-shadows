# MC Reference & Character Creation Rework — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the two hand-condensed MC reference docs (`rules-reference.md`, `wod-supplement.md`) with a normalized `mc-reference/reference/` tree converted from `mc-reference/Reference-Docs/`, add a `mc-reference/character-creation.md` wizard for new-player onboarding, update the Discord bot's prompt-assembly paths, and update `mc-instructions.md` to point at the new layout.

**Architecture:** All reference content moves to `mc-reference/reference/` (lowercase, kebab-case, `.md`). JSON-formatted source files (`Rules.txt`, `Basic Moves.txt`, `MC Moves.txt`, `Playbooks.txt`) are converted to structured Markdown with zero content loss. WoD per-game-line `.txt` files become `.md` with a light heading pass. The bot's `loadSystemPrompt` in `bot/handlers/mc.js` is updated to read the new paths. A new `character-creation.md` scripts the 13-phase onboarding wizard with a top-of-doc rule that defines game jargon on first mention. Old files are deleted only after the new structure is verified by smoke test.

**Tech Stack:** Markdown, Node 20+, `node --test`, the existing `bot/handlers/mc.js` system-prompt assembler.

**Spec:** [docs/superpowers/specs/2026-05-14-mc-reference-rework-design.md](../specs/2026-05-14-mc-reference-rework-design.md)

---

## File Structure

**New files:**

| Path | Responsibility |
|---|---|
| `mc-reference/reference/rules.md` | Fundamentals of play, dice, stats, harm, corruption, advancement, circles. Converted from `Rules.txt`. |
| `mc-reference/reference/basic-moves.md` | All basic moves. Converted from `Basic Moves.txt`. |
| `mc-reference/reference/mc-moves.md` | MC basic + Circle moves, Instinct Die, Extreme Failures by playbook. Converted from `MC Moves.txt`. |
| `mc-reference/reference/playbooks.md` | All 12 playbooks with full move text and special mechanics. Converted from `Playbooks.txt`. |
| `mc-reference/reference/world-of-darkness/changeling.md` | Lowercased, lightly headed copy of `World-of-Darkness/Changeling.txt`. |
| `mc-reference/reference/world-of-darkness/demon.md` | Same for `Demon.txt`. |
| `mc-reference/reference/world-of-darkness/hunter.md` | Same for `Hunter.txt`. |
| `mc-reference/reference/world-of-darkness/mage.md` | Same for `Mage.txt`. |
| `mc-reference/reference/world-of-darkness/orpheus.md` | Same for `Orpheus.txt`. |
| `mc-reference/reference/world-of-darkness/slasher.md` | Same for `Slasher.txt`. |
| `mc-reference/reference/world-of-darkness/vampire.md` | Same for `Vampire.txt`. |
| `mc-reference/reference/world-of-darkness/werewolf.md` | Same for `Werewolf.txt`. |
| `mc-reference/character-creation.md` | 13-phase MC wizard script for new-player onboarding. |
| `bot/test/mc-system-prompt.test.js` | Unit tests for `loadSystemPrompt` path list and assembly. |

**Modified files:**

| Path | Change |
|---|---|
| `bot/handlers/mc.js` | `loadSystemPrompt` (lines 23–41) — replace 6-path list with new 11-path list incl. WoD subdir; update section labels. `buildOpeningContext` new-player branch (lines 66–79) — replace inline onboarding text with pointer to `character-creation.md`. |
| `mc-reference/mc-instructions.md` | Lines 33–38 — replace REFERENCE DOCUMENTS list with new paths. Lines ~462–480 — replace `new:` 14-bullet block with wizard pointer. |

**Deleted files (last task only):**

| Path |
|---|
| `mc-reference/rules-reference.md` |
| `mc-reference/wod-supplement.md` |
| `mc-reference/Reference-Docs/` (entire directory) |

---

## Task 1: Branch and baseline

**Files:**
- No files modified yet — setup only.

- [ ] **Step 1: Create a working branch**

```bash
cd "e:/Code/Fun Projects/city-of-shadows"
git checkout -b mc-reference-rework
```

- [ ] **Step 2: Confirm starting state is clean**

```bash
git status
```

Expected: `nothing to commit, working tree clean`. If not, stop and resolve unrelated changes first.

- [ ] **Step 3: Verify the source files we will convert exist**

```bash
ls mc-reference/Reference-Docs/*.txt mc-reference/Reference-Docs/World-of-Darkness/*.txt
```

Expected: 4 top-level `.txt` files (Basic Moves, MC Moves, Playbooks, Rules) and 8 WoD `.txt` files (Changeling, Demon, Hunter, Mage, Orpheus, Slasher, Vampire, Werewolf).

---

## Task 2: Convert `Rules.txt` → `reference/rules.md`

**Files:**
- Read: `mc-reference/Reference-Docs/Rules.txt`
- Create: `mc-reference/reference/rules.md`

- [ ] **Step 1: Read the source**

Open `mc-reference/Reference-Docs/Rules.txt`. It's a JSON object with `title` and `sections[]`. Each section has `id`, `title`, `text`, optional `subsections[]`, optional `note`, optional `optional: true`, optional `circle_themes[]`.

- [ ] **Step 2: Establish verification — list of section titles that MUST appear as headings in the output**

Extract every `title` field (top-level and nested `subsections[]`) from `Rules.txt`. Save the list mentally — you'll verify in step 5. Examples from the file: "The Conversation", "Framing Scenes", "Scene Variety", "Match the Pacing", "Hard Scene Framing", "What Do You Do?", "Fictional Positioning", "Moves and Dice", "Triggering Moves", "Rolling Dice", "Hits and Misses", "Weak Hits and Strong Hits", "Misses and Failures", "Moves and Uncertainty", "The Instinct Die", etc.

- [ ] **Step 3: Write `mc-reference/reference/rules.md`**

Structure:

```markdown
# Urban Shadows — Fundamentals of Play

## [Top-Level Section Title]

[The `text` field, verbatim — preserve paragraph breaks.]

### [Subsection Title]

[Subsection text, verbatim.]

> **Note:** [If `note` field present, surface it here.]
```

Rules:
- Every top-level section in the JSON becomes `## Title`.
- Every entry in `subsections[]` becomes `### Title`.
- `text` is copied verbatim — preserve `\n\n` paragraph breaks as real blank lines.
- `optional: true` sections (like The Instinct Die) get a `> **Optional:** This section is supplement-only.` callout under the heading.
- `circle_themes[]` (under The Instinct Die) becomes a Markdown table:
  ```
  | Circle | Theme | Description |
  |---|---|---|
  | Mortalis | Desperation | A moment of panic, rash action, or vulnerability. |
  ```
- `note` fields become `> **Note:** ...` after the section text.

- [ ] **Step 4: Run the verification grep**

```bash
grep -c "^## " mc-reference/reference/rules.md
```

Expected: matches the count of top-level sections in the JSON (you counted in step 2 — typically 5–8).

```bash
grep -c "^### " mc-reference/reference/rules.md
```

Expected: matches the count of subsections.

- [ ] **Step 5: Spot-check three section titles round-trip**

```bash
grep -E "^## (The Conversation|Framing Scenes|Moves and Dice)$" mc-reference/reference/rules.md
```

Expected: 3 lines printed.

- [ ] **Step 6: Commit**

```bash
git add mc-reference/reference/rules.md
git commit -m "rework: convert Rules.txt to reference/rules.md"
```

---

## Task 3: Convert `Basic Moves.txt` → `reference/basic-moves.md`

**Files:**
- Read: `mc-reference/Reference-Docs/Basic Moves.txt`
- Create: `mc-reference/reference/basic-moves.md`

- [ ] **Step 1: Read the source**

JSON with `basicMoves[]`. Each move has: `id`, `name`, `trigger`, `stat`, `description`, optional `oppositionChooses[]`, optional `onTenPlus.{description,options[]}`, optional `options[]`, optional `questions[]`, optional `advanced.onTwelvePlus`.

- [ ] **Step 2: Write `mc-reference/reference/basic-moves.md`**

Structure (one entry per move):

```markdown
# Basic Moves

## Turn to Violence

**Trigger:** When you turn to violence.
**Roll:** Blood

[description prose]

- **10+:** [if `onTenPlus.description` present, list its `options[]` as sub-bullets]
- **7–9:** [parse from description]
- **Miss:** Hard MC move.

**Opposition chooses:**
- they inflict harm on you
- they put you in a bad spot
- they create an opening to flee

*Advanced (12+):* You inflict harm as established and take all 3 from the 10+ list.
```

Rules:
- `stat` field gets normalized: `"BLOOD"` → `Blood`, `"HEART"` → `Heart`, etc.
- The `description` field is the canonical prose — preserve verbatim, but format the 10+/7–9/Miss tiers as a bulleted list under the move name.
- Question lists (Figure Someone Out, Consult Your Contacts) become a `**Questions:**` block with each question as a bullet.
- `advanced.onTwelvePlus` becomes `*Advanced (12+):* …`.
- Preserve the order of moves from the JSON.

- [ ] **Step 3: Verify all moves present**

```bash
grep -c "^## " mc-reference/reference/basic-moves.md
```

Expected: equals `length(basicMoves[])` in the source — count the array entries.

- [ ] **Step 4: Spot-check three move names**

```bash
grep -E "^## (Turn to Violence|Persuade an NPC|Let It Out)$" mc-reference/reference/basic-moves.md
```

Expected: 3 lines.

- [ ] **Step 5: Commit**

```bash
git add mc-reference/reference/basic-moves.md
git commit -m "rework: convert Basic Moves.txt to reference/basic-moves.md"
```

---

## Task 4: Convert `MC Moves.txt` → `reference/mc-moves.md`

**Files:**
- Read: `mc-reference/Reference-Docs/MC Moves.txt`
- Create: `mc-reference/reference/mc-moves.md`

- [ ] **Step 1: Read the source**

JSON top-level keys: `mcBasicMoves[]` (strings), `mcCircleMoves{}` (Circle → array of strings), `instinctDie{description, optional, circleThemes{}, implementation[]}`, `extremeFailures{}` (Circle → {theme, playbooks{}}).

- [ ] **Step 2: Write `mc-reference/reference/mc-moves.md`**

Four top sections:

```markdown
# MC Moves

## MC Basic Moves

- Inflict harm or corruption
- Surface a conflict, ancient or modern
- [each entry from mcBasicMoves[] as a bullet]

## MC Circle Moves

| Circle | Moves |
|---|---|
| Mortalis | Adapt to the changing circumstances; Gather in numbers to confront a threat; Discover information that puts someone in danger; Remind someone of their mundane obligations |
| Night | … |
| Power | … |
| Wild | … |

## Instinct Die

[description prose from instinctDie.description]

> **Optional:** This is a supplement rule.

### Circle Themes

| Circle | Theme |
|---|---|
| Mortalis | Desperation — a moment of panic, rash action, or vulnerability. |
| Night | Hunger — an uncontrollable supernatural urge. |
| Power | Temptation — a lapse in control over magic or destiny. |
| Wild | Chaos — instinct or otherworldly nature taking over. |

### Implementation

1. [first item from implementation[]]
2. [second]
3. …

## Extreme Failures

### Mortalis — Desperation

#### The Aware

- **Fight or Flight** — You misinterpret a situation as a supernatural threat and escalate it dangerously.
- **Loose Lips** — You reveal crucial information to the wrong person.
- **Frozen in Fear** — You hesitate at a critical moment, allowing an enemy to act first.

#### The Hunter

- **Twitchy Trigger Finger** — …
- **Exhausted** — …
- **Reckless Pursuit** — …

[continue for The Sworn, The Veteran]

### Night — Hunger

[per-playbook subsections: The Vamp, The Wolf, The Spectre]

### Power — Temptation

[per-playbook subsections: The Oracle, The Wizard, The Tainted]

### Wild — Chaos

[per-playbook subsections: The Fae, The Imp]
```

Rules:
- Capitalization: Mortalis / Night / Power / Wild (not all-caps).
- Each extreme failure entry: `- **Name** — description.` (em-dash separates name from description).

- [ ] **Step 3: Verify all extreme-failure names are present**

```bash
grep -cE "^- \*\*[A-Z]" mc-reference/reference/mc-moves.md
```

Expected: equals total count of extreme-failure entries in source. Count by inspection — the file has 4 circles × 2–4 playbooks each × 3 failures each. From the source JSON the total is around 33 entries.

- [ ] **Step 4: Spot-check key terms**

```bash
grep -E "(Fight or Flight|Blood Frenzy|Spell Backlash|Glamour Gone Wrong|Demonic Compulsion|Rage Shift)" mc-reference/reference/mc-moves.md
```

Expected: at least 6 matches.

- [ ] **Step 5: Commit**

```bash
git add mc-reference/reference/mc-moves.md
git commit -m "rework: convert MC Moves.txt to reference/mc-moves.md"
```

---

## Task 5: Convert `Playbooks.txt` → `reference/playbooks.md`

**Files:**
- Read: `mc-reference/Reference-Docs/Playbooks.txt`
- Create: `mc-reference/reference/playbooks.md`

- [ ] **Step 1: Read the source**

JSON array of 12 playbook objects. Each has `id`, `name`, `description`, `moves{}` (with sub-arrays like `you_get_this_one[]`, `choose_three[]`, `corruption_moves[]` — exact key names vary by playbook), `special_mechanic{name,text}`, possibly `starting_stats{}`, `circle`, `starting_circle_status`.

- [ ] **Step 2: Write `mc-reference/reference/playbooks.md`**

Structure (one entry per playbook, in JSON order):

```markdown
# Playbooks

## The Aware

You ride the line between the mortal and supernatural worlds. Your friends and family are stuck firmly in the mundane realities of everyday life, and losing them costs you more than anyone.

**Circle:** Mortalis
**Primary Stats:** Heart, Spirit

### Special Mechanic — Your Mortal Relationships

While you ride the line between the mortal and supernatural worlds, your friends and family are stuck firmly in the mundane realities of everyday life. Choose 3: [full text from special_mechanic.text]

### Moves

#### Choose Three

- **I Know a Guy** — When you hit the streets to get what you need from a member of your Circle, roll with Heart instead of their Circle. On a 7-9, add this option to the list: however you find them requires you to offer a Debt to an intermediary.
- **Charming, Not Sincere** — Take +1 Heart (max+3).
- **The Lion's Den** — [full text]
- [continue for all moves]

#### Corruption Moves

- **[Name]** — [full text]

### Starting Stats

Pick one: [stat array if present in JSON]
```

Rules:
- Move category headings (`#### Choose Three`, `#### You Get This One`, `#### Corruption Moves`, `#### Choose Two More`, etc.) match the JSON sub-key names converted from snake_case to Title Case.
- Each move: `- **Name** — full text (verbatim from JSON)`.
- If a playbook has no `starting_stats` field, omit that subsection.
- Playbooks: The Aware, The Fae, The Hunter, The Imp, The Oracle, The Spectre, The Sworn, The Tainted, The Vamp, The Veteran, The Wizard, The Wolf — order from JSON.

- [ ] **Step 3: Verify all 12 playbooks present**

```bash
grep -cE "^## The " mc-reference/reference/playbooks.md
```

Expected: 12.

- [ ] **Step 4: Spot-check named moves across multiple playbooks**

```bash
grep -E "(I Know a Guy|Faerie Magic|Eternal Hunger|Let It Out|The Embrace|manifest)" mc-reference/reference/playbooks.md
```

Expected: at least 5 matches.

- [ ] **Step 5: Commit**

```bash
git add mc-reference/reference/playbooks.md
git commit -m "rework: convert Playbooks.txt to reference/playbooks.md"
```

---

## Task 6: Migrate WoD `.txt` files → `reference/world-of-darkness/*.md`

**Files:**
- Read: `mc-reference/Reference-Docs/World-of-Darkness/{Changeling,Demon,Hunter,Mage,Orpheus,Slasher,Vampire,Werewolf}.txt`
- Create: `mc-reference/reference/world-of-darkness/{changeling,demon,hunter,mage,orpheus,slasher,vampire,werewolf}.md`

- [ ] **Step 1: Read all 8 source files**

These are prose, not JSON. Each has its own loose structure — typically: opening "INFORMATION" block, then sections like CLANS / SECTS / DISCIPLINES (for Vampire), KITHS (for Changeling), AUSPICES / TRIBES (for Werewolf), etc. Plus altered moves and extension-specific advancement.

- [ ] **Step 2: For each file, produce a kebab-case `.md` with a summary block + light heading pass**

Template:

```markdown
# [Extension Name] — [Game Line Name]

**Base Playbook (natural pairing):** The [Playbook]
**Prerequisite Move:** [Move name from spec mapping]
**Key Mechanics:** [one-line summary from existing supplement table]

---

[Original content from .txt, with two cleanups:]

1. ALL CAPS section headers like "CLANS" become `## Clans`.
2. ALL CAPS sub-headers like "BANU HAQIM" become `### Banu Haqim`.
3. Sub-fields inline in prose like `Trait: Law of Judgment -- Mark Experience when ...` become Markdown:
   ```
   **Trait:** Law of Judgment — Mark Experience when …
   **Sect:** Independent or Camarilla …
   **Disciplines:** Blood Sorcery, Celerity, and Obfuscate.
   ```

Otherwise preserve content verbatim.
```

Specific natural-pairing/prerequisite mappings for the summary blocks:

| File | Base Playbook | Prerequisite Move |
|---|---|---|
| `vampire.md` | The Vamp | The Embrace |
| `mage.md` | The Wizard | Channeling |
| `orpheus.md` | The Spectre | manifest abilities |
| `werewolf.md` | The Wolf | (none explicit — note "natural shifter") |
| `changeling.md` | The Fae | Faerie Magic |
| `demon.md` | The Tainted | (extension-specific — check source) |
| `hunter.md` | The Hunter | (Compact/Conspiracy induction — check source) |
| `slasher.md` | Any Mortalis | (check source) |

If the source doesn't make the prerequisite explicit, write `(see extension induction rules below)` rather than fabricating one.

- [ ] **Step 3: Verify each new file exists**

```bash
ls mc-reference/reference/world-of-darkness/
```

Expected output: `changeling.md  demon.md  hunter.md  mage.md  orpheus.md  slasher.md  vampire.md  werewolf.md`

- [ ] **Step 4: Spot-check that key extension content carried over**

```bash
grep -l "Lasombra" mc-reference/reference/world-of-darkness/vampire.md
grep -l "Acanthus\|Obrimos\|Thyrsus" mc-reference/reference/world-of-darkness/mage.md
grep -l "Banshee\|Haunter\|Poltergeist" mc-reference/reference/world-of-darkness/orpheus.md
grep -l "Daystar\|Diablerie\|Embrace" mc-reference/reference/world-of-darkness/vampire.md
grep -l "Channeling\|Spell-hold\|Awakening" mc-reference/reference/world-of-darkness/mage.md
grep -l "Blink\|Manifestation\|Shade" mc-reference/reference/world-of-darkness/orpheus.md
```

Expected: each command prints its own file path (means at least one match found).

- [ ] **Step 5: Commit**

```bash
git add mc-reference/reference/world-of-darkness/
git commit -m "rework: migrate WoD .txt files to reference/world-of-darkness/*.md"
```

---

## Task 7: Write `character-creation.md` wizard

**Files:**
- Create: `mc-reference/character-creation.md`

- [ ] **Step 1: Create the file with the top-of-doc rule and 13-phase structure**

Write `mc-reference/character-creation.md`:

```markdown
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
- [... continue for all 12]

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
```

- [ ] **Step 2: Verify the file has all 13 phases**

```bash
grep -c "^## Phase " mc-reference/character-creation.md
```

Expected: 13.

- [ ] **Step 3: Verify the player-facing onboarding rule is present**

```bash
grep -c "Player-Facing Onboarding Rule" mc-reference/character-creation.md
```

Expected: 1.

- [ ] **Step 4: Commit**

```bash
git add mc-reference/character-creation.md
git commit -m "rework: add character-creation.md onboarding wizard"
```

---

## Task 8: Add unit test for `loadSystemPrompt` paths

**Files:**
- Create: `bot/test/mc-system-prompt.test.js`

- [ ] **Step 1: Read the current `bot/handlers/mc.js`**

Confirm the structure of `loadSystemPrompt` (lines 23–41). It calls `readFile` from `./github.js` for each path, then concatenates the results with section labels into a `---`-separated string.

- [ ] **Step 2: Write the failing test**

Create `bot/test/mc-system-prompt.test.js`:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';

// Mock the github module BEFORE importing mc.js.
// We use a custom loader trick: define a fake module via Node's experimental loader,
// or stub at runtime by reassigning. Easiest: use dynamic import + dependency injection
// since mc.js imports readFile directly, we can't easily monkey-patch in ESM.
// Instead, validate paths by reading mc.js source.

import { readFile as fsReadFile } from 'node:fs/promises';

test('loadSystemPrompt reads the canonical new-layout paths', async () => {
  const src = await fsReadFile(new URL('../handlers/mc.js', import.meta.url), 'utf8');

  const expectedPaths = [
    'mc-reference/mc-instructions.md',
    'mc-reference/reference/rules.md',
    'mc-reference/reference/basic-moves.md',
    'mc-reference/reference/mc-moves.md',
    'mc-reference/reference/playbooks.md',
    'mc-reference/reference/world-of-darkness/changeling.md',
    'mc-reference/reference/world-of-darkness/demon.md',
    'mc-reference/reference/world-of-darkness/hunter.md',
    'mc-reference/reference/world-of-darkness/mage.md',
    'mc-reference/reference/world-of-darkness/orpheus.md',
    'mc-reference/reference/world-of-darkness/slasher.md',
    'mc-reference/reference/world-of-darkness/vampire.md',
    'mc-reference/reference/world-of-darkness/werewolf.md',
    'mc-reference/character-creation.md',
    'mc-reference/npc-personality-engine.md',
    'mc-reference/state-schema.md',
    'mc-reference/bot-output-format.md',
  ];

  for (const path of expectedPaths) {
    assert.ok(
      src.includes(`'${path}'`),
      `mc.js does not reference path: ${path}`
    );
  }
});

test('loadSystemPrompt does not reference removed paths', async () => {
  const src = await fsReadFile(new URL('../handlers/mc.js', import.meta.url), 'utf8');

  const removed = [
    'mc-reference/rules-reference.md',
    'mc-reference/wod-supplement.md',
  ];

  for (const path of removed) {
    assert.ok(
      !src.includes(`'${path}'`),
      `mc.js still references removed path: ${path}`
    );
  }
});
```

- [ ] **Step 3: Run the test, expect failure**

```bash
cd "e:/Code/Fun Projects/city-of-shadows/bot"
node --test test/mc-system-prompt.test.js
```

Expected: FAIL. Failure message will say `mc.js does not reference path: mc-reference/reference/rules.md` (or similar for any new path that's not yet in the file).

- [ ] **Step 4: Commit the failing test**

```bash
git add bot/test/mc-system-prompt.test.js
git commit -m "test: add mc-system-prompt path verification (failing)"
```

---

## Task 9: Update `bot/handlers/mc.js` to new paths and new-player text

**Files:**
- Modify: `bot/handlers/mc.js`

- [ ] **Step 1: Replace `loadSystemPrompt` (lines 23–41)**

Edit `bot/handlers/mc.js`. The new function body:

```javascript
async function loadSystemPrompt() {
  const parts = await Promise.all([
    readFile('mc-reference/mc-instructions.md'),
    readFile('mc-reference/reference/rules.md'),
    readFile('mc-reference/reference/basic-moves.md'),
    readFile('mc-reference/reference/mc-moves.md'),
    readFile('mc-reference/reference/playbooks.md'),
    readFile('mc-reference/reference/world-of-darkness/changeling.md'),
    readFile('mc-reference/reference/world-of-darkness/demon.md'),
    readFile('mc-reference/reference/world-of-darkness/hunter.md'),
    readFile('mc-reference/reference/world-of-darkness/mage.md'),
    readFile('mc-reference/reference/world-of-darkness/orpheus.md'),
    readFile('mc-reference/reference/world-of-darkness/slasher.md'),
    readFile('mc-reference/reference/world-of-darkness/vampire.md'),
    readFile('mc-reference/reference/world-of-darkness/werewolf.md'),
    readFile('mc-reference/character-creation.md'),
    readFile('mc-reference/npc-personality-engine.md'),
    readFile('mc-reference/state-schema.md'),
    readFile('mc-reference/bot-output-format.md'),
  ]);
  const labels = [
    'MC Instructions',
    'Rules — Fundamentals of Play',
    'Basic Moves',
    'MC Moves',
    'Playbooks',
    'WoD — Changeling: The Lost',
    'WoD — Demon: The Descent',
    'WoD — Hunter: The Vigil',
    'WoD — Mage: The Awakening',
    'WoD — Orpheus',
    'WoD — Slasher',
    'WoD — Vampire: The Masquerade',
    'WoD — Werewolf: The Forsaken',
    'Character Creation Wizard',
    'NPC Personality Engine',
    'state.json Schema',
    'Bot Output Format',
  ];
  const sections = parts
    .map((content, i) => content && `# ${labels[i]}\n\n${content}`)
    .filter(Boolean);
  return sections.join('\n\n---\n\n');
}
```

- [ ] **Step 2: Update the new-player branch of `buildOpeningContext` (lines 66–79)**

Replace the inline onboarding text. New version:

```javascript
  if (isNew) {
    const [events, worldBible] = await Promise.all([
      readFile('game/events-log.md'),
      readFile('game/world-bible.md'),
    ]);
    return [
      `New player: Discord display name "${player.name}".`,
      'This is a new character. Walk them through onboarding by following',
      '`mc-reference/character-creation.md` phase-by-phase (already in your',
      'context). At session close, emit the close block with the full sheet,',
      'initial state_patch, npc_patch for any NPCs introduced, and the first',
      'handoff.',
      '',
      '--- RECENT WORLD EVENTS (tail) ---',
      tail(events, EVENT_TAIL_LINES) || '(empty)',
      '',
      '--- WORLD BIBLE (excerpt) ---',
      (worldBible || '').slice(0, 4000) || '(none)',
      '',
      'Begin onboarding now.',
    ].join('\n');
  }
```

- [ ] **Step 3: Run the new test to verify it passes**

```bash
cd "e:/Code/Fun Projects/city-of-shadows/bot"
node --test test/mc-system-prompt.test.js
```

Expected: PASS on both tests.

- [ ] **Step 4: Run the full bot test suite to verify nothing else broke**

```bash
cd "e:/Code/Fun Projects/city-of-shadows/bot"
npm test
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add bot/handlers/mc.js
git commit -m "rework: update mc.js to new reference layout"
```

---

## Task 10: Update `mc-reference/mc-instructions.md`

**Files:**
- Modify: `mc-reference/mc-instructions.md`

- [ ] **Step 1: Replace the REFERENCE DOCUMENTS block (lines 33–38)**

Find the existing block (it starts with `**REFERENCE DOCUMENTS (already concatenated`). Replace the bulleted list of 5 files with:

```
**REFERENCE DOCUMENTS (already concatenated into this system prompt — no fetch required):**
- `mc-reference/reference/rules.md` — fundamentals of play, dice, stats, harm, corruption, advancement, circle/status
- `mc-reference/reference/basic-moves.md` — all basic moves
- `mc-reference/reference/mc-moves.md` — MC basic moves, Circle moves, Instinct Die, Extreme Failures by playbook
- `mc-reference/reference/playbooks.md` — all 12 playbooks with full move text and special mechanics
- `mc-reference/reference/world-of-darkness/` — 8 WoD extension files (changeling, demon, hunter, mage, orpheus, slasher, vampire, werewolf), each with clans/kiths/sects/disciplines, altered moves, and extension-specific advancement
- `mc-reference/character-creation.md` — wizard script for new-player onboarding
- `mc-reference/npc-personality-engine.md` — NPC voice and personality scoring system
- `mc-reference/state-schema.md` — state.json field reference; required reading before any session close
- `mc-reference/bot-output-format.md` — how to emit your session-close output so the bot can write it back to GitHub
```

- [ ] **Step 2: Replace the `new:` block in the Onboarding section**

Find the existing `new:` block in the Onboarding section (around line 462–480). It's a YAML block listing 14 steps. Replace the entire `new:` block with:

```yaml
new:
  protocol: follow mc-reference/character-creation.md phase-by-phase
  output: at close, emit the full sheet, initial state_patch, npc_patch (for any NPCs introduced), and first handoff
```

Leave the surrounding paragraph "The bot creates the player's folder and files from the close block — there is no need to 'create files' during onboarding. You produce the content; the bot persists it." in place.

- [ ] **Step 3: Verify no orphan references to the old docs remain**

```bash
grep -nE "rules-reference\.md|wod-supplement\.md" mc-reference/mc-instructions.md
```

Expected: no output.

- [ ] **Step 4: Verify the new paths are mentioned**

```bash
grep -cE "mc-reference/reference/|character-creation\.md" mc-reference/mc-instructions.md
```

Expected: at least 8 matches.

- [ ] **Step 5: Commit**

```bash
git add mc-reference/mc-instructions.md
git commit -m "rework: update mc-instructions.md to point at new reference layout"
```

---

## Task 11: Smoke test — verify every loaded path resolves on local fs

**Files:**
- No code changes — verification only.

This task verifies that every path string in `bot/handlers/mc.js` matches an actual file in the working tree. Combined with the path-list unit test in Task 8, that's sufficient regression coverage without requiring a network round-trip to GitHub.

- [ ] **Step 1: Check the working tree is clean**

```bash
cd "e:/Code/Fun Projects/city-of-shadows"
git status
```

Expected: `nothing to commit, working tree clean`. All prior tasks should be committed.

- [ ] **Step 2: Run the path-existence verification**

Use Node to extract every `readFile('...')` argument from `mc.js` and check the file exists on disk:

```bash
cd "e:/Code/Fun Projects/city-of-shadows"
node --input-type=module -e "
import { readFile } from 'node:fs/promises';
import { access } from 'node:fs/promises';

const src = await readFile('bot/handlers/mc.js', 'utf8');
const paths = [...src.matchAll(/readFile\(['\"]([^'\"]+)['\"]\)/g)].map(m => m[1]);

let missing = [];
for (const p of paths) {
  try { await access(p); } catch { missing.push(p); }
}

if (missing.length) {
  console.error('Missing files referenced by mc.js:');
  missing.forEach(p => console.error('  - ' + p));
  process.exit(1);
}

console.log('OK — all ' + paths.length + ' paths in mc.js exist on disk:');
paths.forEach(p => console.log('  ✓ ' + p));
"
```

Expected output: lists 17 paths, all prefixed with `✓`. Exit code 0.

If any path is missing, the script names it. Fix the underlying issue (typo in `mc.js`, missing file from a prior task, wrong subdirectory) before continuing.

- [ ] **Step 3: Re-run the unit test from Task 8 for full regression**

```bash
cd "e:/Code/Fun Projects/city-of-shadows/bot"
npm test
```

Expected: all tests pass, including `mc-system-prompt.test.js`.

> **Note:** This smoke test does NOT hit the GitHub API. Once the branch merges to `main`, the bot will read from GitHub at runtime; if a path issue slips past the unit test + local fs check, you'll see it on next session start. The unit test ensures path strings are correct; the local check ensures the files exist. Together they cover the failure modes that can be detected before deploy.

---

## Task 12: Delete old files

**Files:**
- Delete: `mc-reference/rules-reference.md`
- Delete: `mc-reference/wod-supplement.md`
- Delete: `mc-reference/Reference-Docs/` (entire directory, including `World-of-Darkness/` subdirectory)

- [ ] **Step 1: Confirm smoke test passed in Task 11 before deleting anything**

This is the point of no return. If Task 11 reported any missing section, STOP and fix it before proceeding.

- [ ] **Step 2: Delete the two condensed reference docs**

```bash
rm mc-reference/rules-reference.md
rm mc-reference/wod-supplement.md
```

- [ ] **Step 3: Delete the old Reference-Docs directory**

```bash
rm -rf mc-reference/Reference-Docs
```

- [ ] **Step 4: Verify the deletions and final tree**

```bash
ls mc-reference/
ls mc-reference/reference/
ls mc-reference/reference/world-of-darkness/
```

Expected first command output (alphabetical):
```
Reference-Docs   <-- should NOT be here
bot-output-format.md
character-creation.md
mc-instructions.md
npc-personality-engine.md
reference
rules-reference.md   <-- should NOT be here
state-schema.md
wod-supplement.md    <-- should NOT be here
```

Actually expected (after deletes):
```
bot-output-format.md
character-creation.md
mc-instructions.md
npc-personality-engine.md
reference
state-schema.md
```

- [ ] **Step 5: Re-run the unit test from Task 8 to confirm nothing references the deleted paths**

```bash
cd "e:/Code/Fun Projects/city-of-shadows/bot"
node --test test/mc-system-prompt.test.js
```

Expected: both tests PASS.

- [ ] **Step 6: Commit**

```bash
cd "e:/Code/Fun Projects/city-of-shadows"
git add -A mc-reference/
git commit -m "rework: delete old rules-reference.md, wod-supplement.md, Reference-Docs/"
```

- [ ] **Step 7: Final branch status check**

```bash
git log --oneline mc-reference-rework ^main
```

Expected: ~11 commits — one per task that produced commits.

---

## Done

The branch `mc-reference-rework` now contains:
- `mc-reference/reference/` with normalized Markdown reference files
- `mc-reference/character-creation.md` wizard
- Updated `bot/handlers/mc.js` and `mc-instructions.md`
- Unit test for the system-prompt path list
- Old condensed docs and source `.txt` files removed

Open a PR or merge to `main` per your normal workflow. After merge, the bot's next session start will load the new layout.
