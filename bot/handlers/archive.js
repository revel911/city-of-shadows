import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, rename, unlink, open } from 'node:fs/promises';
import { join } from 'node:path';

const snowflake = value => /^\d{6,25}$/.test(String(value));
export function messageEvent(message, kind = 'snapshot', now = new Date().toISOString()) {
  if (!snowflake(message.id) || !snowflake(message.channelId)) throw new Error('Invalid archive message identity');
  const created = message.createdAt?.toISOString() || new Date(Number((BigInt(message.id) >> 22n) + 1420070400000n)).toISOString();
  const event = {
    kind, message_id: message.id, thread_id: message.channelId,
    created_at: created, edited_at: message.editedAt?.toISOString() || null,
    author: message.author ? { id: message.author.id, name: message.author.username, bot: message.author.bot } : null,
    content: kind === 'deleted' ? null : message.content || '',
    attachments: kind === 'deleted' ? [] : [...(message.attachments?.values() || [])].map(a => ({ id: a.id, name: a.name, url: a.url, content_type: a.contentType, size: a.size })),
    embeds: kind === 'deleted' ? [] : (message.embeds || []).map(e => e.toJSON()),
    components: kind === 'deleted' ? [] : (message.components || []).map(c => c.toJSON()),
    reply_to: message.reference?.messageId || null,
  };
  // Content identity makes gateway delivery, recovery, and retry idempotent.
  const id = createHash('sha256').update(JSON.stringify(event)).digest('hex');
  return { ...event, id, observed_at: now };
}
export function mergeEvents(current, incoming) {
  const events = new Map((current || []).map(event => [event.id, event]));
  for (const event of incoming) if (!events.has(event.id)) events.set(event.id, event);
  return [...events.values()].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
}
export function exportTranscript(sessions, events, { character, thread, from, to } = {}) {
  const selected = sessions.filter(s => (!character || s.character_id === character) && (!thread || s.thread_id === thread));
  const ids = new Set(selected.map(s => s.thread_id));
  const messages = new Map();
  for (const event of events) {
    if (!ids.has(event.thread_id) || (from && event.created_at.slice(0, 10) < from) || (to && event.created_at.slice(0, 10) > to)) continue;
    const list = messages.get(event.message_id) || [];
    list.push(event); messages.set(event.message_id, list);
  }
  const rows = [...messages.values()].map(revisions => {
    revisions.sort((a, b) => (a.edited_at || a.created_at).localeCompare(b.edited_at || b.created_at) || a.observed_at.localeCompare(b.observed_at));
    const latest = revisions.filter(r => r.kind !== 'deleted').at(-1) || revisions.at(-1);
    const content = latest.content || '';
    const label = latest.author?.bot ? (/\u{1F3B2}|Fate check/u.test(content) ? 'dice / bot' : 'MC / bot')
      : /^(?:ooc\b|out of character\b)/i.test(content.trim()) ? 'player / OOC'
      : /^(?:continuity correction|correction)\b/i.test(content.trim()) ? 'player / correction' : 'player';
    return { ...latest, label, deleted: revisions.some(r => r.kind === 'deleted'), revisions };
  }).sort((a, b) => a.created_at.localeCompare(b.created_at) || (BigInt(a.message_id) < BigInt(b.message_id) ? -1 : 1));
  const markdown = ['# City of Shadows session transcripts', '', ...rows.flatMap(row => {
    const session = selected.find(s => s.thread_id === row.thread_id);
    return [`## ${row.created_at} - ${session?.character_name || session?.character_id || row.thread_id}`, '',
      `**${row.author?.name || 'Unknown'}** (${row.label})${row.deleted ? ' [deleted in Discord]' : ''}${row.edited_at ? ' [edited]' : ''}`, '',
      row.content || '(No text)', ...row.attachments.map(a => `[Attachment: ${a.name}](${a.url})`),
      ...row.embeds.map(e => e.description || e.title || '[Embed]'), '',
      `Message: ${row.message_id} | Thread: ${row.thread_id}`, ''];
  })].join('\n');
  return { json: { schema_version: 1, sessions: selected, messages: rows }, markdown };
}
async function durableJSON(path, value) {
  const temporary = path + '.tmp';
  const handle = await open(temporary, 'w', 0o600);
  try { await handle.writeFile(JSON.stringify(value)); await handle.sync(); } finally { await handle.close(); }
  await rename(temporary, path);
}
export class TranscriptArchive {
  constructor({ directory, store }) {
    this.directory = directory; this.store = store; this.sessions = new Map();
    this.queue = Promise.resolve(); this.flushing = null; this.savedSessions = new Map();
  }
  async init() {
    await mkdir(join(this.directory, 'outbox'), { recursive: true, mode: 0o700 });
    try {
      const sessions = JSON.parse(await readFile(join(this.directory, 'sessions.json'), 'utf8'));
      this.sessions = new Map(sessions.map(s => [s.thread_id, s]));
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
    return this;
  }
  serial(fn) {
    const next = this.queue.then(fn, fn); this.queue = next.catch(() => {}); return next;
  }
  register(session) {
    return this.serial(async () => {
      if (!snowflake(session.thread_id)) throw new Error('Invalid archive thread');
      const next = { ...this.sessions.get(session.thread_id), ...session };
      this.sessions.set(session.thread_id, next);
      await durableJSON(join(this.directory, 'sessions.json'), [...this.sessions.values()]);
      return next;
    });
  }
  capture(message, kind) {
    return this.serial(async () => {
      if (!this.sessions.has(message.channelId)) return;
      const event = messageEvent(message, kind);
      await durableJSON(join(this.directory, 'outbox', event.id + '.json'), event);
    });
  }
  async recover(thread) {
    let before, count = 0;
    while (true) {
      const page = await thread.messages.fetch({ limit: 100, ...(before ? { before } : {}) });
      if (!page.size) break;
      for (const message of page.values()) { await this.capture(message); count++; }
      const oldest = [...page.keys()].reduce((a, b) => BigInt(a) < BigInt(b) ? a : b);
      if (oldest === before) throw new Error('Discord history pagination did not advance');
      before = oldest;
      if (page.size < 100) break;
    }
    return count;
  }
  flush() {
    if (this.flushing) return this.flushing;
    this.flushing = this.flushNow().finally(() => { this.flushing = null; });
    return this.flushing;
  }
  async flushNow() {
    await this.queue;
    const files = (await readdir(join(this.directory, 'outbox'))).filter(name => /^[a-f0-9]{64}\.json$/.test(name));
    const groups = new Map();
    for (const file of files) {
      const event = JSON.parse(await readFile(join(this.directory, 'outbox', file), 'utf8'));
      const key = `threads/${event.thread_id}/${event.created_at.slice(0, 10)}.json`;
      const group = groups.get(key) || []; group.push({ event, file }); groups.set(key, group);
    }
    // Persist registration even for threads with no messages yet.
    for (const session of this.sessions.values()) {
      const signature = JSON.stringify(session);
      if (this.savedSessions.get(session.thread_id) === signature) continue;
      await this.store.merge(`threads/${session.thread_id}/session.json`, old => ({ ...old, ...session, schema_version: 1 }));
      this.savedSessions.set(session.thread_id, signature);
    }
    for (const [path, group] of groups) {
      await this.store.merge(path, old => ({ schema_version: 1, events: mergeEvents(old?.events, group.map(x => x.event)) }));
      // A repeated snapshot has the same content/id, so removing it after success is safe.
      for (const { file } of group) await unlink(join(this.directory, 'outbox', file)).catch(error => { if (error.code !== 'ENOENT') throw error; });
    }
    return { files: files.length, batches: groups.size };
  }
}
