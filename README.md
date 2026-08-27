# City of Shadows

An async TTRPG set in **Richmond, Virginia, 2026**, where a language model plays the Master of Ceremonies. Built on **Urban Shadows 2nd Edition** with a **World of Darkness supplement**.

The city is shared. Other people are playing other characters in the same world. What you do bleeds into their game; what they do bleeds into yours.

---

## Contents

- [Playing](#playing)
- [World State](#world-state)
- [How It Works](#how-it-works)
- [Running Your Own](#running-your-own)
- [Documentation](#documentation)

## Playing

You only need a Discord account.

1. Join the server → **https://discord.gg/f8VCHxVAqj**
2. Run `/play` in any channel. The bot replies with a menu — pick an existing character, or `+ New character` to onboard a new one (about 15 minutes; the MC walks you through playbook → stats → moves → gear → first scene).
3. The bot opens a private thread with you and the MC. Play happens there.

Sessions are async — start, stop, come back tomorrow. When you close a session, the MC writes a handoff so the next session can pick up exactly where you left off.

Inside a session, ask a direct question to pause the fiction. For an
out-of-character comment, start the message with **OOC:** or **/ooc** (double
parentheses and double brackets also work). The MC answers without advancing
time, resolving an action, making a character-creation choice, or consuming a
pending roll. State your next in-fiction action or explicit choice to resume.

### Commands

**Play**

| Command | What It Does |
|---------|--------------|
| `/play [character]` | Opens a private session thread with the MC. With no arg, replies with a character-picker menu. Pass `character:<id>` to skip the menu, or `character:new` to start onboarding. |
| `/roll` | Resolves the MC's pending move from canonical character state, including the Instinct Die, modifier cap, result tier, and Extreme Failure trigger. |

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
| `/hub <name>` | Shows a neighborhood hub, including Shockoe Bottom, The Fan, Downtown, University, Creighton Court, Oregon Hill, Church Hill, and Carytown. |
| `/arcs [status]` | Lists arcs filtered by status (default `active`; also `escalating`, `resolved`, `all`). |

---

## World State

The live state of the city — characters, NPCs, story arcs, public events — lives at:

**https://revel911.github.io/city-of-shadows/**

This is a read-only window into the world. Sessions update it at close, and the bounded City Keeper reconciles continuity and advances eligible city pressure on schedule.

---

## How It Works

The city's state — every NPC, NPC-to-character memory, arc, character sheet, and handoff — lives as plain text files in this repository. A Discord bot routes player messages to a language model (DeepSeek `deepseek-chat`) with the relevant context loaded, and writes session results back to the repo when the session closes. The dashboard reads those same files and renders them.

No live GM. No prep. The world persists between sessions because the documents do.

### Player vs Character

The repo separates two things that look alike but aren't:

- A **player** is a Discord user. You have content-safety preferences, a mechanics-depth preference, and broad play tendencies learned from your in-session choices. Tendencies softly vary scenes; current actions override them, and romance/consent is never inferred. One person, one profile. Lives at `players/by-id/<your-discord-snowflake>/profile.json`.
- A **character** is a fictional PC you run — stats, sheet, gear, advances. One person can own multiple characters. Lives at `players/<character-slug>/`.

Player-scoped data (safety, mechanics depth) carries forward across every character you create. During player-onboarding the first time the MC meets you, you set safety and either pick a mechanics depth (1–5) or defer the choice. If you defer, the bot uses a balanced default (3) for the first session and asks you to calibrate once at session close. From there `/prefs mechanics N` is the way to change it at any time.

The 5-level mechanics scale runs **1 (open table — named moves, visible dice and modifiers, stat math)** to **5 (pure narrative — no rolls visible, no move names, no stat references)**. The bot still rolls dice and applies rules at every level — only the surface of the narration changes.

---

## Running Your Own

Want to host your own instance? See [docs/OPERATOR.md](docs/OPERATOR.md) for the full setup: forking the repo, deploying the bot to Fly.io, creating the Discord app, linking your DeepSeek key, and onboarding your first player.

## Documentation

Start at [docs/README.md](docs/README.md). The key references are [ARCHITECTURE](docs/ARCHITECTURE.md), [DATA MODEL](docs/DATA-MODEL.md), [AI CONTEXT](docs/AI-CONTEXT.md), [OPERATOR](docs/OPERATOR.md), and [VISION](docs/VISION.md).
