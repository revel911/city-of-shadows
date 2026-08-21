# City of Shadows — Vision

What this project is trying to be, and the principles that decide what gets built.
For how it works today see [ARCHITECTURE.md](ARCHITECTURE.md); for what has shipped
see [CHANGELOG.md](../CHANGELOG.md).

---

## Contents

- [The pitch](#the-pitch)
- [Why it exists](#why-it-exists)
- [Design pillars](#design-pillars)
- [The setting promise](#the-setting-promise-the-overwrite)
- [Where it's headed](#where-its-headed)
- [Non-goals](#non-goals)

## The pitch

A persistent, shared, supernatural city you can drop into for fifteen minutes or
an hour, any time, with no scheduling and no GM to wait on. You play one character
in **Richmond, Virginia, 2026** — a city quietly rewriting itself. Other people
play other characters in the same world. What you do bleeds into their game; what
they do bleeds into yours. The Master of Ceremonies never sleeps, never forgets,
and is always ready when you are.

It runs on **Urban Shadows 2nd Edition** for mechanics and a **World of Darkness**
supplement for lore, narrated by a language model whose only memory is the city's
own documents.

---

## Why it exists

Tabletop RPGs are extraordinary and hard to sustain. They need a table, a shared
calendar, and a GM willing to prep — and they collapse when any of those slip.
The result is that most people who would love this kind of play almost never get
to do it.

City of Shadows bets that the *experience* of a living world — consequences that
persist, NPCs with their own agendas, a setting that reacts — does not actually
require synchronous scheduling or a human running every scene. It requires:

1. **State that persists** between sessions, reliably and legibly.
2. **A narrator** that can hold tone, honor that state, and react in character.
3. **A shared world** so individual sessions add up to something bigger than any
   one player's story.

The platform is the minimum machinery to make those three true.

---

## Design pillars

These are the load-bearing commitments. Features are judged against them.

### 1. The documents are the truth
Game state is plain text and JSON in a Git repo — readable, diffable, forkable,
and outliving any process, model, or host. If the bot vanished tomorrow, the
world would still be sitting there, fully legible. We never introduce a store of
record that a human can't open in a text editor. *(See the architecture's "the
repository is the database" stance.)*

### 2. Async-first, never a second-class mode
Sessions start, stop, and resume on the player's clock. The handoff document is
the contract: every session must end leaving enough for the next one to begin
cleanly. We design for "come back tomorrow" as the default, not the exception.

### 3. One shared city
Players inhabit the same Richmond, the same NPCs, the same arcs. Actions leave
marks others can encounter — through the public events log, shared NPCs, and
asynchronous player-to-player interactions. The world is a commons, and that
shared continuity is the point.

### 4. Lore over mechanics, surfaced to taste
World of Darkness sets what is true; Urban Shadows is the engine underneath.
When they conflict, lore wins. And the *visibility* of the engine is the
player's choice: the mechanics-depth scale (1 = full crunch, 5 = pure narrative)
lets the same system serve a rules tinkerer and a pure-story player without
changing what actually happens under the hood.

### 5. Safety is a first-class, player-scoped setting
Content limits live on the player, are collected before play, and carry across
every character. They are honored by the narrator, not bolted on afterward.

### 6. The narrator is replaceable
The MC is reached through a provider-neutral interface and steered entirely by
documents — no fine-tuning, no lock-in. The model is an implementation detail we
expect to swap as the field moves (we already migrated Anthropic → DeepSeek).
The reference layer and the world are the durable assets.

---

## The setting promise: the Overwrite

The creative spine is **the Overwrite** — Richmond rewriting its own history, not
erasing but *adjusting*: dates shift, names change, outcomes blur, and only
certain people notice. It is a condition, not a villain. It gives every
neighborhood its own flavor of wrongness and gives a distributed, asynchronous
cast a single mystery to circle from different angles. The platform exists to let
that mystery accrete across many players and many short sessions into something no
single session could hold.

---

## Where it's headed

Directionally — not commitments, and not dates. These follow from the pillars
above.

**Make the shared world feel shared.** Asynchronous player-to-player interactions
exist in the model (the interaction tier system); the next frontier is making
their consequences vivid and discoverable — players bumping into each other's
fingerprints on the city without ever being online at the same time.

**Strengthen continuity guarantees.** The handoff/state/events contract is the
spine of async play. Investments here — richer state, better summarization,
tighter close-block validation — pay off directly in "the world remembered what I
did."

**Lower the operator floor.** Today running an instance means Fly.io, a GitHub
token, a Discord app, and a model key. The more of that we can template, automate,
or document away, the more shared cities can exist.

**Keep the narrator honest and affordable.** Context-cost management (caching,
compaction) and provider portability keep a long session from being expensive or
tied to one vendor — so the economics never force a worse experience.

**Deepen the world without bloating the prompt.** The reference layer and
world-bible can grow, but the system prompt is a budget. Future work leans toward
loading the *right* lore for a given scene rather than all of it every time.

---

## Non-goals

- **Not a real-time VTT.** No maps, initiative trackers, or synchronous tables.
  Async is the feature, not a limitation to engineer away.
- **Not a generic RPG engine.** This is opinionated about Urban Shadows + World
  of Darkness and about *this* city. Genericizing would dilute the thing that
  makes it work.
- **Not a database-backed app.** The moment state stops being plain files in Git,
  pillar #1 is gone. We don't.
- **Not a closed product.** It's meant to be forked and self-hosted. Lock-in —
  to a model, a host, or a hidden datastore — is a design smell here.
