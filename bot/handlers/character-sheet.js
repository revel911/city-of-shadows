export const CANONICAL_SHEET_SECTIONS = [
  'IDENTITY',
  'ARCHETYPE / PLAYBOOK',
  'STATS',
  'MOVES',
  'CIRCLES & STATUS',
  'DEBTS',
  'ANCHORS',
  'GEAR & RESOURCES',
  'ADVANCEMENT',
  'SPECIAL TRIGGERS',
  'NOTES & OPEN QUESTIONS',
];

function headingName(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').toUpperCase();
}

export function characterSheetProblems(sheet) {
  const text = String(sheet || '').trim();
  if (!text) return ['is empty'];
  const problems = [];
  if (!/^#\s+.+\s+-\s+Character Sheet\s*$/im.test(text)) {
    problems.push('needs an H1 formatted as # Character Name - Character Sheet');
  }
  const headings = [...text.matchAll(/^##\s+(.+)$/gm)].map(match => headingName(match[1]));
  const missing = CANONICAL_SHEET_SECTIONS.filter(section => !headings.includes(section));
  if (missing.length) problems.push(`is missing canonical sections: ${missing.join(', ')}`);
  if (!missing.length) {
    const positions = CANONICAL_SHEET_SECTIONS.map(section => headings.indexOf(section));
    if (positions.some((position, index) => index > 0 && position < positions[index - 1])) {
      problems.push('canonical sections are out of order');
    }
  }
  return problems;
}

function signed(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 'n/a';
  return number > 0 ? `+${number}` : String(number);
}

function liveSummary(state = {}, fallbackName = 'Character') {
  const name = state.character_name || fallbackName;
  const identity = [state.playbook, state.wod_extension].filter(Boolean).join(' - ') || 'Playbook TBD';
  const stats = state.stats || {};
  const ratings = state.circle_ratings || {};
  const status = state.circle_status || {};
  const statLine = ['Blood', 'Heart', 'Mind', 'Spirit']
    .map(stat => `**${stat}:** ${signed(stats[stat])}`)
    .join('  /  ');
  const circleLines = ['Mortalis', 'Night', 'Power', 'Wild']
    .map(circle => `- **${circle}:** Rating ${signed(ratings[circle])}, Status ${status[circle] ?? 0}`);
  return [
    `# ${name} - Live Character Sheet`,
    `*${identity}*`,
    '',
    `**Harm:** ${state.harm ?? 0}  /  **Corruption:** ${state.corrupt ?? 0}  /  **XP:** ${state.xp ?? 0}  /  **Advances:** ${state.advances ?? 0}`,
    '',
    '## Current Stats',
    statLine,
    '',
    '## Current Circles',
    ...circleLines,
  ].join('\n');
}

function descriptiveRecord(sheet) {
  const dynamic = new Set(['STATS', 'CIRCLES & STATUS', 'HARM', 'CORRUPTION', 'XP']);
  const kept = [];
  let skipping = false;
  for (const line of String(sheet || '').split(/\r?\n/)) {
    if (/^#\s+/.test(line)) continue;
    const heading = line.match(/^#{2,3}\s+(.+)$/);
    if (heading) skipping = dynamic.has(headingName(heading[1]));
    if (!skipping) kept.push(line);
  }
  return kept.join('\n').trim();
}

export function formatCharacterSheetForDiscord(sheet, state, fallbackName) {
  const record = descriptiveRecord(sheet);
  return [
    liveSummary(state, fallbackName),
    record && '---',
    record && '## Character Record',
    record,
  ].filter(Boolean).join('\n\n');
}
