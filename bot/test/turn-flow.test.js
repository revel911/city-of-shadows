import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  creationStage,
  handleMessage,
  hasLiveSession,
  resetWorldRevisionCache,
  shouldCommitDraft,
  startSession,
} from '../handlers/session.js';
import { resetSystemCache } from '../handlers/mc.js';
import { deserializeSession, loadSessionSnapshot, saveSessionSnapshot, serializeSession } from '../handlers/runtime-store.js';

const character = 'turn-test';
const state = { character_name: 'Morgan', playbook: 'The Veteran', stats: { Blood: 2, Heart: 0, Mind: 1, Spirit: -1 }, last_session: 'session_001' };

function makeThread(id) {
  const sent = [];
  return {
    id, sent, name: 'Morgan — session', archived: false,
    isThread: () => true,
    send: async value => { sent.push(value); return { id: `m${sent.length}`, delete: async () => {} }; },
    sendTyping: async () => {},
    setName: async () => {},
    setArchived: async function(value) { this.archived = value; },
  };
}

const texts = thread => thread.sent.map(value => typeof value === 'string' ? value : value?.content || '');

// Fake GitHub (contents + git data API) and DeepSeek. Model calls are routed
// by role, because the move router and the narrator now run concurrently.
function fakeWorld(t, initial = {}, { narrator = [], router = [] } = {}) {
  const files = new Map(Object.entries(initial).map(([key, value]) => [key, typeof value === 'string' ? value : JSON.stringify(value)]));
  const reads = [];
  const git = { commits: 0, pendingTree: null };
  const calls = { narrator: 0, router: 0 };
  for (const [key, value] of Object.entries({ GITHUB_TOKEN: 'test', GITHUB_OWNER: 'test', GITHUB_REPO: 'test', DEEPSEEK_API_KEY: 'test' })) {
    const before = process.env[key]; process.env[key] = value;
    t.after(() => { if (before === undefined) delete process.env[key]; else process.env[key] = before; });
  }
  const originalFetch = globalThis.fetch;
  const json = value => new Response(JSON.stringify(value), { status: 200, headers: { 'Content-Type': 'application/json' } });
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input?.url || input);
    if (url.includes('deepseek.com')) {
      const body = JSON.parse(init.body);
      const isRouter = /strict rules router/.test(body.messages[0]?.content || '');
      const queue = isRouter ? router : narrator;
      calls[isRouter ? 'router' : 'narrator'] += 1;
      const content = queue.shift();
      if (content === undefined) throw new Error(`Unexpected ${isRouter ? 'router' : 'narrator'} call`);
      return json({ choices: [{ message: { role: 'assistant', content }, finish_reason: 'stop' }], usage: {} });
    }
    const pathname = new URL(url).pathname;
    if (pathname.includes('/git/')) {
      const method = init.method || 'GET';
      if (/\/git\/ref\/heads\//.test(pathname)) return json({ object: { sha: `head-${git.commits}` } });
      if (/\/git\/commits\/[^/]+$/.test(pathname) && method === 'GET') return json({ tree: { sha: 'tree-base' } });
      if (pathname.endsWith('/git/trees')) { git.pendingTree = JSON.parse(init.body).tree; return json({ sha: 'tree-new' }); }
      if (pathname.endsWith('/git/commits')) return json({ sha: `commit-${git.commits + 1}` });
      if (/\/git\/refs\/heads\//.test(pathname) && method === 'PATCH') {
        for (const entry of git.pendingTree || []) files.set(entry.path, entry.content);
        git.commits += 1;
        return json({ object: { sha: `commit-${git.commits}` } });
      }
      throw new Error(`Unexpected git call ${method} ${pathname}`);
    }
    const path = decodeURIComponent(pathname.split('/contents/')[1]);
    if (init.method === 'PUT') {
      files.set(path, Buffer.from(JSON.parse(init.body).content, 'base64').toString('utf8'));
      git.commits += 1;
      return json({ content: { sha: 'test' }, commit: { sha: 'put' } });
    }
    reads.push(path);
    if (!files.has(path)) return new Response('', { status: 404 });
    return json({ content: Buffer.from(files.get(path)).toString('base64'), sha: 'test' });
  };
  t.after(() => { globalThis.fetch = originalFetch; resetSystemCache(); resetWorldRevisionCache(); });
  return { files, reads, git, calls };
}

const opening = '**Where we left off**\nOn the loading dock. The driver has not seen you.';

test('a roll request gets a bot-written prompt with buttons, and "4 2" resolves it in one message', async t => {
  const world = fakeWorld(t, { [`players/${character}/state.json`]: state }, {
    narrator: [
      opening,
      'You close on the truck. The driver reaches for the door. Roll two dice and tell me their total, or use /roll.\n<roll_request>{"move":"Turn to Violence","modifier_type":"stat","modifier_key":"Blood"}</roll_request>',
      'You drag him out onto the concrete before he can react.',
    ],
  });
  const thread = makeThread('roll-flow');
  await startSession(thread, { id: character, name: 'Morgan', discord_id: '1' });
  await handleMessage({ channel: thread, author: { id: '1' }, content: 'I attack the driver before he locks the door.', id: 'a' });

  const prompt = thread.sent.find(value => value?.components?.length && /Roll for/.test(value.content));
  assert.ok(prompt, 'roll prompt with buttons was posted');
  assert.match(prompt.content, /\*\*Turn to Violence\*\* \(Blood \+2\)/);
  assert.ok(!texts(thread).some(text => /\/roll|tell me their total/.test(text) && !/Roll for/.test(text)), 'model roll wording was removed');

  const stateReads = world.reads.filter(path => path.endsWith('state.json')).length;
  await handleMessage({ channel: thread, author: { id: '1' }, content: '4 2', id: 'b' });
  assert.ok(texts(thread).some(text => /\*\*4\*\* \(Instinct\) · \*\*2\*\* \+ 2 → \*\*8\*\*, mixed hit/.test(text)));
  assert.ok(texts(thread).includes('You drag him out onto the concrete before he can react.'));
  assert.equal(world.reads.filter(path => path.endsWith('state.json')).length, stateReads, 'roll used cached state');
  assert.equal(world.git.commits, 0, 'play turns do not commit');
});

test('ambiguous turns run the move router alongside the narrator and use the draft when no roll is needed', async t => {
  const world = fakeWorld(t, { [`players/${character}/state.json`]: state }, {
    narrator: [opening, 'The driver lights a cigarette and does not look your way.'],
    router: ['{"decision":"none","reason":"observation"}'],
  });
  const thread = makeThread('parallel-flow');
  await startSession(thread, { id: character, name: 'Morgan', discord_id: '1' });
  await handleMessage({ channel: thread, author: { id: '1' }, content: 'I wait by the dumpster and watch the cab.', id: 'a' });
  assert.equal(world.calls.router, 1);
  assert.equal(world.calls.narrator, 2, 'no extra narration call after the router');
  assert.ok(texts(thread).includes('The driver lights a cigarette and does not look your way.'));
});

test('a router roll decision regenerates only when the speculative draft skipped the roll', async t => {
  const world = fakeWorld(t, { [`players/${character}/state.json`]: state }, {
    narrator: [
      opening,
      'You slip past him without a sound.',
      'You edge along the wall as the driver turns his head.\n<roll_request>{"move":"Keep Your Cool","modifier_type":"stat","modifier_key":"Spirit"}</roll_request>',
    ],
    router: ['{"decision":"roll","move":"Keep Your Cool","reason":"sneaking past an alert driver"}'],
  });
  const thread = makeThread('parallel-roll');
  await startSession(thread, { id: character, name: 'Morgan', discord_id: '1' });
  await handleMessage({ channel: thread, author: { id: '1' }, content: 'I try to slip past him to the office.', id: 'a' });
  assert.equal(world.calls.narrator, 3);
  assert.ok(!texts(thread).includes('You slip past him without a sound.'));
  assert.ok(thread.sent.some(value => /Roll for \*\*Keep Your Cool\*\* \(Spirit −1\)/.test(value?.content || '')));
});

test('a restart resumes the exact session from the runtime snapshot', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'cos-runtime-'));
  const before = process.env.RUNTIME_DIR;
  process.env.RUNTIME_DIR = dir;
  t.after(async () => { if (before === undefined) delete process.env.RUNTIME_DIR; else process.env.RUNTIME_DIR = before; await rm(dir, { recursive: true, force: true }); });
  fakeWorld(t, {}, { narrator: ['The office door is locked. A keypad glows beside it.'] });
  const snapshot = {
    player: { id: character, name: 'Morgan', discord_id: '1' }, draftId: character, threadId: 'restart-flow',
    messages: [{ role: 'user', content: 'opening' }, { role: 'assistant', content: opening }],
    rolls: [], mechanicsGateTriggers: 0, mechanicsAdjudications: 0, turnsWithoutRoll: 0,
    profileReady: true, mechanicsDepth: 3, mechanicsSheet: '', rulesProfile: { isNew: false }, worldRevision: 0,
    state, hydratedNpcIds: new Set(['npc_x']),
  };
  assert.ok(await saveSessionSnapshot(snapshot));
  assert.deepEqual([...(await loadSessionSnapshot('restart-flow')).hydratedNpcIds], ['npc_x']);
  assert.equal(hasLiveSession('restart-flow'), false);

  const thread = makeThread('restart-flow');
  await handleMessage({ channel: thread, author: { id: '1' }, content: 'OOC: where am I again?', id: 'a' });
  assert.equal(hasLiveSession('restart-flow'), true);
  assert.ok(texts(thread).includes('The office door is locked. A keypad glows beside it.'));
  assert.ok(!texts(thread).some(text => /restarted/.test(text)));
  // The snapshot is refreshed after every turn.
  assert.equal((await loadSessionSnapshot('restart-flow')).messages.length, 4);
});

test('snapshot serialization drops caches and restores sets', () => {
  const session = { player: { id: 'a' }, messages: [], npcCatalog: [{ id: 'npc' }], _chain: Promise.resolve(), hydratedNpcIds: new Set(['n1']) };
  const restored = deserializeSession(JSON.parse(JSON.stringify(serializeSession(session))));
  assert.equal(restored.npcCatalog, null);
  assert.equal(restored._chain, undefined);
  assert.ok(restored.hydratedNpcIds.has('n1'));
  assert.equal(deserializeSession({ schema_version: 99 }), null);
});

test('creation drafts commit at stage changes and stay local between them', () => {
  const session = { player: { id: 'pc' }, draftStage: 'abilities', draftCommittedAt: 1000 };
  assert.equal(creationStage({ next_step: 'Choose your moves.' }), 'abilities');
  assert.equal(creationStage({ next_step: 'Pick your Circle ratings.' }), 'connections');
  assert.equal(creationStage({ creation_stage: 'Review', next_step: 'anything' }), 'review');
  assert.equal(shouldCommitDraft(session, { next_step: 'Choose one more move.' }, 2000), false);
  assert.equal(shouldCommitDraft(session, { next_step: 'Name your Debts.' }, 2000), true);
  assert.equal(shouldCommitDraft(session, { creation_status: 'ready' }, 2000), true);
  assert.equal(shouldCommitDraft(session, { next_step: 'Choose one more move.' }, 1000 + 10 * 60 * 1000), true);
  assert.equal(shouldCommitDraft({ player: { id: '__new__' } }, { next_step: 'x' }, 0), true);
});
