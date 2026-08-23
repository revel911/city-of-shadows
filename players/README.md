# Player and character state

- `index.json` registers fictional player characters.
- `by-id/<discord-id>/profile.json` stores human-player safety, mechanics depth,
  and broad play tendencies learned automatically from concrete in-session actions
  settings across all of that person's characters.
- `<character-id>/` stores one fictional character's sheet, mechanical state, and
  restart handoff.
- `_template/` and `_player_template/` define canonical initial shapes.

Safety data is player-scoped and must never be copied into public world events or
relationship data. See [`docs/DATA-MODEL.md`](../docs/DATA-MODEL.md).
