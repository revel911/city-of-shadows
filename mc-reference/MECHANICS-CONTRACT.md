# Mechanics Execution Contract

This is the authoritative boundary between the creative MC and deterministic bot
mechanics. It defines execution and persistence, not move text. Detailed move
outcomes remain canonical in `reference/basic-moves.md`, `reference/playbooks.md`,
and the active World of Darkness extension.

## Authority

- The MC decides when fiction triggers a move and narrates its consequences.
- The bot owns dice, canonical modifiers, result tiers, session numbering, state
  ranges, arc membership, and mechanical receipts.
- `state.json` is authoritative for character numbers.
- `game/debts.json` is authoritative for public Debt amounts.
- `game/arcs.json.character_ids` is authoritative for character involvement;
  `state.json.active_arc_ids` is a derived convenience index.
- Never ask a player to transcribe dice or calculate a modifier.

## Roll lifecycle

When a player action triggers uncertainty:

0. Read the player's words as **intent and method**, not permission to declare
   success. If one message contains several actions, stop at the first move
   trigger. Resolve only that move before advancing to any later intended action.

1. Name the fictional pressure and identify the canonical move.
2. Emit exactly one hidden structured request in the same response:

```text
<roll_request>{"move":"Keep Your Cool","modifier_type":"stat","modifier_key":"Spirit","circle":null,"forward":0,"reason":"Cross the buckling catwalk before it gives way"}</roll_request>
```

3. End the visible prose by asking the player to use `/roll`.
4. Stop. Do not narrate an outcome until the bot returns an authoritative result.
5. The bot reads the modifier from `state.json`, rolls 2d6, applies the capped
   modifier, records the Instinct Die, and injects the result into the session.
6. Narrate the result tier from that injected record. Never change its total,
   tier, or Extreme Failure flag.

An unopposed action with no meaningful risk can happen without a roll. Active
resistance, dangerous uncertainty, or consequential opposition cannot be waived
merely because the player described a confident or detailed method. In
particular, grabbing, striking, restraining, dragging, or forcibly removing a
capable NPC triggers Turn to Violence before the force succeeds.

For Circle moves, use `modifier_type: "circle"` and provide `circle`. For Refuse
to Honor a Debt, use `modifier_type: "status_difference"`, `circle`, and
`creditor_status`; the bot reads the actor's Status from canonical state. Basic city moves use the fixed stat listed in
`reference/basic-moves.md`; the bot overrides a contradictory requested stat.
Character-specific entries in `playbook_state.move_modifiers` override that
default—for example, a Storm Lord using Spirit to Persuade.

Modifiers are capped to -3 through +4 after forward/ongoing bonuses. A miss with
an Instinct Die of 1 triggers the active playbook's Extreme Failure.

## Mechanics depth

Mechanics depth changes presentation, never whether rules are executed:

1. Move, stat/Circle, dice, modifier, total, and tier are visible.
2. Dice, modifier, total, and tier are visible.
3. Compact dice, total, and tier are visible.
4. Only a low-fiction "Fate check" tier is visible.
5. The command acknowledgement is private and minimal; consequences are
   presented entirely through fiction.

At every depth the player still uses `/roll` when prompted. The MC must not hide
a required player decision or silently choose move options for them.

## Session close invariants

On every real close, even if `state_patch` is omitted, the bot:

- increments `last_session` exactly once;
- validates fixed stat and Circle keys and clamps documented ranges;
- derives `active_arc_ids` from `game/arcs.json`;
- records Circle marks associated with authoritative rolls;
- clears all four Circle marks and grants the resulting advance;
- retains structured holds, forward, ongoing effects, and `playbook_state`;
- advances ignored involved arcs after two untouched sessions;
- writes a public-safe mechanical receipt under
  `players/<character-id>/sessions/`.

The MC must not set `last_session` or `active_arc_ids`. It patches only values
changed by the fiction.

## Debts

Every public Debt has a stable `debt_*` ID, creditor, debtor, amount, and status
in `game/debts.json`. Use `<debt_patch>` during onboarding or session close when
a Debt is gained, spent, transferred, increased, or erased. Setting `amount` to
zero settles it. Do not encode the amount only in relationship labels.

Private or secret Debts cannot be stored in this public repository.

## Arc pressure and player echoes

- `escalation` is the canonical four-segment pressure clock (0-4).
- An arc explicitly included in `arc_patch` is touched and resets its
  `ignored_sessions` counter.
- An unresolved arc involving the active character gains one ignored-session
  mark when it is not touched. At two marks it gains one escalation, to a
  maximum of 4.
- Returning context includes detailed relevant arcs plus an identity-only world
  directory, preventing duplicate entities without flooding the prompt.
- At most one pending cross-player interaction is surfaced at session opening.

## Short-session health

A healthy async session usually contains a sharp opener, a meaningful player
choice, a consequential uncertainty or shared-world change, a visible reaction,
and a useful handoff. This is a review signal, not a formula: the bot records a
small pacing audit in the session receipt but never forces an unnecessary roll.
