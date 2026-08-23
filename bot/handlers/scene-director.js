const MODES = ['action', 'investigation', 'social', 'exploration', 'reflection'];
const MAX_SCORE = 50;
const RECENT_LIMIT = 8;

const MODE_PATTERNS = {
  action: /\b(?:attack|fight|hit|shoot|stab|chase|run after|tackle|kick|punch|grab|break in|rush|charge|escape|flee|transform)\b/i,
  investigation: /\b(?:investigat|search|look for|inspect|examine|research|trace|track|follow the clue|question .* about|check the|read the|figure out|what happened|who did)\b/i,
  social: /\b(?:ask|tell|talk|persuad|convince|threaten|intimidat|bargain|negotiate|lie to|comfort|apolog|confront|call|text|meet with)\b/i,
  exploration: /\b(?:go to|head to|travel|enter|explore|wander|visit|drive to|walk to|leave for|scope out)\b/i,
  reflection: /\b(?:think|remember|reflect|pray|wait|listen|watch|feel|consider|journal|sit with|take a breath)\b/i,
};

const ROMANCE_CUE = /\b(?:flirt|kiss|date|romantic|attracted|hold (?:his|her|their) hand|ask .* out|lean in|sleep with|make love)\b/i;

const DEVICE_PATTERNS = {
  anonymous_message: /\b(?:unknown number|anonymous (?:text|message)|phone (?:buzzes|vibrates))\b/i,
  unseen_watcher: /\b(?:being watched|someone watching|unseen watcher|figure in the shadows)\b/i,
  warehouse_meeting: /\b(?:warehouse|abandoned factory)\b/i,
  ominous_weather: /\b(?:rain-slick|ominous (?:rain|storm)|thunder cracks)\b/i,
  cryptic_warning: /\b(?:you have been warned|cryptic warning|before it is too late)\b/i,
};

function emptyScores() {
  return Object.fromEntries(MODES.map(mode => [mode, 0]));
}

export function normalizePlaystyleSignals(value) {
  const input = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const sourceScores = input.scores && typeof input.scores === 'object' ? input.scores : {};
  const scores = emptyScores();
  for (const mode of MODES) {
    const score = Number(sourceScores[mode]);
    scores[mode] = Number.isFinite(score) ? Math.max(0, Math.min(MAX_SCORE, Math.round(score))) : 0;
  }
  return {
    schema_version: 1,
    scores,
    observed_choices: Math.max(0, Number.isInteger(input.observed_choices) ? input.observed_choices : 0),
    recent_modes: Array.isArray(input.recent_modes)
      ? input.recent_modes.filter(mode => MODES.includes(mode)).slice(-RECENT_LIMIT)
      : [],
  };
}

export function inferPlaySignals(text) {
  const source = String(text || '').trim();
  const scores = emptyScores();
  if (!source) return scores;
  for (const mode of MODES) {
    if (MODE_PATTERNS[mode].test(source)) scores[mode] += 2;
  }
  // Dialogue in quotation marks is an additional, observable social choice.
  if (/[“"][^”"]+[”"]/.test(source)) scores.social += 1;
  return scores;
}

export function updatePlaystyleSignals(current, playerText) {
  const next = normalizePlaystyleSignals(current);
  const observed = inferPlaySignals(playerText);
  const ranked = MODES.filter(mode => observed[mode] > 0)
    .sort((a, b) => observed[b] - observed[a] || MODES.indexOf(a) - MODES.indexOf(b));
  for (const mode of MODES) next.scores[mode] = Math.min(MAX_SCORE, next.scores[mode] + observed[mode]);
  if (ranked.length) {
    next.observed_choices += 1;
    next.recent_modes = [...next.recent_modes, ranked[0]].slice(-RECENT_LIMIT);
  }
  return next;
}

export function mergePlaystyleObservations(current, baseline, observed) {
  const next = normalizePlaystyleSignals(current);
  const before = normalizePlaystyleSignals(baseline);
  const after = normalizePlaystyleSignals(observed);
  for (const mode of MODES) {
    const delta = Math.max(0, after.scores[mode] - before.scores[mode]);
    next.scores[mode] = Math.min(MAX_SCORE, next.scores[mode] + delta);
  }
  const choiceDelta = Math.max(0, after.observed_choices - before.observed_choices);
  next.observed_choices += choiceDelta;
  if (choiceDelta) {
    next.recent_modes = [
      ...next.recent_modes,
      ...after.recent_modes.slice(-choiceDelta),
    ].slice(-RECENT_LIMIT);
  }
  return next;
}

export function detectRepeatedDevices(text) {
  return Object.entries(DEVICE_PATTERNS)
    .filter(([, pattern]) => pattern.test(String(text || '')))
    .map(([name]) => name);
}

function selectMode(playerText, signals) {
  const immediate = inferPlaySignals(playerText);
  const explicit = MODES.filter(mode => immediate[mode] > 0)
    .sort((a, b) => immediate[b] - immediate[a] || MODES.indexOf(a) - MODES.indexOf(b));
  if (explicit.length) return explicit[0];
  const normalized = normalizePlaystyleSignals(signals);
  const recent = new Set(normalized.recent_modes.slice(-2));
  return [...MODES]
    .sort((a, b) => normalized.scores[b] - normalized.scores[a] || MODES.indexOf(a) - MODES.indexOf(b))
    .find(mode => !recent.has(mode)) || 'social';
}

export function buildSceneDirectorContext({ playerText, playstyleSignals, lastAssistant = '' } = {}) {
  const signals = normalizePlaystyleSignals(playstyleSignals);
  const mode = selectMode(playerText, signals);
  const preferences = [...MODES]
    .sort((a, b) => signals.scores[b] - signals.scores[a])
    .filter(modeName => signals.scores[modeName] > 0)
    .slice(0, 3);
  const repeatedDevices = detectRepeatedDevices(lastAssistant);
  const modeRule = {
    action: 'Give both sides concrete objectives, keep geography legible, change the situation after one exchange, and make cost or choice matter more than blow-by-blow choreography.',
    investigation: 'A credible approach reveals a useful core clue. Failure or a weak approach changes cost, danger, time, or interpretation—not access to the story.',
    social: 'Give every NPC a distinct want, leverage, boundary, and conflict instinct. Dialogue must change position, trust, obligation, or risk.',
    exploration: 'Make one specific place element usable or revealing, then present a choice about where to press next.',
    reflection: 'Offer emotional or relational pressure without declaring the player character’s thoughts, feelings, or decision.',
  }[mode];
  return [
    '[SYSTEM — SILENT SCENE DIRECTOR]',
    `Current mode: ${mode}. The player’s current declared action always overrides historical tendency.`,
    `Observed tendencies (soft steering only): ${preferences.length ? preferences.join(', ') : 'not enough evidence yet'}.`,
    'Silently set: this scene’s agenda, one dramatic question, the player’s immediate objective from their exact words, opposing objective, obstacle, stakes, and the next decision point. Do not print this plan.',
    modeRule,
    'Urban-fantasy test: ground the beat in one recognizable city institution, routine, or local detail; let the supernatural disrupt it; attach a personal or political cost.',
    'Avoid stock atmosphere and generic menace. Use concrete local specificity plus one unexpected but causally supported turn.',
    repeatedDevices.length
      ? `Device cooldown: do not repeat these devices from the last response: ${repeatedDevices.join(', ')}.`
      : 'Device cooldown: vary the delivery mechanism and source of pressure from recent beats.',
    ROMANCE_CUE.test(String(playerText || ''))
      ? 'The message contains a possible romantic cue. Treat it as an invitation to clarify or reciprocate in fiction, not blanket consent; keep agency reversible and check before escalation.'
      : 'Do not introduce or escalate romance merely because of inferred preferences. Romance requires present-fiction signals and ongoing consent.',
    'Resolve exactly one consequential beat and stop where the player can make the next meaningful choice.',
  ].join('\n');
}

export const PLAYSTYLE_MODES = [...MODES];
