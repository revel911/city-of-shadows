# MC reference index

This directory is the stable instruction layer concatenated into the model's
system prompt by `bot/handlers/mc.js`.

| File | Responsibility |
|---|---|
| `mc-instructions.md` | MC agenda, session phases, mechanics visibility, document model |
| `character-creation.md` | New-player and new-character wizard |
| `npc-personality-engine.md` | Voice-axis interpretation; never named NPC truth |
| `state-schema.md` | Character state contract |
| `bot-output-format.md` | Machine-readable save/close contract |
| `reference/` | Rules, moves, playbooks, and World of Darkness extensions |

Named NPCs and locations must not be defined here. Their canonical records live
under `game/` and arrive in the per-session world index.
