import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TranscriptArchive, messageEvent, mergeEvents, exportTranscript } from '../handlers/archive.js';
import { ArchiveGitHub } from '../handlers/archive-github.js';
import { archiveStore, discoverArchiveThreads } from '../handlers/archive-runtime.js';

const thread = '123456789012345678';
const fixture = (id = '223456789012345678', content = 'Priest watches the door.') => ({
  id, channelId: thread, createdAt: new Date('2026-09-25T10:00:00Z'), editedAt: null,
  author: { id: '323456789012345678', username: 'MC', bot: true }, content,
  attachments: new Map(), embeds: [], components: [],
});
async function setup(t) {
  const directory = await mkdtemp(join(tmpdir(), 'cos-archive-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const values = new Map(); let failing = false;
  const store = { async merge(path, merge) { if (failing) throw new Error('offline'); values.set(path, merge(values.get(path))); } };
  const archive = await new TranscriptArchive({ directory, store }).init();
  await archive.register({ thread_id: thread, character_id: 'jacob', character_name: 'Jacob' });
  return { directory, store, archive, values, fail: value => { failing = value; } };
}
test('captures only registered session messages and deduplicates replayed snapshots', async t => {
  const { archive, values } = await setup(t);
  await archive.capture({ ...fixture(), channelId: '999999999999999999' });
  await archive.capture(fixture()); await archive.capture(fixture());
  await archive.flush(); await archive.capture(fixture()); await archive.flush();
  assert.equal(values.size, 2);
  assert.equal(values.get(`threads/${thread}/2026-09-25.json`).events.length, 1);
});
test('failed remote writes retain durable outbox and survive process restart', async t => {
  const { archive, directory, store, values, fail } = await setup(t);
  await archive.capture(fixture()); fail(true);
  await assert.rejects(archive.flush(), /offline/);
  assert.equal((await readdir(join(directory, 'outbox'))).length, 1);
  const restarted = await new TranscriptArchive({ directory, store }).init();
  assert.equal(restarted.sessions.get(thread).character_id, 'jacob');
  fail(false); await restarted.flush();
  assert.equal(values.get(`threads/${thread}/2026-09-25.json`).events.length, 1);
  assert.equal((await readdir(join(directory, 'outbox'))).length, 0);
});
test('paginated history recovery includes bot dice and player messages without duplication', async t => {
  const { archive, values } = await setup(t);
  const page = new Map(Array.from({ length: 100 }, (_, i) => {
    const id = String(223456789012345678n + BigInt(i)); return [id, fixture(id, '7')];
  }));
  const calls = [];
  const channel = { messages: { async fetch(options) { calls.push(options); return calls.length === 1 ? page : new Map(); } } };
  assert.equal(await archive.recover(channel), 100);
  assert.equal(calls[1].before, '223456789012345678');
  await archive.flush();
  assert.equal(values.get(`threads/${thread}/2026-09-25.json`).events.length, 100);
});
test('export preserves originals, edits, deletion markers, attachments, and filters', () => {
  const original = fixture();
  original.attachments.set('file', { id: 'file', name: 'map.png', url: 'https://example.test/map.png' });
  const changed = { ...original, content: 'OOC: correction', author: { ...original.author, bot: false }, editedAt: new Date('2026-09-25T11:00:00Z') };
  const events = [messageEvent(original), messageEvent(changed), messageEvent(changed, 'deleted')];
  const sessions = [{ thread_id: thread, character_id: 'jacob', character_name: 'Jacob' }];
  const output = exportTranscript(sessions, events, { character: 'jacob', from: '2026-09-25', to: '2026-09-25' });
  assert.equal(output.json.messages.length, 1);
  assert.equal(output.json.messages[0].revisions.length, 3);
  assert.equal(output.json.messages[0].deleted, true);
  assert.equal(output.json.messages[0].content, 'OOC: correction');
  assert.match(output.markdown, /player \/ OOC/);
  assert.match(output.markdown, /map.png/);
  assert.equal(exportTranscript(sessions, events, { character: 'someone-else' }).json.messages.length, 0);
  assert.equal(exportTranscript(sessions, events, { from: '2026-09-26' }).json.messages.length, 0);
  assert.equal(mergeEvents(events, [messageEvent(original)]).length, 3);
});
test('message snapshot never captures model prompts or private object internals', () => {
  const event = messageEvent({ ...fixture(), systemPrompt: 'secret', rejectedDraft: 'hidden' });
  assert.doesNotMatch(JSON.stringify(event), /secret|hidden|systemPrompt|rejectedDraft/);
  assert.throws(() => messageEvent({ ...fixture(), channelId: '../public' }), /Invalid archive/);
});
test('archive refuses public storage, missing credentials, and the world repository', async () => {
  let writes = 0;
  const store = new ArchiveGitHub({ owner: 'owner', repo: 'archive', token: 'test', fetchImpl: async (_url, opts) => {
    if (opts.method === 'PUT') writes++;
    return new Response(JSON.stringify({ private: false }));
  } });
  await assert.rejects(store.merge('threads/123456/session.json', () => ({})), /PRIVATE/);
  assert.equal(writes, 0);
  assert.equal(archiveStore({}), null);
  assert.throws(() => archiveStore({ ARCHIVE_GITHUB_REPO: 'world', ARCHIVE_GITHUB_OWNER: 'owner', GITHUB_OWNER: 'owner', GITHUB_REPO: 'world' }), /separate/);
  assert.throws(() => new ArchiveGitHub({ owner: 'owner', repo: 'archive' }), /required/);
});
test('GitHub conflict retries merge with fresh remote events and recheck privacy', async () => {
  let puts = 0, checks = 0;
  const first = messageEvent(fixture());
  const second = messageEvent(fixture('223456789012345679', 'another message'));
  const store = new ArchiveGitHub({ owner: 'owner', repo: 'archive', token: 'test', fetchImpl: async (url, opts) => {
    if (!url.includes('/contents/')) { checks++; return Response.json({ private: true }); }
    if (opts.method === 'PUT') {
      puts++;
      if (puts === 1) return new Response('', { status: 409 });
      const body = JSON.parse(opts.body);
      const saved = JSON.parse(Buffer.from(body.content, 'base64').toString());
      assert.equal(saved.events.length, 2);
      assert.equal(body.sha, 'new-sha');
      return Response.json({});
    }
    return Response.json({ sha: puts ? 'new-sha' : 'old-sha', encoding: 'base64', content: Buffer.from(JSON.stringify({ events: puts ? [second] : [] })).toString('base64') });
  } });
  await store.merge(`threads/${thread}/2026-09-25.json`, old => ({ events: mergeEvents(old?.events, [first]) }));
  assert.equal(puts, 2); assert.equal(checks, 2);
});


test('discovery archives only bot session threads and maps existing characters', async t => {
  const { archive } = await setup(t);
  const bot = '123456789123456789';
  const session = { id: thread, ownerId: bot, name: 'Jacob \u2014 session', guildId: 'guild', createdAt: new Date('2026-09-25') };
  const unrelated = { ...session, id: '555555555555555555', name: 'private chat' };
  const otherOwner = { ...session, id: '666666666666666666', ownerId: 'other' };
  const guild = { id: 'guild', channels: {
    async fetchActiveThreads() { return { threads: new Map([[session.id, session], [unrelated.id, unrelated], [otherOwner.id, otherOwner]]) }; },
    async fetch() { return new Map(); },
  } };
  const client = { user: { id: bot }, guilds: { async fetch() { return guild; } }, channels: { async fetch() { throw new Error('not found'); } } };
  const found = await discoverArchiveThreads(client, archive, [{ id: 'jacob', name: 'Jacob' }]);
  assert.equal(found.size, 1);
  assert.equal(archive.sessions.get(thread).character_id, 'jacob');
  assert.equal(archive.sessions.has(unrelated.id), false);
});
