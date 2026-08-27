# Narrative, Rules, and World Engine

Status: implemented vertical slice, 2026-08-26.

## Runtime loop

```text
player fiction
  -> deterministic fast gate
  -> semantic move adjudicator (only when the fast gate is inconclusive)
  -> one canonical roll request
  -> bot-owned dice and modifier
  -> move-specific resolution contract
  -> narration and player-owned choices
  -> close reconciliation
  -> character state + mystery progress + arc pressure
  -> City Keeper candidate selection
  -> future scene candidates + public dashboard projection
```

The narrator is not the rules engine and narration is not the state record. The
bot owns dice, modifier sources, result tiers, required automatic changes,
revision reconciliation, derived mystery progress, and offscreen pressure
eligibility. The model interprets ambiguous fiction and presents consequences.

## Existing-system audit

Before this change the project already had strong narration, compact recaps,
revision-aware canonical patches, character state, arc escalation, mystery clue
maps, and a City Keeper. The gaps were orchestration gaps:

- basic move detection combined a narrow regex gate with narrator self-audit;
- move triggers had no machine-readable exclusions or prerequisites;
- the authoritative roll result did not carry a move-specific resolution plan;
- mystery state stored clues but did not derive stage or revelation progress;
- character knowledge and world truth were not explicitly separated in context;
- scene choice was based mainly on prose mode, not ranked canonical pressure;
- City Keeper could choose any eligible arc instead of receiving one
  deterministic candidate;
- dashboard arcs were descriptive and mysteries were absent from the graph.

## Reference analysis

| Source | Mechanic | Problem solved | Player / MC behavior | State and fictional consequence | Decision |
|---|---|---|---|---|---|
| Urban Shadows | Fictional move triggers, 2d6 tiers, Circle moves, Debts, corruption | Makes consequential fiction engage rules consistently | Player states intent and method; MC stops at the first trigger and follows the exact move | Rolls change harm, position, obligations, relationships, corruption, and Circle advancement | Adopt as the only player-facing move and dice authority |
| World of Darkness material in `mc-reference` | Supernatural identities, powers, weaknesses, factions, and thematic costs | Gives Urban Shadows moves setting-specific fictional weight | Use extension moves only when their exact trigger occurs; use lore as tags and consequences, not generic checks | Power use and faction action create concrete costs and persistent relationships | Adapt into active-sheet move extraction and world pressure; never replace Urban Shadows resolution |
| tremulus, pp. 92–113 and 156–165 | Keeper agenda, hazard impulses and moves, offscreen thinking, pressure tracks, clues on investigative moves | Keeps horror active and makes threats behave coherently without scripting scenes | Keeper acts from an established impulse, announces/foreshadows pressure, and gives a chance to respond before terminal harm | Hazards advance clocks, affect connected NPCs/places, and surface warnings | Adapt as arc agenda/impulse/next-pressure fields, ranked scene pressure, one City Keeper candidate, and cooldowns; reject arbitrary track advancement |
| Cthulhu Dark, pp. 13–19, 25–40, 43–50, 87–88 | Investigation always gives useful information; result controls amount, clarity, extra insight, and horror | Prevents clue bottlenecks and failed-roll dead ends | Any credible method can investigate; low results still reveal the minimum needed to continue | Discovery depth rises from core to deep/revelatory while danger, exposure, time, cost, or horror varies | Adapt as an investigation resolution profile; reject its dice pool, doomed-fighting rule, and Insight economy because Urban Shadows remains authoritative |

## Rules engine

`bot/handlers/move-adjudicator.js` defines all twelve rollable basic moves with:

- semantic trigger;
- explicit non-triggers;
- prerequisites;
- canonical modifier source from `mechanics.js`;
- exact Circle and creditor-Status requirements where applicable.

The fast gate handles obvious actions. The semantic adjudicator runs before
narration only for inconclusive returning-character turns and compares the turn
with every basic move plus rollable moves extracted from the active sheet.

Put a Name to a Face is deliberately narrow: it connects a person’s name and
face. Recalling or recognizing a symbol, sigil, emblem, logo, object, place, or
writing is not that move.

`bot/handlers/narrative-state.js` supplies a resolution contract after `/roll`
or a validated manual subtotal or individual-dice report for every basic move
and result tier. Manual subtotals need an Instinct follow-up only on a modified
miss. Resolution preserves player-owned choices, prevents a second action from
resolving before the first move, and requires consequences to be carried into
checkpoint and close state. A 12+ result uses an advanced outcome only when the
move is recorded in
`state.playbook_state.advanced_moves`.

Automatic bookkeeping currently includes canonical dice/modifiers, roll
receipts, Circle marks and advances, bot-owned session numbering and active arc
IDs, range clamping, and mandatory corruption from a weak-hit Let It Out. Other
changes remain choice- or fiction-dependent and are reconciled from close
patches rather than guessed.

## Investigation and mystery state

A credible investigation never returns “nothing” merely because the roll is
low. The profile is:

| Tier | Discovery | Clarity | Additional pressure |
|---|---|---|---|
| Miss | core actionable discovery | partial | hard consequence tied to the approach |
| 7–9 | core actionable discovery | clear | exposure, danger, time, ambiguity, or cost |
| 10+ | core plus deeper/supporting discovery | clear | none unless the move says otherwise |
| advanced 12+ | revelatory discovery or strong opportunity | clear | opportunity, not arbitrary immunity |

`game/mysteries.json` remains the canonical map. On every mystery patch the bot
derives `stage`, clue totals, and revelation support. Required revelations need
three linked clues. Clue discovery is monotonic under concurrent updates.

Character knowledge is a derived view of clues whose `discovered_by` contains
the active character. It is not duplicated into a second public file. The MC
receives both canonical mystery truth and a clearly labeled character-knowledge
projection, and must not let the character act on undiscovered truth.

## World and scene engines

Arcs are pressure entities. Their existing `status`, `escalation`, hub/NPC/PC
connections, summary, and revision remain canonical. The engine also understands
optional `agenda`, `impulse`, `next_pressure`, and `clock` fields; absent clocks
project from the existing 0–4 escalation value.

Scene candidates are ranked from relevant arcs and mysteries. Intersections that
share a character, NPC, hub, or parent arc receive priority. Before framing a
scene, the director must answer why the pressure acts now, what changes on
inaction, and which existing entity carries it. It connects before creating.
Terminal clocks cannot advance without player-facing warning and a chance to
respond.

A City Keeper turn receives exactly one deterministic eligible arc candidate.
Maxed, resolved, failed, closed, or cooling-down arcs are excluded. Output for a
different arc is rejected, and a touched arc receives a two-turn cooldown.
Reconciliation never invents new mystery truth.

## Dashboard and public-data boundary

The dashboard is a read-only projection, never the database. It now shows arc
agenda/next pressure when present, active mystery stage and globally discovered
clues, and mystery nodes/links in the world graph.

This is a public repository. “MC-only” and “character knowledge” are narrative
presentation boundaries, not access-control guarantees. Truly secret solutions,
private Debts, private player data, or per-character hidden knowledge require a
private store and must not be added to public game files or dashboard assets.

## Verification

The automated contract covers all twelve semantic definitions and all three
ordinary result tiers, advanced-move eligibility, symbol non-trigger behavior,
fail-forward investigation, monotonic mystery progress, character-specific
knowledge derivation, pressure intersections, deterministic City Keeper
selection/cooldowns, and automatic Let It Out corruption.
