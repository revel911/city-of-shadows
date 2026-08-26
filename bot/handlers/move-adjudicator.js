import {
  BASIC_MOVE_MODIFIERS,
  CIRCLE_NAMES,
} from './mechanics.js';

export const BASIC_MOVE_SEMANTICS = Object.freeze({
  'turn to violence': Object.freeze({
    trigger: 'use force against someone able to resist or retaliate',
    non_triggers: ['threatening without attacking', 'violence against a helpless object', 'describing force that already resolved'],
    requirements: ['a target capable of resistance or retaliation', 'force is happening now'],
  }),
  'escape a situation': Object.freeze({
    trigger: 'take advantage of an opening to escape immediate danger or confinement',
    non_triggers: ['routine departure', 'travel with no pursuit or barrier', 'planning a later escape'],
    requirements: ['an immediate dangerous situation', 'an available opening the character uses now'],
  }),
  'persuade an npc': Object.freeze({
    trigger: 'press an NPC with seduction, a promise, leverage, or a threat to do something',
    non_triggers: ['an ordinary request they freely accept', 'asking a PC', 'conversation without an ask'],
    requirements: ['an NPC target', 'a concrete ask', 'seduction, promise, leverage, or threat'],
  }),
  'figure someone out': Object.freeze({
    trigger: 'actively read a person for motives, fears, loyalties, or leverage',
    non_triggers: ['examining an object or place', 'recalling lore', 'passively noticing demeanor'],
    requirements: ['a person being read', 'an actionable question about that person'],
  }),
  'mislead, distract, or trick': Object.freeze({
    trigger: 'deliberately fool or distract someone with a concrete deceptive method',
    non_triggers: ['keeping a secret without acting', 'an honest argument', 'a hypothetical deception'],
    requirements: ['a target who can be fooled or distracted', 'a deceptive action now'],
  }),
  'keep your cool': Object.freeze({
    trigger: 'act with control when things get real and a concrete danger or loss must be avoided',
    non_triggers: ['mere proximity to danger', 'routine careful action', 'passive waiting without pressure'],
    requirements: ['immediate pressure', 'a stated or inferable danger or loss to avoid'],
  }),
  'let it out': Object.freeze({
    trigger: 'release a specific supernatural power within the character',
    non_triggers: ['ordinary perception', 'mundane exertion', 'describing a supernatural identity without using power'],
    requirements: ['a specific active ability', 'the character releases it now'],
  }),
  'lend a hand or get in the way': Object.freeze({
    trigger: 'help or hinder after another player character has rolled',
    non_triggers: ['helping an NPC', 'help offered before the other PC rolls', 'independent parallel action'],
    requirements: ['another PC', 'that PC has already rolled', 'a declared help or hindrance method'],
  }),
  'put a name to a face': Object.freeze({
    trigger: 'connect a person’s name to their face, or their face to their name',
    non_triggers: ['recognizing or recalling a symbol, sigil, emblem, logo, object, place, or writing', 'general lore recall', 'reading a person’s motives'],
    requirements: ['a person', 'a name-face connection', 'the person’s Circle'],
  }),
  'hit the streets': Object.freeze({
    trigger: 'go to a named contact or Circle to obtain something needed',
    non_triggers: ['shopping routinely', 'asking a present ally for ordinary help', 'research without a contact'],
    requirements: ['a concrete need', 'a contact or community being approached', 'the contact’s Circle'],
  }),
  'study a place of power': Object.freeze({
    trigger: 'deliberately study a sanctuary, gathering spot, or place of power controlled by a Circle',
    non_triggers: ['searching an ordinary room', 'routine travel through a location', 'recalling facts about a place'],
    requirements: ['a qualifying place of power', 'active study', 'the controlling Circle'],
  }),
  'refuse to honor a debt': Object.freeze({
    trigger: 'refuse a specific Debt that a creditor has called in',
    non_triggers: ['complaining about a Debt', 'delaying before a creditor calls it in', 'refusing an ordinary favor'],
    requirements: ['a canonical outstanding Debt', 'a creditor calling it in now', 'creditor Circle and numeric Status'],
  }),
});

function normalizedMove(move) {
  return String(move || '').trim().toLowerCase();
}

const BASIC_MOVE_NAMES = Object.freeze({
  'turn to violence': 'Turn to Violence',
  'escape a situation': 'Escape a Situation',
  'persuade an npc': 'Persuade an NPC',
  'figure someone out': 'Figure Someone Out',
  'mislead, distract, or trick': 'Mislead, Distract, or Trick',
  'keep your cool': 'Keep Your Cool',
  'let it out': 'Let It Out',
  'lend a hand or get in the way': 'Lend a Hand or Get in the Way',
  'put a name to a face': 'Put a Name to a Face',
  'hit the streets': 'Hit the Streets',
  'study a place of power': 'Study a Place of Power',
  'refuse to honor a debt': 'Refuse to Honor a Debt',
});

function displayMove(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return BASIC_MOVE_NAMES[normalized] || String(value || '').trim();
}

function canonicalName(value, names) {
  const normalized = String(value || '').trim().toLowerCase();
  return names.find(name => name.toLowerCase() === normalized) || null;
}

export function extractRollableCharacterMoves(sheet = '') {
  const text = String(sheet || '');
  const heading = /^(#{2,3})\s+MOVES\s*$/im.exec(text);
  if (!heading) return [];
  const level = heading[1].length;
  const remainder = text.slice(heading.index + heading[0].length);
  const boundary = new RegExp(`^(?:#{1,${level}})(?!#)\\s+|^---\\s*$`, 'm');
  const section = remainder.slice(0, boundary.exec(remainder)?.index ?? remainder.length);
  const candidates = [];
  for (const line of section.split(/\r?\n/)) {
    const bullet = line.match(/^\s*-\s+(?:\*\*)?([^*\n\u2014\u2013]+?)(?:\*\*)?\s+[\u2014\u2013-]\s+(.+)$/);
    if (!bullet) continue;
    const name = bullet[1].trim();
    const trigger = bullet[2].trim();
    const stat = canonicalName(
      trigger.match(/\broll(?:\s+with)?\s+(Blood|Heart|Mind|Spirit)\b/i)?.[1],
      ['Blood', 'Heart', 'Mind', 'Spirit']
    );
    const circle = canonicalName(
      trigger.match(/\broll(?:\s+with)?\s+(?:their\s+)?(Mortalis|Night|Power|Wild)\b/i)?.[1],
      CIRCLE_NAMES
    );
    if (!stat && !circle) continue;
    candidates.push({
      name,
      trigger,
      modifier_type: stat ? 'stat' : 'circle',
      modifier_key: stat,
      circle,
    });
  }
  return candidates;
}

export function buildMoveAdjudicationPrompt({ playerText, lastAssistant = '', sheet = '' } = {}) {
  const basic = Object.entries(BASIC_MOVE_SEMANTICS).map(([move, semantics]) => {
    const source = BASIC_MOVE_MODIFIERS[move];
    return [
      `- ${displayMove(move)} [${source.key || source.type}]`,
      `  Trigger: ${semantics.trigger}.`,
      `  Not triggers: ${semantics.non_triggers.join('; ')}.`,
      `  Requirements: ${semantics.requirements.join('; ')}.`,
    ].join('\n');
  }).join('\n');
  const characterMoves = extractRollableCharacterMoves(sheet);
  const custom = characterMoves.length
    ? characterMoves.map(move =>
        `- ${move.name} [${move.modifier_key || move.circle || move.modifier_type}]: ${move.trigger}`
      ).join('\n')
    : '(none found)';
  return [
    'Decide the first Urban Shadows move triggered on this turn before a narrator writes any outcome.',
    'Return exactly one JSON object and no Markdown.',
    'Valid decisions:',
    '{"decision":"roll","move":"Exact Move Name","circle":null,"creditor_status":null,"reason":"brief fictional trigger"}',
    '{"decision":"none","reason":"brief reason"}',
    '{"decision":"clarify","question":"one concise player-facing question","reason":"brief ambiguity"}',
    '',
    'Rules:',
    '- A roll fires when the exact fictional trigger is happening now. Do not add a separate difficulty, uncertainty, or drama test; if the trigger requirements are met, the move happens.',
    '- Treat completed-action wording as attempted action, but do not roll hypotheticals, preparation for a future action, passive observation, routine travel, ordinary recollection not covered by Put a Name to a Face, or an unopposed request.',
    '- An armed confrontation can trigger Keep Your Cool when the player deliberately holds steady, waits under threat, avoids escalation, or resists losing control. Mere proximity to a weapon is not enough.',
    '- Put a Name to a Face requires a person: connect their name to their face or vice versa. Recognizing or recalling a symbol, sigil, emblem, logo, object, place, or writing does not trigger it.',
    '- Use only a move listed below. Character moves require their exact trigger, not merely a thematic resemblance.',
    '- If the player might mean ordinary observation or a supernatural ability and that choice changes the move, clarify.',
    '- Infer a Circle move target from the immediate fiction; do not ask the player to classify something their character may not understand.',
    '- Circle guide: Mortalis is ordinary humanity and mortal institutions; Night is embodied predators, the dead, and hunger-driven supernatural communities; Power is wizards, oracles, immortals, and organized occult authority; Wild is fae, demons, otherworldly beings, and chaotic magic.',
    '- Always set circle to Mortalis, Night, Power, or Wild for a Circle roll.',
    '- Refuse to Honor a Debt also requires the creditor numeric Circle Status (0-3) as creditor_status. If the fiction does not provide it, clarify instead of guessing.',
    '',
    'BASIC MOVES',
    basic,
    '',
    'ACTIVE CHARACTER ROLLABLE MOVES',
    custom,
    '',
    'IMMEDIATE PRIOR FICTION',
    String(lastAssistant || '').slice(-2400) || '(none)',
    '',
    'PLAYER MESSAGE',
    String(playerText || '').slice(0, 1600),
  ].join('\n');
}

function jsonObjectFromText(text) {
  const source = String(text || '').trim();
  const fenced = source.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
  for (const candidate of [source, fenced, source.match(/\{[\s\S]*\}/)?.[0]]) {
    if (!candidate) continue;
    try {
      const value = JSON.parse(candidate);
      if (value && typeof value === 'object' && !Array.isArray(value)) return value;
    } catch {}
  }
  return null;
}

export function parseMoveAdjudication(text, { sheet = '' } = {}) {
  const raw = jsonObjectFromText(text);
  const decision = String(raw?.decision || '').trim().toLowerCase();
  if (decision === 'none') {
    return { decision: 'none', reason: String(raw.reason || '').trim().slice(0, 240) };
  }
  if (decision === 'clarify') {
    const question = String(raw.question || '').replace(/\s+/g, ' ').trim().slice(0, 280);
    if (!question) return null;
    return {
      decision: 'clarify',
      question: /\?$/.test(question) ? question : `${question}?`,
      reason: String(raw.reason || '').trim().slice(0, 240),
    };
  }
  if (decision !== 'roll') return null;

  const requestedMove = normalizedMove(raw.move);
  const basicKey = Object.keys(BASIC_MOVE_MODIFIERS).find(move => move === requestedMove);
  const custom = extractRollableCharacterMoves(sheet)
    .find(move => normalizedMove(move.name) === requestedMove);
  if (!basicKey && !custom) return null;

  const source = basicKey ? BASIC_MOVE_MODIFIERS[basicKey] : custom;
  const modifierType = source.type || source.modifier_type;
  const circle = canonicalName(raw.circle, CIRCLE_NAMES) || custom?.circle || null;
  if (modifierType === 'circle' && !circle) return null;
  const creditorStatus = Number.isInteger(raw.creditor_status) && raw.creditor_status >= 0 && raw.creditor_status <= 3
    ? raw.creditor_status
    : null;
  if (modifierType === 'status_difference' && (!circle || creditorStatus === null)) return null;
  return {
    decision: 'roll',
    expectation: {
      move: basicKey ? displayMove(basicKey) : custom.name,
      modifier_type: modifierType,
      modifier_key: source.key || source.modifier_key || null,
      circle,
      creditor_status: creditorStatus,
      forward: 0,
      reason: String(
        raw.reason || custom?.trigger || BASIC_MOVE_SEMANTICS[basicKey]?.trigger || ''
      ).trim().slice(0, 240),
      confidence: 'adjudicated',
    },
  };
}
