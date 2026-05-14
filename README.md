# City of Shadows

An async TTRPG set in **Richmond, Virginia, 2026**, where Claude plays the Master of Ceremonies. Built on **Urban Shadows 2nd Edition** with a **World of Darkness supplement**.

The city is shared. Other people are playing other characters in the same world. What you do bleeds into their game; what they do bleeds into yours.

---

## Playing

You only need a Discord account.

1. Join the server → **https://discord.gg/f8VCHxVAqj**
2. Ask Tommy to link your Discord ID to a character (or to onboard a new one).
3. Run `/play` in any channel. The bot opens a private thread with you and the MC. Play happens there.

Sessions are async — start, stop, come back tomorrow. When you close a session, the MC writes a handoff so the next session can pick up exactly where you left off.

### Commands

| Command | What It Does |
|---------|--------------|
| `/play` | Opens a private session thread with the MC. With one character linked, uses it; with several, prompts for an id. `character:new` starts onboarding. |
| `/roll` | Rolls raw 2d6. The left die is the Instinct Die. The MC applies the stat modifier. |

---

## World State

The live state of the city — characters, NPCs, story arcs, public events — lives at:

**https://revel911.github.io/city-of-shadows/**

This is a read-only window into the world. The MC updates it at the end of every session.

---

## How It Works

The city's state — every NPC, arc, character sheet, handoff — lives as plain text files in this repository. A Discord bot routes player messages to Claude (Sonnet 4.6) with the relevant context loaded, and writes session results back to the repo when the session closes. The dashboard reads those same files and renders them.

No live GM. No prep. The world persists between sessions because the documents do.

---

## Running Your Own

Want to host your own instance? See [docs/OPERATOR.md](docs/OPERATOR.md) for the full setup: forking the repo, deploying the bot to Fly.io, creating the Discord app, linking your Anthropic key, and onboarding your first player.
