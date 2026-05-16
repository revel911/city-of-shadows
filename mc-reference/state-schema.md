# State & Profile Schemas — Field Reference

This document covers the three machine-readable files the bot writes and the MC consumes:

- **`players/by-id/<discord_id>/profile.json`** — player-scoped (safety, mechanics_depth, ownership). One per Discord user.
- **`players/<character-id>/state.json`** — character-scoped (stats, harm, circles, gear). One per character.
- **`players/index.json`** — character roster (slug → name → owner).

The dashboard reads profile.json (via owner_id), state.json, and index.json. The MC reads profile.json and state.json at session open and consults this doc for field semantics. When `handoff.md` and `sheet.md` disagree on a character-state number, `state.json` is the tiebreaker — keep it accurate.

**Templates:**
- `players/_player_template/profile.json`
- `players/_template/state.json`

---

## Player Profile — `players/by-id/<discord_id>/profile.json`

Player-scoped data, keyed by Discord snowflake. Single source of truth for safety and narration preferences across every character a player owns.

```json
{
  "discord_id": "123456789012345678",
  "display_name": "Tommy",
  "safety": {
    "hard_limits": [],
    "soft_limits": []
  },
  "mechanics_depth": 3,
  "mechanics_depth_set": false,
  "characters": ["robert-lagrange", "chris-caustes"]
}
```

| Field | Type | Notes |
|---|---|---|
| `discord_id` | string | Numeric Discord snowflake. Authoritative key. |
| `display_name` | string | Fetched from Discord at first onboarding; editable via `/prefs`. |
| `safety.hard_limits` | string[] | Content that must not appear in fiction at all. Captured during player-onboarding. Player-scoped — applies to every character the player runs. |
| `safety.soft_limits` | string[] | Content the MC should fade to black on. |
| `mechanics_depth` | int (1–5) | Narration-style preference. See `mc-instructions.md` for the 5-level rubric. Default 3. |
| `mechanics_depth_set` | bool | `false` until the player has answered the post-session-1 calibration prompt. The bot uses this to decide whether to fire the prompt at session close. |
| `characters` | string[] | Character slugs (folder names) this player owns. Reverse index; mirrored by `owner_id` per-entry in `players/index.json`. |

The MC does not write profile.json directly. The bot writes it from a parsed `<save_player>` block during player-onboarding, from a `profile_patch` inside a `<close_session>` block during the carryover-confirm beat, or from `/prefs` slash-command invocations.

---

## Character Roster — `players/index.json`

Top-level array of character entries. The bot uses it for both name resolution and ownership lookup.

```json
[
  { "id": "character-slug", "name": "Character Name", "owner_id": "123456789012345678" }
]
```

| Field | Type | Notes |
|---|---|---|
| `id` | string | Character folder slug under `players/`. |
| `name` | string | Display name. Derived from `state_patch.character_name` first, sheet H1 second, title-cased slug third. |
| `owner_id` | string | Discord snowflake of the player who owns this character. Mirrors the matching entry in the player's `profile.json.characters`. |

---

## Character State — `players/<character-id>/state.json`

Per-character mechanical state. The dashboard reads it. The MC reads it at session open.

**Template:** `players/_template/state.json`

---

## Field Reference

### Identity

| Field | Type | Source on sheet |
|---|---|---|
| `character_id` | string | Folder name, kebab-case (e.g. `"chris-caustes"`) |
| `character_name` | string | Sheet title / full name line |
| `playbook` | string | Playbook line (e.g. `"The Wizard"`) |
| `wod_extension` | string | WoD supplement + subtype (e.g. `"Mage: The Awakening (Acanthus / Silver Ladder)"`) |

---

### Stats

```json
"stats": {
  "Blood":  0,
  "Heart":  0,
  "Mind":   0,
  "Spirit": 0
}
```

**Source:** Stats table on sheet. Four stats only — Blood, Heart, Mind, Spirit. No others.

Values are signed integers exactly as written on the sheet (e.g. `+2 → 2`, `-1 → -1`, `0 → 0`).

---

### Harm & Progression

| Field | Type | Range | Source |
|---|---|---|---|
| `harm` | int | 0–5 | Count of filled harm boxes. One Faint + two Serious + two Critical = 5 total. At 5 the character dies (triggers end move). |
| `corrupt` | int | 0–5 | Count of filled corruption boxes. |
| `xp` | int | 0–7 | Current XP marks remaining before next advance triggers. |
| `advances` | int | 0+ | Total advances taken, including Session 0 character creation advances. |

---

### Circles

```json
"circle_ratings": {
  "Mortalis": 0,
  "Night":    0,
  "Power":    0,
  "Wild":     0
},
"circle_status": {
  "Mortalis": 0,
  "Night":    0,
  "Power":    0,
  "Wild":     0
}
```

**`circle_ratings`** — The **Rating** column in the Circles & Status table. This is the roll modifier added when acting in that circle's domain. Can be negative.

**`circle_status`** — The **Status** column. This is social standing within the faction. Affects story access, NPC reactions, and some move triggers. Typically 0+, but negative values are valid (actively blacklisted).

**If a sheet only has one column:** use that column's header to decide which field to populate. Set the other field to all zeros.

> Example — Johan van Axel's sheet has a single "Status" column:
> ```json
> "circle_ratings": { "Mortalis": 0, "Night": 0, "Power": 0, "Wild": 0 },
> "circle_status":  { "Mortalis": 1, "Night": 0, "Power": 0, "Wild": -1 }
> ```

**Never conflate the two fields.** Rating and Status are different numbers even when they share a value. Recording the wrong column into the wrong field is the most common state.json error.

---

### Gear

```json
"gear": ["item one", "item two"]
```

Transcribe verbatim from the Gear / Resources section of the sheet. Each entry is one item or resource (people, properties, and objects all count). Keep descriptions brief but unambiguous.

---

### Arcs & Session

| Field | Type | Source |
|---|---|---|
| `active_arc_ids` | string[] | Arc IDs from `game/arcs.json` where this character appears in `character_ids`. Update at session close when new arcs open or old ones resolve. |
| `last_session` | string | `"session_NNN"` zero-padded (e.g. `"session_001"`). Update at session close. |

---

### Playbook-specific tracks

Some playbooks introduce their own track beyond `harm` / `corrupt`. Only include the field if the playbook uses it.

| Field | Playbook | Range | Source |
|---|---|---|---|
| `trauma` | The Spectre | 0–5 | Trauma boxes per `reference/playbooks.md` Spectre Special Mechanic. Mark at session events; clear via trauma moves. |

---

### Notes

```json
"notes": "Free text."
```

MC-written. Use for: current situation summary, active carry-forward bonuses, pending rolls or holds, anything mechanical that isn't captured by the fields above. Keep it short — full narrative detail lives in `handoff.md`.

---

## Common Errors

| Error | Symptom | Fix |
|---|---|---|
| Spirit recorded as Ghost | `"Ghost": 1` in stats block | Rename to `"Spirit"` — stat names are fixed regardless of playbook |
| Used Status values as Rating | Numbers look plausible but wrong column | Cross-check against both columns on sheet |
| Shadow stat included | `"Shadow": 0` in stats block | Remove it — no playbook uses Shadow |
| faction_debts (old field name) | Key present in file | Rename to `circle_ratings`; add `circle_status` |
| circle_ratings all-zero for everyone | Unreviewed template copy | Confirm against sheet; all-zero is valid only if the sheet genuinely shows 0 for all |

---

## Updating state.json

Update at **session close**, after writing `handoff.md` and before confirming save. Fields that change each session:

- `harm` — re-count filled boxes
- `corrupt` — re-count filled boxes
- `xp` — update to current marks
- `advances` — increment if an advance was taken
- `circle_ratings` / `circle_status` — update if a circle-related advance was taken
- `active_arc_ids` — add newly opened arcs; remove fully resolved arcs
- `last_session` — increment
- `notes` — rewrite to reflect current state

Fields that rarely change: `stats`, `gear`, `character_id`, `character_name`, `playbook`, `wod_extension`.
