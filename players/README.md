# Player and character state

This directory separates a real Discord player from the fictional characters
they may control.

| Link | Title | Information within |
|---|---|---|
| [index.json](index.json) | Character roster | Canonical character IDs, names, ownership, sharing, and active registration |
| [by-id/](by-id/) | Player profiles | One profile per Discord snowflake containing safety, mechanics depth, character ownership, and broad non-sensitive play tendencies |
| [_player_template/profile.json](_player_template/profile.json) | Player profile template | Canonical initial shape for a new Discord-scoped player profile |
| [_template/state.json](_template/state.json) | Character state template | Canonical initial stats, harm, corruption, XP, Circles, gear, effects, playbook state, arcs, and session counters |
| [Character directories](./) | Character persistence | One folder per character containing sheet.md, state.json, handoff.md, and optional active checkpoint.json |

## Ownership and privacy rules

- Safety and mechanics depth are player-scoped and carry across that person’s
  characters.
- Character sheets, mechanical state, checkpoints, and handoffs are
  character-scoped.
- Safety data must never be copied into public events, relationships, world
  patches, ledgers, or dashboard data.
- state.json wins when prose and mechanical numbers disagree.
- The bot owns session counters, active arc derivation, range clamping, and
  deterministic mechanical reconciliation.

See the [World data model](../docs/DATA-MODEL.md) and
[State & Profile Schemas](../mc-reference/state-schema.md) for field-level rules.
