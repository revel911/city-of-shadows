# City of Shadows

An async TTRPG set in **Richmond, Virginia, 2026**, where Claude plays the Master of Ceremonies. Built on **Urban Shadows 2nd Edition** with a **World of Darkness supplement**.

The city is shared. Other people are playing other characters in the same world. What you do bleeds into their game; what they do bleeds into yours.

---

## Playing

You only need a Discord account.

1. Join the server → **https://discord.gg/f8VCHxVAqj**
2. Run `/play` in any channel. The bot replies with a menu — pick an existing character, or `+ New character` to onboard a new one (about 15 minutes; the MC walks you through playbook → stats → moves → gear → first scene).
3. The bot opens a private thread with you and the MC. Play happens there.

Sessions are async — start, stop, come back tomorrow. When you close a session, the MC writes a handoff so the next session can pick up exactly where you left off.

### Commands

**Play**

| Command | What It Does |
|---------|--------------|
| `/play [character]` | Opens a private session thread with the MC. With no arg, replies with a character-picker menu. Pass `character:<id>` to skip the menu, or `character:new` to start onboarding. |
| `/roll` | Rolls raw 2d6. The left die is the Instinct Die. The MC applies the stat modifier. |

**Your preferences** (player-scoped, replies are private to you)

| Command | What It Does |
|---------|--------------|
| `/prefs view` | DMs you your current profile — safety limits, mechanics depth, characters you own. |
| `/prefs mechanics <1-5>` | Sets how much of the engine the MC surfaces. 1 = full crunch (named moves, visible dice, stat math). 5 = pure narrative (mechanics fully hidden). Default 3. |
| `/prefs safety` | Shows your current hard/soft limits and where to edit them. |

**Look at your character** (replies are private to you)

| Command | What It Does |
|---------|--------------|
| `/sheet [character]` | Shows a character sheet. Defaults to yours if your Discord username matches a character name. |
| `/state [character]` | Shows the raw mechanical state for a character (stats, harm, XP, circles) as JSON. |

**Look at the world** (replies are visible to the channel)

| Command | What It Does |
|---------|--------------|
| `/events [n]` | Shows the N most recent entries from the public events log. Default 3, max 10. |
| `/npc <name>` | Looks up an NPC by id, name, or substring. |
| `/hub <name>` | Shows the doc for a neighborhood hub (Shockoe Bottom, The Fan, Downtown, University, Creighton Court, Oregon Hill). |
| `/arcs [status]` | Lists arcs filtered by status (default `active`; also `escalating`, `resolved`, `all`). |

---

## World State

The live state of the city — characters, NPCs, story arcs, public events — lives at:

**https://revel911.github.io/city-of-shadows/**

This is a read-only window into the world. The MC updates it at the end of every session.

---

## How It Works

The city's state — every NPC, arc, character sheet, handoff — lives as plain text files in this repository. A Discord bot routes player messages to Claude (Sonnet 4.6) with the relevant context loaded, and writes session results back to the repo when the session closes. The dashboard reads those same files and renders them.

No live GM. No prep. The world persists between sessions because the documents do.

### Player vs Character

The repo separates two things that look alike but aren't:

- A **player** is a Discord user. You have content-safety preferences and a mechanics-depth preference (how visible the rules engine is in MC narration). One person, one profile. Lives at `players/by-id/<your-discord-snowflake>/profile.json`.
- A **character** is a fictional PC you run — stats, sheet, gear, advances. One person can own multiple characters. Lives at `players/<character-slug>/`.

Player-scoped data (safety, mechanics depth) carries forward across every character you create. You set safety once during player-onboarding the first time the MC meets you; you tune mechanics depth once at the end of your first session (one-shot calibration prompt), and from there `/prefs mechanics N` is the way to change it.

The 5-level mechanics scale runs **1 (open table — named moves, visible dice and modifiers, stat math)** to **5 (pure narrative — no rolls visible, no move names, no stat references)**. The bot still rolls dice and applies rules at every level — only the surface of the narration changes.

---

## Running Your Own

Want to host your own instance? See [docs/OPERATOR.md](docs/OPERATOR.md) for the full setup: forking the repo, deploying the bot to Fly.io, creating the Discord app, linking your Anthropic key, and onboarding your first player.
