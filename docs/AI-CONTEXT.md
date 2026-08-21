# AI context and review guide

## Contents

- [Where the world lives online](#where-the-world-lives-online)
- [How the model receives memory](#how-the-model-receives-memory)
- [Session lifecycle](#session-lifecycle)
- [Recommended AI review order](#recommended-ai-review-order)
- [Consistency review checklist](#consistency-review-checklist)

## Where the world lives online

The durable state is the configured GitHub repository and branch. For the hosted
instance in this repository:

- Source of truth: `https://github.com/revel911/city-of-shadows`, branch `main`.
- Read-only dashboard: `https://revel911.github.io/city-of-shadows/`.
- Dashboard data origin: `https://raw.githubusercontent.com/revel911/city-of-shadows/main`.

Local changes do not become model memory until they are committed and pushed to
the configured branch.

## How the model receives memory

DeepSeek does not browse GitHub. The bot is the retrieval layer:

1. `bot/handlers/github.js` reads files through GitHub's Contents API using
   `GITHUB_OWNER`, `GITHUB_REPO`, `GITHUB_BRANCH`, and `GITHUB_TOKEN`.
2. `bot/handlers/mc.js` assembles the stable MC reference prompt and a per-session
   opening context.
3. The opening context includes player preferences, handoff/sheet/state, recent
   events, interactions, and the canonical hub/NPC/location/relationship index.
4. The bot sends that material to the configured DeepSeek chat model.
5. The model returns narrative plus a trailing structured save block.
6. `bot/handlers/session.js` strips the block from player-visible text and writes
   its patches back to GitHub.

The model is stateless between sessions. GitHub files are memory; the bot makes
that memory available.

## Session lifecycle

```text
GitHub world files
       |
       v
bot builds canonical opening context
       |
       v
DeepSeek narrates the async session
       |
       v
bot parses close_session patches
       |
       v
GitHub world files + Pages dashboard
```

An active Discord thread also has an in-memory message array. It is disposable;
handoff and state files are the restart boundary.

## Recommended AI review order

For a new AI coding/review session, load only what the task needs, in this order:

1. `README.md` and `docs/README.md` for scope and navigation.
2. `docs/VISION.md` for product constraints.
3. `docs/ARCHITECTURE.md` for runtime boundaries.
4. `docs/DATA-MODEL.md` for file ownership and IDs.
5. The relevant directory README.
6. The specific implementation and tests being changed.

For narrative consistency review, begin with `game/README.md`, then read the
canonical entity files, affected hub docs, and only the relevant player handoffs.
Do not treat dated files in `docs/superpowers/` as current contracts.

## Consistency review checklist

- Does every new entity have one canonical ID?
- Does every reference resolve?
- Is an NPC's voice sourced from `game/npcs.json`, not duplicated prose?
- Are hub and location treated as different concepts?
- Is the change public-safe for this repository?
- Does the session close patch only fields that changed?
- Will another player's next opening context observe the result?
- Do `npm test` and `npm run build:graph` pass?
