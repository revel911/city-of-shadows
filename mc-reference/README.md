# MC reference index

This directory is the instruction library routed into the model by
`bot/handlers/mc.js`. Every session receives the stable mechanics core; returning
characters receive only their active playbook and World of Darkness extension.
New-character sessions temporarily receive the full creation library.

| File | Responsibility |
|---|---|
| `MECHANICS-CONTRACT.md` | Authoritative roll, persistence, Debt, arc-pressure, and mechanics-depth execution boundary |
| `mc-instructions.md` | MC agenda, session phases, mechanics visibility, document model |
| `character-creation.md` | New-player and new-character wizard |
| `npc-personality-engine.md` | Voice-axis interpretation; never named NPC truth |
| `state-schema.md` | Character state contract |
| `bot-output-format.md` | Machine-readable save/close contract |
| `reference/` | Rules, moves, playbooks, and World of Darkness extensions |

Authority order: `reference/basic-moves.md` owns move text;
`MECHANICS-CONTRACT.md` owns execution; `state-schema.md` owns persisted fields;
`bot-output-format.md` owns structured tags; `mc-instructions.md` owns narration.

Named NPCs and locations must not be defined here. Their canonical records live
under `game/` and arrive in the per-session world index.
