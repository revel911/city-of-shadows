import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lifecycleIntent, lifecyclePrompt, creationProgress, persistencePayloadProblems } from '../handlers/lifecycle.js';
import { isNarrativeFollowThrough, isOutOfCharacterMessage, buildSceneDirectorContext } from '../handlers/scene-director.js';
import { processSaveOnboarding, sessionControls, startSession, handleMessage, hasLiveSession, resetWorldRevisionCache } from '../handlers/session.js';
import { resetSystemCache, buildOpeningContext } from '../handlers/mc.js';
import { execute as play } from '../commands/play.js';
import { CANONICAL_SHEET_SECTIONS } from '../handlers/character-sheet.js';

const sheet = (name, unfinished = true) => `# ${name} - Character Sheet\n\n` + CANONICAL_SHEET_SECTIONS.map(section => `## ${section}\n${unfinished ? 'TBD' : 'Confirmed details.'}`).join('\n\n');
const character = 'character-test';
const state = { character_name: 'Morgan', playbook: 'The Veteran', stats: { Blood: 1, Heart: 0, Mind: 2, Spirit: -1 } };
const save = (changes = {}) => ({ character_id: character, sheet: sheet('Morgan'), state_patch: JSON.stringify(state), relationship_patch: '[]', debt_patch: '[]', creation_status: 'draft', next_step: 'Choose your moves.', ...changes });
const makeSession = () => ({ player: { id: '__new__', name: 'Player', discord_id: '123' }, draftId: character, rulesProfile: { isNew: true }, messages: [], threadId: 'thread-test' });
function makeThread(id = 'thread-test') {
  const sent = [];
  return { id, sent, archived: false, send: async value => { sent.push(value); return { delete: async () => {} }; }, sendTyping: async () => {}, setName: async () => {}, setArchived: async function(value) { this.archived = value; } };
}
function fakeGit(t, initial = {}, { failPath, failTimes = Infinity, responses = [] } = {}) {
  const files = new Map(Object.entries(initial).map(([key, value]) => [key, typeof value === 'string' ? value : JSON.stringify(value)]));
  const writes = [];
  const git = { commits: 0, pendingTree: null };
  for (const [key, value] of Object.entries({ GITHUB_TOKEN: 'test', GITHUB_OWNER: 'test', GITHUB_REPO: 'test', DEEPSEEK_API_KEY: 'test' })) {
    const before = process.env[key]; process.env[key] = value;
    t.after(() => { if (before === undefined) delete process.env[key]; else process.env[key] = before; });
  }
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input?.url || input);
    if (url.includes('deepseek.com')) {
      const content = responses.shift();
      if (content === undefined) throw new Error('Unexpected model call');
      return new Response(JSON.stringify({ choices: [{ message: { role: 'assistant', content }, finish_reason: 'stop' }], usage: {} }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    const pathname = new URL(url).pathname;
    // Git Data API: batched saves land as one commit via a tree of inline blobs.
    if (pathname.includes('/git/')) {
      const json = value => new Response(JSON.stringify(value), { status: 200 });
      if (/\/git\/ref\/heads\//.test(pathname)) return json({ object: { sha: `head-${git.commits}` } });
      if (/\/git\/commits\/[^/]+$/.test(pathname) && (init.method || 'GET') === 'GET') return json({ tree: { sha: 'tree-base' } });
      if (pathname.endsWith('/git/trees')) {
        const body = JSON.parse(init.body);
        if (failPath && body.tree.some(entry => entry.path === failPath) && failTimes-- > 0) return new Response('test write failure', { status: 500 });
        git.pendingTree = body.tree;
        return json({ sha: 'tree-new' });
      }
      if (pathname.endsWith('/git/commits')) return json({ sha: `commit-${git.commits + 1}` });
      if (/\/git\/refs\/heads\//.test(pathname) && init.method === 'PATCH') {
        for (const entry of git.pendingTree || []) { files.set(entry.path, entry.content); writes.push(entry.path); }
        git.pendingTree = null;
        git.commits += 1;
        return json({ object: { sha: `commit-${git.commits}` } });
      }
      throw new Error(`Unexpected git call ${init.method || 'GET'} ${pathname}`);
    }
    const path = decodeURIComponent(pathname.split('/contents/')[1]);
    if (init.method === 'PUT') {
      if (path === failPath && failTimes-- > 0) return new Response('test write failure', { status: 500 });
      const body = JSON.parse(init.body);
      files.set(path, Buffer.from(body.content, 'base64').toString('utf8'));
      writes.push(path);
      return new Response(JSON.stringify({ content: { sha: 'test' }, commit: { sha: 'commit-test' } }), { status: 200 });
    }
    if (!files.has(path)) return new Response('', { status: 404 });
    return new Response(JSON.stringify({ content: Buffer.from(files.get(path)).toString('base64'), sha: 'test' }), { status: 200 });
  };
  t.after(() => { globalThis.fetch = originalFetch; resetSystemCache(); resetWorldRevisionCache(); });
  return { files, writes, git };
}

test('explicit lifecycle requests bypass fictional interpretation, ordinary dialogue does not', () => {
  for (const text of ['done for tonight', "let's stop here", 'Save & end', 'finish later']) assert.equal(lifecycleIntent(text), 'end');
  for (const text of ['save', 'save my character', 'retry saving']) assert.equal(lifecycleIntent(text), 'save');
  for (const text of ['I save the child', 'I tell her to end the session', 'Can I save later?', 'We stop the car']) assert.equal(lifecycleIntent(text), null);
});

test('envelope continuations complete the MC beat while genuine OOC stays paused', () => {
  for (const text of ['And....', 'And…?', "It's your freaking mystery, how would I know", 'What is inside?']) {
    assert.equal(isNarrativeFollowThrough(text), true);
    assert.equal(isOutOfCharacterMessage(text), false);
    assert.match(buildSceneDirectorContext({ playerText: text }), /author a concrete discovery/);
  }
  assert.equal(isOutOfCharacterMessage('OOC: Why did you refuse?'), true);
  assert.match(buildSceneDirectorContext({ playerText: 'And...', forceOoc: true }), /OUT-OF-CHARACTER PAUSE/);
});

test('ready requires complete mechanics and draft save does not imply ready', () => {
  assert.equal(creationProgress(save(), state).status, 'draft');
  assert.throws(() => creationProgress(save({ creation_status: 'ready' }), state), /required character choices/);
  assert.throws(() => creationProgress(save({ creation_status: 'ready', sheet: sheet('Morgan', false) }), {}), /required character choices/);
  assert.equal(creationProgress(save({ creation_status: 'ready', sheet: sheet('Morgan', false) }), state).status, 'ready');
});

test('save and end instructions preserve the pending roll and never require a player recap', () => {
  const prompt = lifecyclePrompt('end', { player: { id: character }, rulesProfile: {}, pendingRoll: { move: 'Keep Your Cool' }, pendingManualRoll: { rawTotal: 4 } });
  assert.match(prompt, /Do not advance time/);
  assert.match(prompt, /Keep Your Cool/);
  assert.match(prompt, /rawTotal/);
  assert.match(prompt, /<close_session>/);
  assert.equal(sessionControls(makeSession()).components.length, 2);
});

test('successive draft saves update the same character and preserve earlier state', async t => {
  const git = fakeGit(t);
  const session = makeSession(), thread = makeThread();
  assert.equal((await processSaveOnboarding(thread, session, save())).success, true);
  assert.equal(session.rulesProfile.isNew, true);
  assert.equal((await processSaveOnboarding(thread, session, save({ state_patch: JSON.stringify({ character_name: 'Morgan Revised' }), next_step: 'Choose connections.' }))).success, true);
  assert.equal(JSON.parse(git.files.get(`players/${character}/state.json`)).character_name, 'Morgan Revised');
  assert.equal(JSON.parse(git.files.get(`players/${character}/state.json`)).stats.Mind, 2);
  assert.equal(JSON.parse(git.files.get('players/index.json')).length, 1);
  assert.equal(JSON.parse(git.files.get(`players/${character}/creation.json`)).next_step, 'Choose connections.');
});

test('failed draft write leaves creation open and never claims a full save', async t => {
  const git = fakeGit(t, {}, { failPath: `players/${character}/sheet.md` });
  const session = makeSession(), thread = makeThread();
  assert.equal((await processSaveOnboarding(thread, session, save())).success, false);
  assert.equal(session.rulesProfile.isNew, true);
  assert.equal(thread.archived, false);
  // Saves are one atomic commit, so a failure leaves no partial draft behind.
  assert.equal(git.writes.length, 0);
  assert.equal(git.files.has(`players/${character}/creation.json`), false);
  assert.ok(!thread.sent.some(text => typeof text === 'string' && text.startsWith('Draft saved.')));
});

test('draft save cannot target another character or write safety into character state', async t => {
  const git = fakeGit(t);
  const session = makeSession(), thread = makeThread();
  assert.equal((await processSaveOnboarding(thread, session, save({ character_id: 'other-character' }))).success, false);
  assert.equal(git.writes.length, 0);
  await processSaveOnboarding(thread, session, save({ state_patch: JSON.stringify({ ...state, safety: { hard_limits: ['private'] }, profile_patch: { safety: {} } }) }));
  const saved = JSON.parse(git.files.get(`players/${character}/state.json`));
  assert.equal(saved.safety, undefined);
  assert.equal(saved.profile_patch, undefined);
});

test('draft opening resumes the saved next step rather than starting fictional play', async t => {
  fakeGit(t, { [`players/${character}/creation.json`]: { status: 'draft', next_step: 'Choose connections.' }, [`players/${character}/sheet.md`]: sheet('Morgan'), [`players/${character}/state.json`]: state });
  const opening = await buildOpeningContext({ id: character, name: 'Morgan' });
  assert.match(opening, /Resume character creation/);
  assert.match(opening, /Choose connections/);
  assert.doesNotMatch(opening, /Give the returning-character recap/);
});

test('explicit checkpoint save works with a pending roll and survives restart data', async t => {
  const pending = { move: 'Keep Your Cool', modifier_key: 'Spirit' };
  const git = fakeGit(t, {
    [`players/${character}/state.json`]: state,
    [`players/${character}/checkpoint.json`]: { active: true, summary: 'On the catwalk.', pending_roll: pending, pending_manual_roll: { rawTotal: 4 } },
  }, { responses: ['**Where we left off**\nYou are on the catwalk. The roll is still pending.', '<checkpoint>{"summary":"On the catwalk, awaiting the Instinct Die.","pending_mechanics":["Keep Your Cool"]}</checkpoint>'] });
  const thread = makeThread('checkpoint-test');
  await startSession(thread, { id: character, name: 'Morgan', discord_id: '123' });
  await handleMessage({ channel: thread, author: { id: '123' }, content: 'save progress', id: 'message-1' });
  const checkpoint = JSON.parse(git.files.get(`players/${character}/checkpoint.json`));
  assert.deepEqual(checkpoint.pending_roll, pending);
  assert.deepEqual(checkpoint.pending_manual_roll, { rawTotal: 4 });
  assert.equal(hasLiveSession(thread.id), true);
  assert.equal(thread.archived, false);
  assert.ok(thread.sent.some(value => typeof value === 'string' && value.startsWith('Recovery checkpoint saved.')));
});


test('save and end archives only after durable writes and preserves unresolved mechanics', async t => {
  const pending = { move: 'Keep Your Cool', modifier_key: 'Spirit' };
  const git = fakeGit(t, {
    [`players/${character}/state.json`]: { ...state, last_session: 'session_000' },
    [`players/${character}/checkpoint.json`]: { active: true, summary: 'On the catwalk.', pending_roll: pending },
  }, { responses: ['**Where we left off**\nYou are on the catwalk. The roll is pending.', `<close_session><character_id>${character}</character_id><handoff>On the catwalk. Keep Your Cool remains unresolved.</handoff><world_impact>{"level":"personal","summary":"Paused before rolling","affected_ids":[]}</world_impact></close_session>`] });
  const thread = makeThread('close-test');
  await startSession(thread, { id: character, name: 'Morgan', discord_id: '123' });
  await handleMessage({ channel: thread, author: { id: '123' }, content: 'done for tonight', id: 'message-close' });
  assert.equal(thread.archived, true);
  assert.equal(hasLiveSession(thread.id), false);
  assert.match(git.files.get(`players/${character}/handoff.md`), /unresolved/);
  assert.deepEqual(JSON.parse(git.files.get(`players/${character}/checkpoint.json`)).pending_roll, pending);
  assert.equal(JSON.parse(git.files.get(`players/${character}/state.json`)).last_session, 'session_001');
  // Handoff, state, ledger, receipt, and checkpoint land as one atomic commit.
  assert.equal(git.git.commits, 1);
  assert.ok(git.files.has(`players/${character}/sessions/session_001.json`));
  // The closing status arrives after the narration, never before it.
  const sent = thread.sent.filter(value => typeof value === 'string');
  assert.ok(sent.indexOf('Saving your session…') < sent.indexOf('Session saved. Use /play when you want to continue.'));
});

test('save and end failure does not archive or lose the active session', async t => {
  fakeGit(t, { [`players/${character}/state.json`]: state }, { failPath: `players/${character}/handoff.md`, responses: [
    '**Where we left off**\nOutside the gym, holding the open envelope.',
    `<close_session><character_id>${character}</character_id><handoff>Outside the gym.</handoff><world_impact>{"level":"personal","summary":"Paused","affected_ids":[]}</world_impact></close_session>`,
  ] });
  const thread = makeThread('failed-close-test');
  await startSession(thread, { id: character, name: 'Morgan', discord_id: '123' });
  await handleMessage({ channel: thread, author: { id: '123' }, content: 'save & end', id: 'message-failed-close' });
  assert.equal(thread.archived, false);
  assert.equal(hasLiveSession(thread.id), true);
  assert.ok(!thread.sent.includes('Session saved. Use /play when you want to continue.'));
});


test('a failed close writes nothing, and the retry lands once without double-incrementing the session', async t => {
  const git = fakeGit(t, { [`players/${character}/state.json`]: { ...state, last_session: 'session_000' } }, { failPath: `players/${character}/handoff.md`, failTimes: 1, responses: [
    '**Where we left off**\nOutside the gym, holding the open envelope.',
    `<close_session><character_id>${character}</character_id><handoff>Outside the gym.</handoff><world_impact>{"level":"personal","summary":"Paused","affected_ids":[]}</world_impact></close_session>`,
  ] });
  const thread = makeThread('retry-close-test');
  await startSession(thread, { id: character, name: 'Morgan', discord_id: '123' });
  await handleMessage({ channel: thread, author: { id: '123' }, content: 'save & end', id: 'first-close' });
  assert.equal(thread.archived, false);
  await handleMessage({ channel: thread, author: { id: '123' }, content: 'save & end', id: 'retry-close' });
  assert.equal(thread.archived, true);
  assert.equal(JSON.parse(git.files.get(`players/${character}/state.json`)).last_session, 'session_001');
  assert.equal(git.writes.filter(path => path === `players/${character}/state.json`).length, 1);
});


test('/play recovers the saved active thread after restart instead of blocking or duplicating it', async t => {
  const thread = makeThread('recover-play-test');
  thread.members = { add: async () => {} };
  const git = fakeGit(t, {
    'players/index.json': [{ id: character, name: 'Morgan', owner_id: '123', thread_id: thread.id }],
    [`players/${character}/state.json`]: state,
    [`players/${character}/checkpoint.json`]: { active: true, thread_id: thread.id, summary: 'At the gym.' },
  }, { responses: ['**Where we left off**\nOutside the gym with the envelope already open.'] });
  let created = 0;
  const replies = [];
  const channel = { threads: { create: async () => { created += 1; throw new Error('Must recover existing thread'); } }, guild: { channels: { fetch: async id => id === thread.id ? thread : null } } };
  await play({ deferReply: async () => {}, editReply: async value => replies.push(value), channel, options: { getString: () => character }, user: { id: '123', username: 'Player' } });
  assert.equal(created, 0);
  assert.equal(hasLiveSession(thread.id), true);
  assert.ok(replies.some(value => value.content?.includes(thread.id)));
});

test('/play prefers the current roster thread over an old completed checkpoint thread', async t => {
  const thread = makeThread('newer-play-test');
  thread.members = { add: async () => {} };
  fakeGit(t, {
    'players/index.json': [{ id: character, name: 'Morgan', owner_id: '123', thread_id: thread.id }],
    [`players/${character}/state.json`]: state,
    [`players/${character}/checkpoint.json`]: { active: false, thread_id: 'old-thread', summary: 'Closed.' },
  }, { responses: ['**Where we left off**\nOutside the gym with the envelope already open.'] });
  const fetched = [];
  const channel = { threads: { create: async () => { throw new Error('No duplicate thread'); } }, guild: { channels: { fetch: async id => { fetched.push(id); return thread; } } } };
  await play({ deferReply: async () => {}, editReply: async () => {}, channel, options: { getString: () => character }, user: { id: '123', username: 'Player' } });
  assert.deepEqual(fetched, [thread.id]);
});


test('malformed persistence fields are rejected before any writes', async t => {
  const git = fakeGit(t);
  const session = makeSession(), thread = makeThread();
  assert.equal((await processSaveOnboarding(thread, session, save({ npc_patch: '{broken' }))).success, false);
  assert.equal(git.writes.length, 0);
  assert.ok(persistencePayloadProblems({ state_patch: '[]' }).length);
  assert.ok(persistencePayloadProblems({ debt_patch: '{}' }).length);
  assert.deepEqual(persistencePayloadProblems({ state_patch: '{}', debt_patch: '[]' }), []);
});
