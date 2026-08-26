# MC reference index

This is the authority and retrieval map for the instruction library consumed by
the City of Shadows engine. It tells the model and maintainers which document
owns each rule and when the runtime loads it.

The live MC cannot follow repository links by itself. bot/handlers/mc.js must
explicitly load a file before the model can use its contents.

## Authority order

When documents overlap, use this order for the disputed subject:

1. [Basic Moves](reference/basic-moves.md), the active section of
   [Playbooks](reference/playbooks.md), or the active World of Darkness extension
   owns exact move text and listed outcomes.
2. [Mechanics Execution Contract](MECHANICS-CONTRACT.md) owns trigger routing,
   dice execution, mechanical authority, and persistence responsibility.
3. [State & Profile Schemas](state-schema.md) owns persisted player and character fields.
4. [Bot Output Format](bot-output-format.md) owns machine-readable tags and patches.
5. [MC Instructions](mc-instructions.md) owns agenda, principles, session procedure,
   and player-facing narration.
6. [Scene Engine](scene-engine.md) owns scene framing and variation.
7. Canonical named NPC and location truth always comes from game/, never here.

## Stable runtime core

These files are loaded into every play session, in the stable system-prompt
prefix. This index is loaded first so authority is clear before detailed rules.

| Link | Title | Information within | Runtime use |
|---|---|---|---|
| [README.md](README.md) | MC reference index | Authority, retrieval order, complete reference inventory, and load policy | Every session; routing metadata |
| [MECHANICS-CONTRACT.md](MECHANICS-CONTRACT.md) | Mechanics Execution Contract | Semantic move adjudication, bot/model boundaries, dice, advanced outcomes, Debts, clocks, automatic state, and mechanics depth | Every session; execution authority |
| [mc-instructions.md](mc-instructions.md) | City of Shadows — MC Instructions | MC agenda, principles, session phases, player agency, safety, document model, and shared-world conduct | Every session; narration authority |
| [scene-engine.md](scene-engine.md) | Scene Engine | Agenda, dramatic question, objectives, opposition, stakes, pressure intersections, pacing, and variation | Every session; silent scene planning |
| [reference/rules.md](reference/rules.md) | Urban Shadows — Fundamentals of Play | Conversation, fiction-first procedure, Circles, Status, Debts, harm, corruption, advancement, and core play principles | Every session; general rules |
| [reference/basic-moves.md](reference/basic-moves.md) | Basic Moves | Exact triggers, rolls, 7–9/10+/miss results, advanced outcomes, Circle moves, and Debt moves | Every session; exact move authority |
| [reference/mc-moves.md](reference/mc-moves.md) | MC Moves | Basic MC moves plus Circle-specific moves, principles, and consequence vocabulary | Every session; consequence selection |
| [npc-personality-engine.md](npc-personality-engine.md) | NPC Personality Engine | Four-axis personality interpretation, voice construction, conflict instincts, and cross-session consistency | Every session; interpretation only |
| [state-schema.md](state-schema.md) | State & Profile Schemas — Field Reference | Player profiles, character state, roster fields, ranges, ownership, and update responsibility | Every session; persistence semantics |
| [bot-output-format.md](bot-output-format.md) | Bot Output Format | Normal narration and hidden save, close, roll, checkpoint, and world-patch structures | Every session; machine interface |

## Creation and character-specific loading

| Link | Title | Information within | Runtime use |
|---|---|---|---|
| [character-creation.md](character-creation.md) | City of Shadows — Character Creation Wizard | Ordered onboarding phases, questions, captured choices, extension selection, first scene, and save requirements | New-character sessions only |
| [character-sheet-template.md](character-sheet-template.md) | Canonical Character Sheet Template | Required character-sheet headings, order, placeholders, and field layout | New-character sessions only |
| [reference/playbooks.md](reference/playbooks.md) | Playbooks | All Urban Shadows playbooks, starting mechanics, moves, gear, intimacy/end moves, corruption, and advancement | Full file for creation; active playbook section only for returning characters |

## World of Darkness extensions

New-character sessions receive all extensions so the player can choose. Returning
characters receive only the extension named in canonical state.

| Link | Title | Information within | Natural pairing |
|---|---|---|---|
| [Changeling](reference/world-of-darkness/changeling.md) | Changeling — Changeling: The Lost | Seemings, Kiths, Contracts, Seasonal Courts, moves, and advancement | The Fae |
| [Demon](reference/world-of-darkness/demon.md) | Demon — Demon: The Descent | Incarnations, Agendas, supernatural moves, and gang benefits | The Tainted |
| [Hunter](reference/world-of-darkness/hunter.md) | Hunter — Hunter: The Vigil | Creeds, conspiracies, equipment, abilities, and advancement | The Hunter |
| [Mage](reference/world-of-darkness/mage.md) | Mage — Mage: The Awakening | Paths, Orders, spell-hold, spells, moves, and advancement | The Wizard |
| [Orpheus](reference/world-of-darkness/orpheus.md) | Orpheus — Orpheus | Shades, Manifestation Forms, Horrors, gang benefits, and advancement | The Spectre |
| [Slasher](reference/world-of-darkness/slasher.md) | Slasher — Hunter: The Vigil supplement | Ripper Undertakings, murder legends, moves, and advancement | Any Mortalis playbook |
| [Vampire](reference/world-of-darkness/vampire.md) | Vampire — Vampire: The Masquerade | Clans, Sects, Disciplines, moves, gang benefits, and advancement | The Vamp |
| [Werewolf](reference/world-of-darkness/werewolf.md) | Werewolf — Werewolf: The Forsaken | Auspices, Tribes, moves, gang benefits, and advancement | The Wolf |

## Scheduled automation

| Link | Title | Information within | Runtime use |
|---|---|---|---|
| [city-keeper.md](city-keeper.md) | City Keeper | Evidence limits, reconciliation and city-turn patch format, bounded world motion, conflicts, and public-safety rules | Scheduled Keeper phases only; not loaded into play sessions |

## Retrieval rules

- Returning play loads the stable core, one playbook section, and at most one
  World of Darkness extension.
- Creation loads the stable core plus the creation wizard, sheet template, all
  playbooks, and all extensions.
- Do not load every reference merely because it exists. Selective loading keeps
  instructions relevant and the stable prefix cacheable.
- A new reference file must be added to this table and deliberately classified
  as stable, creation-only, character-specific, or scheduled automation.
- Run npm run validate:content after changing this tree.
