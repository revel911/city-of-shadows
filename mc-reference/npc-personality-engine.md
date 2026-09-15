# NPC Personality Engine

Every NPC in `game/npcs.json` carries a `personality` block with four core axes, separate speech and humor traits, and optional flirtation/intimacy traits. Use these scores to voice the NPC consistently across sessions and across players. An NPC voiced by you in Johan's session must feel like the same person in Benjamin's session.

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
How strongly do they resist reaching for it? This axis is intentionally
**violence-first at the low end and violence-averse at the high end**.

| Score | What It Means |
|-------|--------------|
| 1 | Violence is a primary tool. Uses it early and without guilt. |
| 2 | Comfortable with violence. Doesn't prefer it but doesn't flinch. |
| 3 | Willing to threaten; carries through if pushed. |
| 4 | Avoids violence; uses it only as an absolute last resort. |
| 5 | Violence is off the table. They will flee, fold, shield others, or seek another route first. |

---

## Warmth, speech length, and humor

`manner` controls warmth and social presentation only. It does not control word
count. `verbosity` independently controls how much the NPC tends to say:

| Score | Verbosity | Humor frequency |
|---|---|---|
| 1 | Minimal words; often silence or gestures | Rare or absent |
| 2 | Short, direct sentences | Occasional |
| 3 | Enough detail for the exchange | Regular when comfortable |
| 4 | Talkative; volunteers context | Frequent social tactic |
| 5 | Expansive; anecdotes and tangents | Pervasive impulse to joke |

A warm person can speak very little. A hostile person can talk at length.
`humor_style` describes delivery and purpose: dry understatement, absurdity,
affectionate teasing, self-deprecation, nervous deflection, or gallows humor.
Frequency is a tendency, not a quota or a measure of how funny someone is.
Do not put a quip in every reply or turn grief and danger into comic relief.
Pressure may suppress humor or increase it if the established style is nervous
deflection. Show that difference through the specific NPC's context.

`contrast_note` states one contextual contrast, not a random second personality:
for example, stern at work but expansive about a familiar craft. Use it when the
scene supplies the condition; do not manufacture an event to demonstrate it.

`voice_note` remains the most specific delivery guidance. Established actions,
relationship boundaries, and current circumstances constrain every trait. A
non-speaking entity does not acquire speech from a numeric verbosity score.
Never default everyone to formal, articulate, cryptic, witty, or flirtatious.

## Flirtation and intimacy

`flirtatiousness` is either null (unestablished or not applicable) or 1-5:
1 reserved, 2 subtle, 3 responsive, 4 openly expressive, 5 readily initiates.
It describes expression in appropriate adult contexts, not libido, orientation,
attraction to this character, willingness, or consent.

`intimacy_style` is null or a short description of how established adult
closeness is approached: cautious, playful, direct, affection-first, or guarded.
Null is not a low score, rejection, or an asexual identity. Author a starting
score and style for applicable adult NPCs even before their first meeting. Mark
these as authored tendencies, not inferred orientation or prior relationships.
Reserve null for inapplicable traits or a deliberate unresolved exception. Do not assign sexual characterization
to minors; an unknown age is not evidence of adulthood.

Warmth, humor, beauty, faction, professional care, a Debt, manipulation, or a
previous marriage never establishes attraction. Keep specific interest,
relationship history, and boundaries in the appropriate NPC-character memory,
not a universal attraction score. Family affection stays familial. Apply the
relationship scene rules, current consent, and player limits at every step.

## Evidence and continuity

`calibration_note` records whether the social profile follows an explicit voice
note or interaction, is a conservative interpretation, or remains provisional.
Reference source paths or session IDs when available; never fabricate an
interaction as evidence. Lack of history does not require a blank personality:
choose coherent starting traits, label them authored, and keep them stable. This note is portrayal guidance, not witnessed history.

Before portraying an existing NPC, read its canonical voice, role, notes,
player_interaction, available handoff/session evidence, and memory for this
character. Existing specific evidence overrides provisional interpretation.
Keep original ethics, affiliations, history, and established voice intact. A
TBD voice note is an information gap, not a veto on the authored social profile. Do not infer a
trait from pronouns, age, religion, ancestry, faction, or occupation alone.

The bot supplies the social traits in both opening behavior cards and later NPC
hydration. Combine warmth, verbosity, humor, contrast, and relationship context;
use only the traits relevant to the beat. Do not announce scores to the player.
Old records receive conservative runtime fallbacks, never invented preferences.

---

## Behavioral Signatures by Score

Use `voice_note` in the personality block as the most specific guidance. The axis scores give you the frame; the voice_note gives you the texture.

**High Moral (4–5):** Explains their reasoning. References past decisions as binding precedent. Visibly uncomfortable when pushed to compromise.

**Low Moral (1–2):** Doesn't justify. Does what serves the moment. May express regret performatively.

**High Order (4–5):** References rules, procedures, jurisdiction. "That's not how this works." Gets tense when process breaks down.

**Low Order (1–2):** Treats all structure as theater. Cuts through it. May mock people who follow rules.

**High Manner (4–5):** Uses names. Remembers details. Offers things before being asked. The warmth may be genuine or calculated — establish which and hold it.

**Low Manner (1-2):** Does not cushion the interaction; verbosity independently sets speech length. May seem rude by accident — this is just how they operate.

**Violence 1–2:** Makes physical space in the scene. Positions themselves. Refers to past incidents without emotion. Their calm is the warning.

**Violence 4–5:** De-escalates actively. Puts furniture between themselves and conflict. Changes the subject, retreats, calls for help, or protects bystanders.

---

## Canonical NPC records

Named NPC facts never live in this reference document. Before portraying an NPC,
read that NPC's canonical record from the session's `CANONICAL WORLD INDEX`.
The record's name, pronouns, role, status, locations, scores, and `voice_note`
override recollection and examples. Never create a second NPC when a canonical ID
or name already matches.

## Adding New NPCs

When you introduce a new named NPC, add them to `game/npcs.json` by emitting an entry in the session close block's `<npc_patch>` array. Required fields:

```json
{
  "id": "npc_[firstname_lastname]",
  "name": "Full Name",
  "faction": "Mortalis | Night | Power | Wild",
  "hub": "Hub display name",
  "hub_id": "hub_[slug]",
  "arc_ids": [],
  "status": "active",
  "role": "Brief description of who they are",
  "player_interaction": "",
  "personality": {
    "moral": 3,
    "order": 3,
    "manner": 3,
    "violence": 3,
    "voice_note": "One or two sentences on how they sound and move in a scene.",
    "verbosity": 2,
    "humor_frequency": 2,
    "humor_style": "Dry understatement, only when comfortable.",
    "contrast_note": "Brief in business; more forthcoming about a familiar craft.",
    "calibration_note": "Initial authored profile; no prior interactions claimed.",
    "flirtatiousness": 2,
    "intimacy_style": "Patient and private; prefers clear mutual interest and gradual trust."
  },
  "last_seen": "session_NNN",
  "notes": ""
}
```

Before a new named NPC speaks, assign the four core scores, verbosity,
humor_frequency, humor_style, contrast_note, calibration_note, and voice_note.
Include a flirtatiousness score and intimacy_style for applicable adult NPCs;
use null for minors, non-person entities, or a deliberate unresolved exception.
Choose a coherent profile from the NPC's actual presentation;
do not roll random traits or copy a universal middle-score profile.

Emit the full personality object in the new NPC's `<npc_patch>` at onboarding
save or session close. The bot rejects missing or invalid new profiles. Use only
changed personality fields for an existing NPC, inside `changes.personality`,
with `expected_revision`. The bot preserves omitted traits and rejects unversioned
personality edits; stale changes become continuity conflicts. Document a reason
in calibration_note for a lasting revision. A single bad day or one flirtatious
exchange does not rewrite a universal personality.
