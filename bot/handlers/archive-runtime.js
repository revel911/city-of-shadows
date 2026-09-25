import { resolve } from 'node:path';
import { TranscriptArchive } from './archive.js';
import { ArchiveGitHub } from './archive-github.js';
import { readJSON } from './github.js';

let archive = null;
let discord = null;
let recovering = null;
export function archiveStore(env = process.env) {
  if (!env.ARCHIVE_GITHUB_REPO) return null;
  if (env.ARCHIVE_GITHUB_REPO === env.GITHUB_REPO && env.ARCHIVE_GITHUB_OWNER === env.GITHUB_OWNER) {
    throw new Error('Archive must be separate from the world repository');
  }
  return new ArchiveGitHub({ owner: env.ARCHIVE_GITHUB_OWNER, repo: env.ARCHIVE_GITHUB_REPO,
    token: env.ARCHIVE_GITHUB_TOKEN || env.GITHUB_TOKEN, branch: env.ARCHIVE_GITHUB_BRANCH || 'main' });
}
export async function createArchive(env = process.env) {
  const store = archiveStore(env);
  if (!store) return null;
  const directory = resolve(env.ARCHIVE_SPOOL_DIR || '.archive-spool');
  return new TranscriptArchive({ directory, store }).init();
}
export async function registerArchiveThread(thread, character) {
  if (!archive) return;
  await archive.register({ thread_id: thread.id, guild_id: thread.guildId,
    character_id: character.id, character_name: character.name || character.id,
    thread_name: thread.name, created_at: thread.createdAt?.toISOString() || null });
}
export async function captureArchiveMessage(message, kind = 'snapshot') {
  if (!archive || !archive.sessions.has(message.channelId)) return;
  if (kind !== 'deleted' && message.partial) message = await message.fetch();
  await archive.capture(message, kind);
}
export async function discoverArchiveThreads(client, target, roster) {
  const guild = await client.guilds.fetch(process.env.DISCORD_GUILD_ID);
  const found = new Map();
  const add = thread => {
    if (thread.ownerId !== client.user.id || !/ \u2014 (?:session|new character)$/.test(thread.name)) return;
    found.set(thread.id, thread);
  };
  const active = await guild.channels.fetchActiveThreads();
  active.threads.forEach(add);
  const channels = await guild.channels.fetch();
  for (const parent of channels.values()) {
    if (!parent?.threads?.fetchArchived) continue;
    for (const type of ['public', 'private']) {
      let before;
      while (true) {
        let page;
        try { page = await parent.threads.fetchArchived({ type, limit: 100, ...(before ? { before } : {}) }); }
        catch (error) {
          // Lack of access to an unrelated channel is expected; stored thread recovery runs separately.
          if ([50001, 50013].includes(error.code)) break;
          throw error;
        }
        page.threads.forEach(add);
        if (!page.hasMore || !page.threads.size) break;
        const last = [...page.threads.values()].at(-1);
        const next = type === 'private' ? last.id : last.archivedAt;
        if (String(next) === String(before)) throw new Error('Archive thread pagination did not advance');
        before = next;
      }
    }
  }
  // Stable roster IDs survive thread renames, and also recover threads outside discovery results.
  for (const player of roster) if (player.thread_id && !found.has(player.thread_id)) {
    const thread = await client.channels.fetch(player.thread_id).catch(() => null);
    if (thread?.isThread() && thread.guildId === guild.id) found.set(thread.id, thread);
  }
  for (const thread of found.values()) {
    const name = thread.name.replace(/ \u2014 (?:session|new character)$/, '');
    const matches = roster.filter(p => p.name === name);
    const player = roster.find(p => p.thread_id === thread.id) || (matches.length === 1 ? matches[0] : null);
    const existing = target.sessions.get(thread.id);
    await target.register({ thread_id: thread.id, guild_id: guild.id,
      character_id: player?.id || existing?.character_id || null,
      character_name: player?.name || existing?.character_name || name,
      thread_name: thread.name, created_at: thread.createdAt?.toISOString() || null });
  }
  return found;
}
export async function recoverArchive(client, target, { discover = true } = {}) {
  const found = discover ? await discoverArchiveThreads(client, target, await readJSON('players/index.json') || []) : new Map();
  let count = 0, failed = 0;
  for (const session of target.sessions.values()) {
    try {
      const thread = found.get(session.thread_id) || await client.channels.fetch(session.thread_id);
      if (!thread?.isThread()) throw new Error('Stored session thread is unavailable');
      count += await target.recover(thread);
    } catch (error) {
      failed++;
      console.error(`[archive] recovery failed thread=${session.thread_id}: ${error.message}`);
    }
  }
  const flushed = await target.flush();
  console.log(`[archive] recovered ${count} messages across ${target.sessions.size} threads; unavailable=${failed}; batches=${flushed.batches}`);
  return { messages: count, threads: target.sessions.size, failed };
}
export async function initializeArchive(client) {
  archive = await createArchive();
  if (!archive) { console.log('[archive] disabled: no private repository configured'); return; }
  discord = client;
  console.log('[archive] durable capture enabled; private repository writes queued');
  const recover = () => {
    if (recovering) return recovering;
    recovering = recoverArchive(discord, archive).catch(error => console.error(`[archive] recovery: ${error.message}`))
      .finally(() => { recovering = null; });
    return recovering;
  };
  setInterval(() => archive.flush().catch(error => console.error(`[archive] retry pending: ${error.message}`)), 30000).unref();
  // A full scan also catches edits made while the bot was disconnected.
  setInterval(recover, 15 * 60 * 1000).unref();
  await recover();
}
