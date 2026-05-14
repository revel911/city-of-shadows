# City of Shadows — Operator Guide

End-to-end setup for running your own instance of City of Shadows. If you just want to play, see the [README](../README.md).

---

## Architecture

| Piece | What It Does |
|-------|-------------|
| **This repo** | Single source of truth for all game state (plain text + JSON). |
| **`dashboard/`** | Static site published to GitHub Pages. Read-only window into the world. |
| **`bot/`** | Node.js Discord bot. Routes player messages to Claude, writes session results back to GitHub. |
| **`mc-reference/`** | System prompt for the MC. Loaded into Claude's context on every session. |
| **`game/`, `hubs/`, `players/`** | The world state. The MC reads it at session start and patches it at session close. |

**Player flow**

1. Player runs `/play` in Discord. The bot replies with a menu listing every character plus a `+ New character` entry.
2. Player picks one. The bot opens a private thread, loads the character's handoff, sheet, state, recent events, and MC instructions, then asks Claude (`claude-sonnet-4-6`) for the opening scene.
3. Player and Claude trade messages in the thread.
4. When the session ends, Claude emits a `<close_session>` block. The bot parses it and writes updates back to GitHub: handoff, state.json, events log, NPCs, arcs.
5. The dashboard reflects the new world state on next refresh.

Discord identity isn't bound to characters — anyone in the guild can pick any character. If a character is currently in an open session thread, `/play` blocks a second attempt until that thread is archived.

---

## Setup

### Prerequisites

- A GitHub account
- An Anthropic API key with credits
- A Discord account and a Discord server you control
- Node.js 20+ locally
- A Fly.io account (free tier works) for hosting the bot

### 1 — Repo

Fork or clone this repo to your GitHub account. Make it public (GitHub Pages and the dashboard's raw-content reads need it).

Edit [dashboard/app.js](../dashboard/app.js) and replace `revel911` with your GitHub username:

```javascript
const CONFIG = {
  GITHUB_RAW: 'https://raw.githubusercontent.com/revel911/city-of-shadows/main',
};
```

Commit and push.

### 2 — GitHub Pages

In your repo settings → **Pages**, set the source to **GitHub Actions**. The included workflow at [.github/workflows/pages.yml](../.github/workflows/pages.yml) deploys the `dashboard/` folder on every push to `main`.

After the first deploy, your dashboard will live at:
```
https://YOUR_GITHUB_USERNAME.github.io/city-of-shadows/
```

### 3 — GitHub fine-grained token (for the bot)

The bot writes session results back to this repo. Create a fine-grained personal access token:

1. GitHub → **Settings** → **Developer settings** → **Personal access tokens → Fine-grained tokens**
2. Repository access: **Only this repo** → `city-of-shadows`
3. Repository permissions: **Contents: Read and write**
4. Copy the token. You'll set it as a bot secret in step 6.

### 4 — Discord app and bot

1. Go to [discord.com/developers/applications](https://discord.com/developers/applications), click **New Application**.
2. **Bot** tab → reset and copy the **Bot Token**.
3. **Bot** tab → enable **Message Content Intent**.
4. **General Information** tab → copy the **Application ID** (this is `DISCORD_CLIENT_ID`).
5. **Installation** → **Install Link** → choose **Discord Provided Link** with scopes `applications.commands` and `bot`, and bot permissions: **Send Messages**, **Create Private Threads**, **Send Messages in Threads**, **Read Message History**.
6. Open the install link in a browser and add the bot to your server.
7. In Discord, right-click your server icon → **Copy Server ID** (this is `DISCORD_GUILD_ID`; enable Developer Mode in user settings first if needed).
8. (Optional) Create a `#world-events` channel and copy its ID for `WORLD_EVENTS_CHANNEL_ID`.

### 5 — Anthropic API key

Get one at [console.anthropic.com](https://console.anthropic.com). The bot uses `claude-sonnet-4-6`.

### 6 — Deploy the bot to Fly.io

```bash
cd bot
npm install                 # local install for the command deploy below
fly auth login              # one-time
fly launch --no-deploy      # accepts existing fly.toml; pick a unique app name when prompted
fly secrets set \
  DISCORD_TOKEN=... \
  DISCORD_CLIENT_ID=... \
  DISCORD_GUILD_ID=... \
  ANTHROPIC_API_KEY=... \
  GITHUB_TOKEN=... \
  GITHUB_OWNER=YOUR_GITHUB_USERNAME \
  WORLD_EVENTS_CHANNEL_ID=...
fly deploy
```

Register the slash commands once (this can be run locally with `bot/.env` populated, or via `fly ssh console -C "node deploy-commands.js"`):

```bash
node deploy-commands.js
```

You should see `Registered 2 commands (guild ...).`

### 7 — First session

In your Discord server, run:

```
/play
```

The bot replies (ephemerally) with a select menu listing every character in [players/index.json](../players/index.json) plus a `+ New character` entry. Pick one and the bot opens a private session thread. Reply in the thread to play. When you're ready to stop, tell the MC you're ending the session — Claude will write its final beat and emit a close block. The bot writes the handoff, state, events log, and any NPC/arc updates back to GitHub as separate commits, then archives the thread.

To skip the menu, pass `character:<id>` directly (e.g. `/play character:alex-chen`). Use `character:new` to jump straight into onboarding — the MC walks through playbook → stats → moves → gear → debts/circles → first scene, and on close writes a new `players/<id>/` folder.

If someone is already in a session for the character you picked, `/play` blocks you with a link to the live thread. Wait for them to close (or the auto-archive at 24h of inactivity) and try again.

---

## Discord commands

| Command | What It Does |
|---------|--------------|
| `/play` | Replies with a menu of all characters plus `+ New character`. Pick one to open a private session thread with the MC. Pass `character:<id>` to skip the menu, or `character:new` to start onboarding directly. |
| `/roll` | Rolls raw 2d6. The left die is the Instinct Die. The MC applies the stat modifier in the next turn. |

---

## File map

```
city-of-shadows/
│
├── dashboard/                     Static site → GitHub Pages
│   ├── index.html
│   ├── style.css
│   └── app.js                     ← set GITHUB_RAW here
│
├── bot/                           Node.js Discord bot → Fly.io
│   ├── package.json
│   ├── Dockerfile
│   ├── fly.toml
│   ├── .env.example
│   ├── index.js                   Discord client bootstrap
│   ├── deploy-commands.js         One-time slash command registration
│   ├── commands/
│   │   ├── play.js                /play
│   │   └── roll.js                /roll
│   └── handlers/
│       ├── github.js              GitHub Contents API wrapper
│       ├── mc.js                  Anthropic API + context builder
│       └── session.js             Session state, close-block parser, write fan-out
│
├── game/                          World state (machine-readable + log)
│   ├── npcs.json
│   ├── arcs.json
│   ├── events.json
│   ├── interactions.json
│   ├── events-log.md
│   └── world-bible.md
│
├── hubs/                          Per-neighborhood lore
│   ├── index.json
│   └── *.md
│
├── players/                       Per-character state, sheet, handoff
│   ├── index.json                 Character roster (id + name)
│   ├── _template/
│   └── <player-id>/
│       ├── state.json
│       ├── sheet.md
│       └── handoff.md
│
├── mc-reference/                  System prompt — loaded on every session
│   ├── mc-instructions.md
│   ├── rules-reference.md
│   ├── wod-supplement.md
│   ├── npc-personality-engine.md
│   ├── state-schema.md
│   └── bot-output-format.md       ← teaches the MC the close-block format
│
└── .github/workflows/
    └── pages.yml                  Deploys dashboard/ to GitHub Pages
```

---

## How sessions persist across runs

The bot keeps in-memory per-thread message history (`messages[]`) **only while the session is live**. When the session closes (or the bot restarts), that history is discarded.

Continuity comes from documents, not chat history:
- `players/<id>/handoff.md` — last beat, who's present, mood, open threads
- `players/<id>/state.json` — mechanical state (stats, harm, XP, circles)
- `players/<id>/sheet.md` — character sheet
- `game/events-log.md` — public events log (tail loaded each session)
- `game/interactions.json` — pending player-to-player effects

Every session starts by feeding these into Claude's context. The MC reads them and drops the player back into the scene where they left off.

---

## Cost notes

- **Anthropic**: Each turn round-trips the full conversation. A 1-hour session is roughly 30-60 turns. Sonnet 4.6 with a ~30k-token system prompt and growing message history will run somewhere around $1-3 per session at current pricing — verify on your dashboard.
- **Fly.io**: A 256MB shared-cpu instance is well within the free tier.
- **GitHub**: Free for public repos.
- **Discord**: Free.

---

## Troubleshooting

**`/play` says a character is currently in a session**
→ Another open thread already exists for that character. Open the linked thread and close that session (or wait for Discord's 24h auto-archive), then try again.

**The bot never replies in the thread**
→ Check `fly logs` for errors. Most common: `ANTHROPIC_API_KEY` not set, or `MESSAGE CONTENT INTENT` not enabled on the Discord app.

**Session close commit fails**
→ Check that the GitHub token has **Contents: Read and write** on this repo and hasn't expired. The bot logs the GitHub error message to the thread.

**Dashboard shows nothing**
→ Confirm `GITHUB_RAW` in [dashboard/app.js](../dashboard/app.js) points at your username. Confirm the repo is public.

**Slash commands missing in Discord**
→ Re-run `node deploy-commands.js` with `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`, and `DISCORD_GUILD_ID` set.

**The MC emits a close block at the wrong time**
→ See [mc-reference/bot-output-format.md](../mc-reference/bot-output-format.md) for when close blocks should fire. If the MC is over-eager, adjust [mc-reference/mc-instructions.md](../mc-reference/mc-instructions.md) to be more conservative about session endings.
