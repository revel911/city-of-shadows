# City of Shadows — Roadmap

Ideas we like but haven't committed to building. This is the space between
[VISION.md](docs/VISION.md) (why the project exists and the principles that decide
what gets built) and [CHANGELOG.md](CHANGELOG.md) (what has actually shipped).

Nothing here is scheduled. Items graduate out of this file into the codebase and
into the CHANGELOG when they're ready — until then they live here as captured
intent, not commitments.

## Status legend

- 💡 **Idea** — we like it; design is sketched, not settled. Not ready to build.
- 🔬 **Exploring** — actively prototyping or designing.
- 🛠️ **Committed** — agreed to build; tracked toward a CHANGELOG entry.

---

## 💡 NPC portrait faces in a defined style

Give the 51 (and growing) NPCs in [game/npcs.json](game/npcs.json) consistent
generated portrait art, so the dashboard and the relationship graph show faces
instead of initials.

**Why we like it.** The city is meant to feel inhabited. A wall of monogram
avatars reads like a CRM; a wall of faces reads like a world. Portraits also do
real work in the relationship graph below — a face is a faster anchor than a name.

**Shape of the work.**

- **Generate.** A script walks `npcs.json` and builds each prompt from the data we
  already have — `faction`, `role`, and `personality.voice_note` — then calls an
  image API (Flux / SDXL / `gpt-image`). Roughly $0.01–0.04 per image, so the whole
  roster is a couple of dollars.
- **Consistency is the whole problem.** All portraits must share one look. We lock
  that with a fixed style preamble plus a style-reference image (or a fixed seed),
  so a Mortalis detective and a Camarilla elder still feel like they came from the
  same illustrator. The tech is easy; the curation loop is the cost — expect to
  regenerate the ~30% that come out wrong on the first pass.
- **Store.** Add a `portrait` field to each NPC record; commit the files as
  `dashboard/assets/npcs/<id>.webp`. ~51 × ~60 KB ≈ 3 MB — fine for the repo, and
  GitHub Pages serves them for free.

**Open questions.**

- One house style, or per-faction styling (e.g. a colder palette for Mortalis)?
- Do PCs get portraits too, or do players supply their own?
- How do new NPCs get portraits — manual run after each batch of additions, or
  folded into the relationship-rebuild job below?

**Effort.** ~½ day to wire the generator and storage; then iterative cleanup at
our own pace. Difficulty is low; patience is the constraint.

---

## 💡 Relationship graph tab (PC ↔ NPC)

A new tab in the [dashboard](dashboard/) showing the web of ties between player
characters and NPCs — a force-directed graph with portrait nodes and labeled edges
(Sire, Enemy, Touchstone, Coworker, Parent, Ally, Knows Secret…), dark-themed to
match the existing UI.

**Why we like it.** Urban Shadows *is* its relationship web — Debts, Circles,
Status all live in who-owes-what-to-whom. Right now that structure is implicit,
scattered across sheets, the world-bible, and the events log. A graph makes the
city's social shape legible at a glance, for both players and the operator.

**Rendering — the easy part.** [cytoscape.js](https://js.cytoscape.org/) does
exactly this and drops in as a single CDN `<script>`, matching the dashboard's
no-build, vanilla-JS pattern (hash router in [dashboard/app.js](dashboard/app.js)).
A new `#/relationships` route mirroring the existing Characters / City / Events
tabs is roughly a day, including dark styling, colored rings by node type
(PC / vampire / mortal / faction), and curved labeled edges. Layout can be
pre-computed (see below) so positions stay stable instead of re-jiggling on every
load.

**Data — the real cost.** The edges don't exist yet. [game/npcs.json](game/npcs.json)
has zero relationship fields, and PCs live separately under [players/](players/).
So the work isn't the graph, it's authoring and *maintaining* ~50+ NPCs' worth of
ties. Schema direction: a standalone edge list (`game/relationships.json`) rather
than fields hung off each entity — edges span PC↔NPC and are easier for a job to
append to.

### Batch rebuild (the part we're keen on)

Rather than computing the graph live in the browser, **regenerate the relationship
data on a schedule** (once or twice a week) and stamp it with an "as of" date. This
fits the architecture: everything here is already GitHub-committed state produced
by jobs, and `npcs.json` already carries a `last_updated` field we'd mirror.

- **Mechanism.** A GitHub Action on a cron (e.g. Tue + Fri) runs a Node script,
  commits the result back, and GitHub Pages redeploys. The tab reads the committed
  file and shows a `Relationships as of {date}` badge. No live computation at page
  load.
- **What the job actually does (the version worth scheduling).** An LLM pass over
  recent [game/events-log.md](game/events-log.md),
  [game/interactions.json](game/interactions.json), and NPC notes *derives* and
  updates the relationship edges. Twice a week the graph reflects what's happened
  in play — without bloating the MC's per-session prompt with relationship
  bookkeeping. The "note saying so" reads `Derived from play through {date}`.
- **Don't let the model overwrite truth.** LLM-derived edges drift and hallucinate
  ties. Split the data:
  - `game/relationships.manual.json` — pinned, hand-curated truths (Sire, Parent,
    canonical alliances). The job **never** touches this.
  - `game/relationships.derived.json` — regenerated each run from recent play.
  - The tab renders the **union** of the two.
- **Optional: pre-compute layout.** A headless run can compute node positions once
  and commit them, so the browser just draws fixed coordinates — stable, hand-tuned-
  looking positions instead of a graph that resettles every visit. Stacks cleanly
  on top of the rebuild.

**The decision this resolves.** It gives relationship data a clear owner. Instead
of "the MC writes edges every session" (heavy prompt) or "hand-author once and let
it rot" (stale), a **twice-weekly derivation job owns the derived layer**, while the
manual layer stays human-curated. Lighter MC, self-maintaining graph.

**Open questions.**

- Cadence: is twice a week right, or does once a week (or on-demand) suffice given
  play volume?
- Which model runs the derivation — the bot's current `deepseek-chat`, or a
  separate pass?
- How do we audit a bad rebuild? (Commit diffs make this easy — each run is a
  reviewable PR/commit.)
- Edge confidence / recency: do faded or old ties decay visually?

**Effort.** Graph rendering ~1 day. Schema ~½ day. The derivation job + manual/
derived split ~1–2 days. Populating the initial manual core and tuning the prompt
is the open-ended part.

---

## Notes

These two ideas are linked: portraits make the relationship graph far more
readable, and the relationship rebuild job is the natural place to also top up
portraits for newly-added NPCs. If both get built, doing portraits first makes the
graph land better.
