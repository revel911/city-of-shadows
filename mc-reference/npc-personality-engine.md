# NPC Personality Engine

Every NPC in `game/npcs.json` carries a `personality` block with four axes scored 1–5. Use these scores to voice the NPC consistently across sessions and across players. An NPC voiced by you in Johan's session must feel like the same person in Benjamin's session.

---

## The Four Axes

### Moral (1–5)
How flexible is their ethical code?

| Score | What It Means |
|-------|--------------|
| 1 | No moral constraints whatsoever. Will do anything. |
| 2 | Situational ethics. Rationalization is easy for them. |
| 3 | Mixed. Has lines they won't cross, but the lines move. |
| 4 | Principled. Their code is real, even if it's not conventional morality. |
| 5 | Rigid moral framework. Will sacrifice outcomes to maintain it. |

### Order (1–5)
Do they work within systems or around them?

| Score | What It Means |
|-------|--------------|
| 1 | Chaos agent. Systems exist to be broken. |
| 2 | Uses rules as cover, ignores them when inconvenient. |
| 3 | Pragmatic. Works within systems when useful, subverts when not. |
| 4 | Prefers legitimate channels; bends rules only under pressure. |
| 5 | True believer in hierarchy and process. |

### Manner (1–5)
How do they come across in interaction?

| Score | What It Means |
|-------|--------------|
| 1 | Openly hostile. Makes no effort to hide disdain. |
| 2 | Blunt, transactional. No warmth, but not aggressive. |
| 3 | Professional. Cordial when it serves a purpose. |
| 4 | Warm and engaging. People naturally trust them. |
| 5 | Magnetic. Disarming. Seems to genuinely care — whether or not they do. |

### Violence (1–5)
How quickly do they reach for it?

| Score | What It Means |
|-------|--------------|
| 1 | Violence is off the table. They will flee or fold first. |
| 2 | Avoids violence; uses it only as absolute last resort. |
| 3 | Willing to threaten; carries through if pushed. |
| 4 | Comfortable with violence. Doesn't prefer it but doesn't flinch. |
| 5 | Violence is a primary tool. Uses it early and without guilt. |

---

## Response Length & Register

**The Manner score controls response length, not the scene's stakes.** A high-stakes moment does not turn a Manner 1 NPC into an articulate explainer. Pressure might make them colder, shorter, more dangerous — not more verbose.

| Manner | Response register |
|--------|------------------|
| 1 | One to three words. Grunts, dismissals, nothing cushioned. Hostility leaks through silence and posture, not speech. |
| 2 | Short sentences. Information only. No pleasantries. They say the minimum required. |
| 3 | Enough to complete the transaction. Professional cadence. Neither warm nor cold. |
| 4 | Conversational. May volunteer context unprompted. Uses names. You feel like they're paying attention. |
| 5 | Warm — but not necessarily long. Warmth is not verbosity. A Manner 5 NPC can still be brief; they just make you feel good about it. |

**The `voice_note` overrides axis scores when they conflict.** If an NPC's voice_note says "clipped questions, never explains," that beats a Manner 4 rating every time. The voice_note is the most specific calibration — it is always the primary source.

**Anti-default:** Never write an NPC as formal and articulate unless their scores and voice_note support it. "Formal and articulate" is Manner 3–4 behavior. Applying it universally flattens every character into the same register. Check the scores. Use them.

---

## Behavioral Signatures by Score

Use `voice_note` in the personality block as the most specific guidance. The axis scores give you the frame; the voice_note gives you the texture.

**High Moral (4–5):** Explains their reasoning. References past decisions as binding precedent. Visibly uncomfortable when pushed to compromise.

**Low Moral (1–2):** Doesn't justify. Does what serves the moment. May express regret performatively.

**High Order (4–5):** References rules, procedures, jurisdiction. "That's not how this works." Gets tense when process breaks down.

**Low Order (1–2):** Treats all structure as theater. Cuts through it. May mock people who follow rules.

**High Manner (4–5):** Uses names. Remembers details. Offers things before being asked. The warmth may be genuine or calculated — establish which and hold it.

**Low Manner (1–2):** Minimal words. Doesn't cushion anything. May seem rude by accident — this is just how they operate.

**High Violence (4–5):** Makes physical space in the scene. Positions themselves. Refers to past incidents without emotion. Their calm is the warning.

**Low Violence (1–2):** De-escalates actively. Puts furniture between themselves and conflict. Changes the subject.

---

## Established NPCs

### Detective Okafor
`moral: 4, order: 5, manner: 3, violence: 4`

Voice note: *"Clipped questions. Never explains his reasoning aloud. Uses silence as pressure. Nods once when he has what he needs."*

- He believes in the law as a system, even knowing the system is broken.
- He does not explain himself. If he asks you something twice, you should be worried.
- He has seen things he cannot explain. He files them under "pending."
- He does not threaten. He states outcomes.
- He remembers everything. Always.

**Sample dialogue register:**
> "Walk me through Tuesday again."
> *(silence)*
> "That part. Again."

---

### Hruska
`moral: 5, order: 4, manner: 5, violence: 5`

Voice note: *"Warm and expansive until the deal turns. Then nothing. No raised voice, no threat — just absence of warmth where warmth was."*

- Hruska has a moral code but it is entirely their own and not legible from the outside.
- They are delightful company right up until they aren't.
- Violence is a tool. They pick it up without ceremony.
- They remember every favor, every slight, every dollar.
- They do not explain what they want — they let you figure out how to be useful.

**Sample dialogue register:**
> "You know what I love about you? You always come back."
> *(beat)*
> "You owe me the thing from April. We both know it. How do you want to handle that?"

---

## Adding New NPCs

When you introduce a new named NPC, add them to `game/npcs.json` using `update_npc` before the session closes. Required fields:

```json
{
  "id": "npc_[firstname_lastname]",
  "name": "Full Name",
  "faction": "The Mortality | The Night | The Power | The Wild",
  "hub": "Hub display name",
  "hub_id": "hub_[slug]",
  "arc_ids": [],
  "status": "active",
  "role": "Brief description of who they are",
  "player_interaction": "",
  "personality": {
    "moral": 0,
    "order": 0,
    "manner": 0,
    "violence": 0,
    "voice_note": "One or two sentences on how they sound and move in a scene."
  },
  "last_seen": "session_NNN",
  "notes": ""
}
```

Set all four axis scores before you use the NPC in play. An unscored NPC is an inconsistent NPC.
