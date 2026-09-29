import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseEvents, entityRoute, eventEntities, pressureStage } from '../../dashboard/chronicle.js';

test('chronicle keeps complete newest-first entries and excludes metadata and comments', () => {
  const events = parseEvents('# Log\r\n<!-- ignore -->\r\n## [2026-09-25] New event\r\n\r\n**Hubs:** Downtown | **Circles:** Night\r\n\r\nFirst paragraph.\r\n\r\nSecond paragraph.\r\n---\r\n## [2026-04-24] Older event\r\nOld body.');
  assert.equal(events.length, 2);
  assert.equal(events[0].title, 'New event');
  assert.equal(events[0].body, 'First paragraph.\n\nSecond paragraph.');
  assert.equal(events[0].date, '2026-09-25');
  assert.match(events[0].metadata, /Downtown/);
});

test('real public log summary starts with the newest entry, not the old tail', async () => {
  const log = await readFile(new URL('../../game/events-log.md', import.meta.url), 'utf8');
  const events = parseEvents(log);
  const headings = [...log.matchAll(/^## \[(\d{4}-\d{2}-\d{2})\]/gm)].map(m => m[1]).sort();
  assert.equal(events[0].date, headings.at(-1));
  assert.ok(events.slice(0, 3).every(e => !e.body.includes('**Hubs:**')));
});

test('event links use canonical IDs and pressure stages do not imply a resolved outcome', () => {
  const event = {title:'News',metadata:'Downtown',body:'Aldridge arrived.'};
  assert.deepEqual(eventEntities(event, [{data:{id:'npc_aldridge',label:'Aldridge'}},{data:{id:'npc_other',label:'Someone Else'}}]).map(n=>n.data.id), ['npc_aldridge']);
  assert.equal(entityRoute('npc_aldridge'), '/entity/npc_aldridge');
  assert.equal(pressureStage({pressure_stage:'investigation',escalation:4,status:'active'}), 'Follow a lead');
  assert.equal(pressureStage({pressure_stage:'investigation',status:'resolved'}), 'Resolved');
});
