# Bot Output Format

This document tells the MC how to format its output so the bot can read it. It supplements `mc-instructions.md`.

The bot is a Discord client that posts your messages directly to the player. Anything you write is sent verbatim **except** the close block, which is parsed and stripped before posting.

## Normal Turn

Just write narrative. The bot posts your message and waits for the player's reply. There is no slash-command vocabulary you need to use — the player rolls dice using Discord's `/roll` command (which produces raw 2d6), and you apply the modifier in the next turn.

Keep messages under ~1900 characters where possible. Longer messages get split on paragraph/line boundaries.

## Session Close

When the session is ending — the player has said something equivalent to "let's stop here", or you have reached a natural pause point — emit your normal closing narrative, then append a single `<close_session>` block **as the very last thing in your response**. The bot only treats the block as a real close when `</close_session>` is the trailing content of your message (only whitespace allowed after it). If you place it mid-response or quote the tag while explaining something, the bot will not close the session.

Everything inside the block is parsed by the bot and written to GitHub as separate commits. Everything outside the block is posted to the thread as your closing message.

### Close block schema

```
<close_session>
<player_id>kebab-case-id</player_id>

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

- **`<player_id>`** — required. Use the kebab-case folder name (e.g. `alex-chen`), not the display name.
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
