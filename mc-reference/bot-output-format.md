# Bot Output Format

This document tells the MC how to format its output so the bot can read it. It supplements `mc-instructions.md`.

The bot is a Discord client that posts your messages directly to the player. Anything you write is sent verbatim **except** two structured blocks, which are parsed, processed, and stripped before posting:

- `<save_onboarding>` — emitted **once**, during onboarding, to persist the new character before play begins.
- `<close_session>` — emitted at session end to persist the handoff and final state, and to archive the thread.

## Normal Turn

Just write narrative. The bot posts your message and waits for the player's reply. There is no slash-command vocabulary you need to use — the player rolls dice using Discord's `/roll` command (which produces raw 2d6), and you apply the modifier in the next turn.

Keep messages under ~1900 characters where possible. Longer messages get split on paragraph/line boundaries.

**No code, no JSON, no schemas in player-facing turns.** Everything you write outside the `<close_session>` block is posted verbatim to the player's Discord thread. Never paste an NPC's `personality` block, an `npc_patch` entry, a `state_patch` fragment, or any other structured data into a normal turn — those belong **only** inside the close block. When introducing an NPC to the player (especially during onboarding Phase 9), describe them in prose: name, faction, where they're found, how they come across. The mechanical scoring (moral/order/manner/violence/voice_note) is yours alone — apply it silently in voice and behavior, and write it out only when you emit the `<npc_patch>` at close. The same applies to character sheets, state, debts, anchors: describe in prose during play; serialize only at close.

## Save Player (first-time Discord user — emitted once per player, before any character)

The first time the bot meets a Discord user, the MC runs a brief **player-onboarding phase** (see `mc-instructions.md`) that captures safety preferences. At the end of that phase, the MC emits a `<save_player>` block. The bot parses it and writes `players/by-id/<discord_id>/profile.json`. This block fires **exactly once per Discord ID** — every subsequent character creation by the same player skips player-onboarding entirely and reuses the existing profile.

### Save_player block schema

```
<save_player>
<discord_id>123456789012345678</discord_id>
<display_name>Tommy</display_name>
<safety>
{
  "hard_limits": ["..."],
  "soft_limits": ["..."]
}
</safety>
</save_player>
```

### Save_player field rules

- **`<discord_id>`** — required. The player's numeric Discord snowflake. The bot provides this to the MC in the system-prompt context whenever it sees a thread owned by a snowflake with no `profile.json`. Always copy it verbatim.
- **`<display_name>`** — optional. If omitted, the bot falls back to the Discord username it already has on hand.
- **`<safety>`** — required. JSON object with `hard_limits` and `soft_limits` arrays. Both arrays may be empty (`[]`) — empty is a valid answer to the safety question.

The MC does **not** emit `mechanics_depth` in this block. The bot sets that field to its default (3) and flag `mechanics_depth_set` to `false`, which lets the bot fire its one-shot calibration prompt automatically at the close of the player's first session. See `mc-instructions.md` for the 5-level rubric the MC uses to interpret the player's chosen value once it's been set.

After the bot writes `profile.json`, the same response (or the next turn) proceeds into character creation Phase 1 (Frame). Player-onboarding and character creation can both happen in a single thread session.

---

## Save Onboarding (new characters)

Character creation must be persisted to GitHub **before** the first scene begins. Emit a `<save_onboarding>` block when any of these triggers fires:

1. **Onboarding completes naturally.** You finish Phase 12 (character_id confirmed) and the player confirms the character is done. Before opening Phase 13, ask the player explicitly: *"Anything else to lock in before we drop into your first scene?"* If they're satisfied, emit `<save_onboarding>`, then open the scene in the same response.
2. **Player says "save".** Any phrasing equivalent to "save", "save my character", "commit what we have" — emit `<save_onboarding>` with whatever data is filled in. The sheet may still have TBD fields; that's fine.
3. **Player wants to start the story early.** Phrasings like "let's just start", "I'm ready to play", "skip the rest" — emit `<save_onboarding>` first with the current state, then open the first scene. Do not start play before the save is recorded.

The `<save_onboarding>` block MUST be the **first content** in your response, before any narrative. The bot extracts it and posts the trailing narrative to the thread. Putting the save block first protects the structured save from being truncated when your response is long — only the narrative tail can be lost to a length cap, and the narrative can be recreated on the next turn while a partial save cannot.

### Save block schema

```
<save_onboarding>
<character_id>kebab-case-id</character_id>

<sheet>
... full sheet.md content. REQUIRED. If onboarding is incomplete at save time, mark unfilled fields as "TBD" but include the sheet ...
</sheet>

<state_patch>
{ "character_name": "Joe Nakama", "stats": { "Blood": 1, "Heart": 0, "Mind": 2, "Spirit": -1 }, "harm": 0, "corrupt": 0, "xp": 0, ... }
</state_patch>

<npc_patch>
[ { "id": "npc_ximena_reyes", "name": "Ximena Reyes", "faction": "Mortalis", "personality": { "moral": 4, "order": 3, "manner": 4, "violence": 2, "voice_note": "..." }, ... } ]
</npc_patch>

<events_append>
... optional: if the character's arrival is publicly visible to the city ...
</events_append>
</save_onboarding>
```

### Save field rules

- **Position** — emit this block as the very first content of your response. Open with `<save_onboarding>`, close with `</save_onboarding>`, then write your scene narrative. Do not interleave.
- **`<character_id>`** — required. Kebab-case folder name (e.g. `joe-nakama`). The bot uses this to create the player's folder, write the sheet, and register the character in `players/index.json`.
- **`<sheet>`** — required. Full sheet content. If save is triggered early (case 2 or 3), include every section but use "TBD" for fields the player hasn't filled in yet.
- **`<state_patch>`** — strongly encouraged. Include `character_name` plus whatever mechanical state is set (stats, harm: 0, xp: 0, etc.). If stats aren't picked yet, omit and emit them via a later `<close_session>` `<state_patch>`.
- **`<npc_patch>`** — required if any NPCs were introduced during onboarding (Phase 9 Debts & Anchors, in particular). Full personality-engine scores.
- **`<events_append>`** — optional. Use only if the character's arrival is publicly visible.

The bot validates the save block before writing. If `character_id` or `sheet` is missing, the bot asks you to re-emit. **The thread is not closed by a save block** — play continues in the same session.

### Length & self-check

A complete `<save_onboarding>` for a fresh character typically runs 800–1500 characters. If your sheet has grown longer (lots of gear, long notes), keep an eye on total response length: opening a scene with rich narrative *after* the save block can push your full reply past the model's output cap and truncate the trailing narrative — that's the safe failure. If the save block itself is truncated, the character does not persist.

Before sending, verify three things:
1. The response opens with `<save_onboarding>`.
2. A matching `</save_onboarding>` appears before your scene narrative begins.
3. Every nested tag inside the block (`<character_id>`, `<sheet>`, `<state_patch>`, `<npc_patch>`) has a matching closing tag.

If you find yourself wanting to write a very long opening scene on the same turn as a save, prefer to keep the scene short — the next player turn will give you space to expand.

### When not to emit save_onboarding

- Returning-character session. `<save_onboarding>` is only for the first session of a new character. Returning players use only `<close_session>`.
- You already emitted one this session. The bot ignores duplicates.

## Session Close

When the session is ending — the player has said something equivalent to "let's stop here", or you have reached a natural pause point — emit your normal closing narrative, then append a single `<close_session>` block **as the very last thing in your response**. The bot only treats the block as a real close when `</close_session>` is the trailing content of your message (only whitespace allowed after it). If you place it mid-response or quote the tag while explaining something, the bot will not close the session.

Everything inside the block is parsed by the bot and written to GitHub as separate commits. Everything outside the block is posted to the thread as your closing message.

### Close block schema

```
<close_session>
<character_id>kebab-case-id</character_id>

<handoff>
... full handoff.md content (markdown or YAML, per current convention) ...
</handoff>

<sheet>
... full sheet.md content — only include if the sheet changed (new character, advance, etc.) ...
</sheet>

<state_patch>
{ "harm": 1, "xp": 2, "circle_status": { "Power": 2 } }
</state_patch>

<events_append>
... text to append to game/events-log.md ...
</events_append>

<npc_patch>
[
  { "id": "npc_marcus_velez", "status": "deceased" },
  { "id": "npc_ada_thorne", "player_interaction": "owes Alex a favor" }
]
</npc_patch>

<arc_patch>
[
  { "id": "arc-003", "escalation": 3, "status": "active" }
]
</arc_patch>

<interactions_patch>
{ "interactions": [
  { "from": "alex-chen", "to": "robert-lagrange", "effect": "left a sealed letter at the bar" }
] }
</interactions_patch>

<world_event>
A one-line summary suitable for the #world-events channel. Omit if nothing city-visible happened.
</world_event>
</close_session>
```

### Field rules

- **`<character_id>`** — required. Use the kebab-case folder name (e.g. `alex-chen`), not the display name.
- **`<handoff>`** — full replacement file, not a diff.
- **`<sheet>`** — full replacement file. Only emit when the sheet actually changes (character creation, advancement, gear shift). Omit otherwise.
- **`<state_patch>`** — partial JSON. Object fields are merged one level deep (so `{"stats":{"Mind":2}}` updates only Mind). Scalar fields replace.
- **`<events_append>`** — text appended to the end of `events-log.md`. Use markdown. Include a date/session header.
- **`<npc_patch>`** — array. Each entry must have `id` (format: `npc_<firstname>_<lastname>`, snake_case). Existing NPCs are merged by `id`; entries with new ids are appended as new NPCs. Always use the canonical `npc_*` id format — kebab-case or unprefixed ids will create duplicates.
- **`<arc_patch>`** — array. Each entry must have `id`. Existing arcs are merged; new ones are appended.
- **`<interactions_patch>`** — full replacement of the interactions document. Must be a JSON object with shape `{ "interactions": [...] }`. Omit to leave the queue unchanged.
- **`<world_event>`** — single short line. Posted to the configured `#world-events` channel if one is set. Omit for purely private scenes.

Any field you omit is skipped — the bot only writes fields that are present. If a field's content does not parse (bad JSON), the bot reports the error in-thread and continues with the rest.

### When not to emit a close block

- The session is mid-scene. The player walked away briefly. Just keep writing narrative.
- The player typed something that resembles "end" but you can tell from context they mean an in-fiction "end" (e.g. "I want to end this conversation with Marcus"). Do not close.

A close block exits the session: the thread is archived and the in-memory message history is dropped. Don't emit one unless you actually mean to end the session.
