// Pure presentation helpers, shared with the regression tests.
export function parseEvents(text = '') {
  const entries = [];
  const clean = String(text).replace(/\r\n/g, '\n').replace(/<!--[\s\S]*?-->/g, '');
  for (const section of clean.split(/^##\s+/m).slice(1)) {
    const [heading, ...lines] = section.split('\n');
    const match = heading.match(/^\[(\d{4}-\d{2}-\d{2})\]\s*(.+)$/);
    if (!match) continue;
    const [, date, title] = match;
    const metadata = lines.find(line => /^\*\*Hubs:\*\*/.test(line)) || '';
    const body = lines.filter(line => !/^\*\*(?:Hubs|Circles):\*\*/.test(line) && !/^\s*-{3,}\s*$/.test(line)).join('\n').trim();
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    entries.push({ id: `${date}-${slug}`, date, title, metadata, body });
  }
  return entries.sort((a, b) => b.date.localeCompare(a.date));
}

export function entityRoute(id) { return `/entity/${encodeURIComponent(id)}`; }
export function eventEntities(event, nodes = []) {
  const text = `${event.title} ${event.metadata} ${event.body}`.toLowerCase();
  return nodes.filter(({ data }) => data.label && text.includes(data.label.toLowerCase()));
}
export const PRESSURE_STAGES = Object.freeze({
  investigation: 'Follow a lead', intervention: 'Intervene',
  confrontation: 'Face a standoff', aftermath: 'Deal with the aftermath',
});
export function pressureStage(arc) {
  if (['resolved', 'closed', 'failed'].includes(String(arc.status).toLowerCase())) return 'Resolved';
  return PRESSURE_STAGES[arc.pressure_stage || arc.pressureStage] || 'Developing';
}
