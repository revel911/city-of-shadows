import 'dotenv/config';
import { Client, GatewayIntentBits, Events } from 'discord.js';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { archiveStore, createArchive, recoverArchive } from '../handlers/archive-runtime.js';
import { exportTranscript } from '../handlers/archive.js';

const arg = name => { const index = process.argv.indexOf(name); return index < 0 ? undefined : process.argv[index + 1]; };
const command = process.argv[2];
if (!['backfill', 'export', 'status'].includes(command)) {
  console.log('Usage: node scripts/archive.mjs status | backfill | export --out <private-directory> [--character <id>] [--thread <id>] [--from YYYY-MM-DD] [--to YYYY-MM-DD]');
  process.exit(command ? 1 : 0);
}
try {
  const store = archiveStore();
  if (!store) throw new Error('Private archive is not configured');
  await store.verifyPrivate();
  if (command === 'backfill') {
    const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });
    try {
      const ready = new Promise(resolve => client.once(Events.ClientReady, resolve));
      await client.login(process.env.DISCORD_TOKEN); await ready;
      const target = await createArchive({ ...process.env, ARCHIVE_SPOOL_DIR: join(process.env.ARCHIVE_SPOOL_DIR || '.archive-spool', 'backfill') });
      const result = await recoverArchive(client, target);
      if (result.failed) process.exitCode = 1;
    } finally { client.destroy(); }
  } else {
    const paths = await store.list();
    const sessions = [], events = [];
    for (const path of paths) {
      if (path.endsWith('/session.json')) sessions.push((await store.read(path)).value);
    }
    if (command === 'status') {
      console.log(JSON.stringify({ private: true, threads: sessions.length, transcript_files: paths.length - sessions.length }));
    } else {
      if (!arg('--out')) throw new Error('Supply --out with a private export directory');
      for (const name of ['--from', '--to']) if (arg(name) && !/^\d{4}-\d{2}-\d{2}$/.test(arg(name))) throw new Error(`${name} requires YYYY-MM-DD`);
      const selected = sessions.filter(s => (!arg('--character') || s.character_id === arg('--character')) && (!arg('--thread') || s.thread_id === arg('--thread')));
      const ids = new Set(selected.map(s => s.thread_id));
      for (const path of paths) if (!path.endsWith('/session.json') && ids.has(path.split('/')[1])) {
        events.push(...(await store.read(path)).value.events);
      }
      const result = exportTranscript(selected, events, { from: arg('--from'), to: arg('--to') });
      const out = resolve(arg('--out')); await mkdir(out, { recursive: true, mode: 0o700 });
      await writeFile(join(out, 'transcripts.json'), JSON.stringify(result.json, null, 2) + '\n', { mode: 0o600 });
      await writeFile(join(out, 'transcripts.md'), result.markdown, { mode: 0o600 });
      console.log(`Exported ${result.json.messages.length} messages across ${selected.length} threads to ${out}`);
    }
  }
} catch (error) { console.error(`[archive] ${error.message}`); process.exitCode = 1; }
