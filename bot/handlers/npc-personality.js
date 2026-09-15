// Shared schema for persisted NPCs and their prompt-facing behavior cards.
const axes = ['moral', 'order', 'manner', 'violence', 'verbosity', 'humor_frequency'];
export function personalityProblems(p) {
  if (!p || typeof p !== 'object' || Array.isArray(p)) return ['personality must be an object'];
  const errors = axes.filter(key => !Number.isInteger(p[key]) || p[key] < 1 || p[key] > 5)
    .map(key => `${key} must be 1-5`);
  for (const key of ['voice_note', 'humor_style', 'contrast_note', 'calibration_note']) {
    if (typeof p[key] !== 'string' || !p[key].trim()) errors.push(`${key} must be a nonempty string`);
  }
  if (p.flirtatiousness !== null && (!Number.isInteger(p.flirtatiousness) || p.flirtatiousness < 1 || p.flirtatiousness > 5)) {
    errors.push('flirtatiousness must be null or 1-5');
  }
  if (p.intimacy_style !== null && (typeof p.intimacy_style !== 'string' || !p.intimacy_style.trim())) {
    errors.push('intimacy_style must be null or a nonempty string');
  }
  return errors;
}

// Compatibility for old session contexts, not a license to invent new NPC facts.
export function personalityWithDefaults(p = {}) {
  return {
    verbosity: 3,
    humor_frequency: 1,
    humor_style: 'Unestablished; do not invent a recurring comic persona.',
    contrast_note: 'Unestablished; preserve the existing voice and recorded interactions.',
    calibration_note: 'Legacy fallback only; social traits have not been established.',
    flirtatiousness: null,
    intimacy_style: null,
    ...p,
  };
}

export function socialBehavior(p) {
  const value = personalityWithDefaults(p);
  const length = {
    1: 'Minimal words; silence and gestures carry most of the response.',
    2: 'Short sentences; answer directly and stop.',
    3: 'Moderate length; enough detail for the exchange.',
    4: 'Talkative; volunteers context and follows conversational threads.',
    5: 'Expansive; anecdotes, tangents, and thinking aloud, without taking over the scene.',
  };
  const humor = {
    1: 'Rare or absent; never force a joke.',
    2: 'Occasional; only when the moment supports it.',
    3: 'Regular when comfortable; allow serious beats to remain serious.',
    4: 'Frequent; humor is a habitual social tactic, not every line.',
    5: 'Pervasive impulse to joke; context and other people still matter.',
  };
  return {
    verbosity: length[value.verbosity],
    humor: `${humor[value.humor_frequency]} Style: ${value.humor_style}`,
    contextual_contrast: value.contrast_note,
    calibration: value.calibration_note,
    flirtation: value.flirtatiousness === null
      ? 'Unestablished or not applicable; do not infer attraction from warmth, humor, role, or faction.'
      : `Expressed flirtation ${value.flirtatiousness}/5 (1 reserved, 3 responsive, 5 readily initiates). Applies only in an appropriate adult context; never implies attraction to this character or consent.`,
    intimacy: value.intimacy_style === null
      ? 'Unestablished or not applicable; preserve boundaries without inventing romantic or sexual preferences.'
      : value.intimacy_style,
    relationship_rule: 'Use the current character and their established relationship memory and current signals. Family, professional care, debt, and manipulation are not romantic interest. No sexual portrayal of minors; unknown age does not establish adulthood. Traits never override consent, player limits, or agency.',
  };
}
