import { generate, buildOpeningContext } from './mc.js';
import { writeFile, updateFile, updateJSON } from './github.js';
import { chunk } from './read-utils.js';

const sessions = new Map();

// Serializes async work on a single session so concurrent player messages
// don't interleave generate() calls and produce two consecutive user turns
// (which Anthropic rejects with a 400 alternation error).
function lock(session, fn) {
  const prev = session._chain || Promise.resolve();
  const next = prev.then(() => fn(), () => fn());
  session._chain = next.catch(() => {});
  return next;
}

export async function startSession(thread, player) {
  const opening = await buildOpeningContext(player);
  const session = {
    player,
    threadId: thread.id,
    messages: [{ role: 'user', content: opening }],
    startedAt: Date.now(),
  };
  sessions.set(thread.id, session);

  await lock(session, async () => {
    await thread.sendTyping();
    const response = await generate(session);
    session.messages.push({ role: 'assistant', content: response });
    await postMCResponse(thread, response, session);
  });
}

export async function handleMessage(message) {
  const session = sessions.get(message.channel.id);
  if (!session) {
    // Session thread we no longer have state for — most likely a bot restart.
    // Tell the player so they don't sit there typing into a void.
    const ch = message.channel;
    if (ch?.isThread?.() && typeof ch.name === 'string' && ch.name.endsWith(' — session')) {
      try { await ch.send('Session state was lost (the bot likely restarted). Use `/play` to start a new session.'); } catch {}
    }
    return;
  }
  if (!message.content?.trim()) return;

  await lock(session, async () => {
    session.messages.push({ role: 'user', content: message.content });
    await message.channel.sendTyping();
    const response = await generate(session);
    session.messages.push({ role: 'assistant', content: response });
    await postMCResponse(message.channel, response, session);
  });
}

const NEW_CHAR_CLOSE_MAX_RETRIES = 2;

async function postMCResponse(thread, response, session) {
  const close = parseCloseBlock(response);

  // First-session-for-a-new-character closes MUST land a sheet and a state_patch
  // with stats — without those the dashboard shows an empty mechanics section
  // and the data the player gave during onboarding is lost. If the MC's close
  // block is incomplete, ask it to re-emit before we post the narrative, write
  // to GitHub, or archive the thread.
  if (close && session.player.id === '__new__') {
    const missing = missingNewCharCloseFields(close);
    if (missing.length) {
      const retries = session._closeRetries || 0;
      if (retries < NEW_CHAR_CLOSE_MAX_RETRIES) {
        session._closeRetries = retries + 1;
        await thread.send(
          `⚠ Onboarding close block is incomplete (missing: ${missing.join(', ')}). ` +
          `Asking the MC to re-emit before saving — retry ${session._closeRetries}/${NEW_CHAR_CLOSE_MAX_RETRIES}.`
        );
        session.messages.push({ role: 'user', content: buildCloseRetryPrompt(missing) });
        await thread.sendTyping();
        const retryResp = await generate(session);
        session.messages.push({ role: 'assistant', content: retryResp });
        await postMCResponse(thread, retryResp, session);
        return;
      }
      await thread.send(
        `⚠ Close block still incomplete after ${NEW_CHAR_CLOSE_MAX_RETRIES} retries ` +
        `(still missing: ${missing.join(', ')}). Saving what was emitted; another session will be needed to fill the rest.`
      );
      console.error(`[session-close] new-char close exhausted retries for ${session.player.name}: missing ${missing.join(', ')}`);
    }
  }

  const visible = close ? stripCloseBlock(response) : response;
  for (const part of chunk(visible)) {
    if (part.trim()) await thread.send(part);
  }

  if (close) {
    await thread.send('— *writing session close to GitHub…* —');
    await processSessionClose(thread, session, close);
    sessions.delete(session.threadId);
    if (typeof thread.setArchived === 'function') {
      thread.setArchived(true).catch(() => {});
    }
  }
}

function buildCloseRetryPrompt(missing) {
  return [
    `Your <close_session> block is missing required fields: ${missing.join(', ')}.`,
    'This is a new-character session — character creation must persist a full sheet and full initial state.',
    'Re-emit your closing message now with a COMPLETE <close_session> block, including:',
    '- <player_id>: kebab-case id (firstname-lastname)',
    '- <sheet>: the full sheet you built across onboarding (Identity, Playbook, Stats, Moves, Circle Ratings & Status, Debts, Anchors, Gear, Experience Tier)',
    '- <state_patch>: JSON with character_name, stats (Blood/Heart/Mind/Spirit), harm: 0, corrupt: 0, xp: 0, advances, circle_ratings, circle_status, safety, gear, active_arc_ids: [], last_session, notes',
    '- <handoff>: full first handoff',
    '- <npc_patch>: every NPC introduced during onboarding, with full personality-engine scores',
    '',
    'You may repeat your closing narrative if you want, but the priority is a complete close block. Do not skip the sheet because the character is short-lived — the data you collected during onboarding has to land in the repo.',
  ].join('\n');
}

function grabTag(body, tag) {
  const re = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`);
  const m = body.match(re);
  return m ? m[1].trim() : null;
}

// The close block must be the trailing content of the response (only whitespace
// allowed after </close_session>). This prevents the MC from accidentally
// ending a session by quoting the schema or echoing the tag mid-narrative.
const CLOSE_BLOCK_RE = /<close_session>([\s\S]*?)<\/close_session>\s*$/;

function parseCloseBlock(text) {
  const m = text.match(CLOSE_BLOCK_RE);
  if (!m) return null;
  const body = m[1];
  return {
    handoff:       grabTag(body, 'handoff'),
    sheet:         grabTag(body, 'sheet'),
    state_patch:   grabTag(body, 'state_patch'),
    events_append: grabTag(body, 'events_append'),
    npc_patch:     grabTag(body, 'npc_patch'),
    arc_patch:     grabTag(body, 'arc_patch'),
    interactions_patch: grabTag(body, 'interactions_patch'),
    world_event:   grabTag(body, 'world_event'),
    player_id:     grabTag(body, 'player_id'),
  };
}

function stripCloseBlock(text) {
  return text.replace(CLOSE_BLOCK_RE, '').trim();
}

function applyPatch(current, patch) {
  if (current == null) return patch;
  const out = { ...current };
  for (const [k, v] of Object.entries(patch)) {
    if (v && typeof v === 'object' && !Array.isArray(v)
        && current[k] && typeof current[k] === 'object' && !Array.isArray(current[k])) {
      out[k] = { ...current[k], ...v };
    } else {
      out[k] = v;
    }
  }
  return out;
}

async function processSessionClose(thread, session, close) {
  const id = close.player_id || session.player.id;
  if (id === '__new__') {
    await thread.send('⚠️ Cannot write session close for a new character without a player_id in the close block. Skipping writes.');
    return;
  }
  const stamp = new Date().toISOString().slice(0, 10);
  const writes = [];
  const warnings = [];

  if (close.handoff) {
    writes.push(['handoff', writeFile(
      `players/${id}/handoff.md`,
      close.handoff.endsWith('\n') ? close.handoff : close.handoff + '\n',
      `[session] handoff for ${session.player.name} (${stamp})`
    )]);
  }

  if (close.sheet) {
    writes.push(['sheet', writeFile(
      `players/${id}/sheet.md`,
      close.sheet.endsWith('\n') ? close.sheet : close.sheet + '\n',
      `[session] sheet for ${session.player.name} (${stamp})`
    )]);
  }

  let parsedStatePatch = null;
  if (close.state_patch) {
    try {
      parsedStatePatch = JSON.parse(close.state_patch);
      // RMW so a concurrent edit to state.json (rare for per-player files,
      // but cheap insurance) merges against the latest state.
      writes.push(['state', updateJSON(
        `players/${id}/state.json`,
        (current) => applyPatch(current || {}, parsedStatePatch),
        `[session] state for ${session.player.name} (${stamp})`
      )]);
    } catch (e) {
      warnings.push(`state_patch: ${e.message}`);
    }
  }

  if (close.events_append) {
    const append = close.events_append.trim();
    writes.push(['events-log', updateFile(
      'game/events-log.md',
      (current) => (current || '').replace(/\s*$/, '\n\n') + append + '\n',
      `[session] events log (${stamp})`
    )]);
  }

  if (close.npc_patch) {
    try {
      const patches = JSON.parse(close.npc_patch);
      writes.push(['npcs', updateJSON('game/npcs.json', (doc) => {
        const d = doc || { npcs: [] };
        const list = d.npcs || [];
        for (const p of patches) {
          const idx = list.findIndex(n => (p.id && n.id === p.id) || (p.name && n.name === p.name));
          if (idx >= 0) list[idx] = { ...list[idx], ...p };
          else list.push(p);
        }
        d.npcs = list;
        return d;
      }, `[session] npcs (${stamp})`)]);
    } catch (e) {
      warnings.push(`npc_patch: ${e.message}`);
    }
  }

  if (close.arc_patch) {
    try {
      const patches = JSON.parse(close.arc_patch);
      writes.push(['arcs', updateJSON('game/arcs.json', (doc) => {
        const d = doc || { arcs: [] };
        const list = d.arcs || [];
        for (const p of patches) {
          const idx = list.findIndex(a => a.id === p.id);
          if (idx >= 0) list[idx] = { ...list[idx], ...p };
          else list.push(p);
        }
        d.arcs = list;
        return d;
      }, `[session] arcs (${stamp})`)]);
    } catch (e) {
      warnings.push(`arc_patch: ${e.message}`);
    }
  }

  if (close.interactions_patch) {
    try {
      const next = JSON.parse(close.interactions_patch);
      writes.push(['interactions', updateJSON(
        'game/interactions.json',
        () => next,
        `[session] interactions (${stamp})`
      )]);
    } catch (e) {
      warnings.push(`interactions_patch: ${e.message}`);
    }
  }

  // Register a brand-new character in players/index.json so /play can find
  // them in future sessions. Only triggered when the opening flow was a new
  // character (id was '__new__') and the close block named a concrete id.
  if (session.player.id === '__new__' && id && id !== '__new__') {
    const displayName = resolveNewCharacterName(parsedStatePatch, close.sheet, id);
    writes.push(['players-index', updateJSON('players/index.json', (current) => {
      const list = Array.isArray(current) ? current : [];
      if (!list.some(p => p.id === id)) list.push({ id, name: displayName });
      return list;
    }, `[session] register new character ${id} (${stamp})`)]);
  }

  const results = await Promise.allSettled(writes.map(([, p]) => p));
  const okNames = [], failNames = [];
  results.forEach((r, i) => {
    const name = writes[i][0];
    if (r.status === 'fulfilled') okNames.push(name);
    else {
      const reason = r.reason?.message || r.reason;
      failNames.push(`${name}: ${reason}`);
      // Surface to Fly logs too — in-thread message is easy to miss and the
      // most common silent failure (player created but never indexed) leaves
      // no trace otherwise.
      console.error(`[session-close] write '${name}' failed for ${id} (${stamp}):`, reason);
    }
  });

  const lines = [];
  if (okNames.length) lines.push(`✓ wrote: ${okNames.join(', ')}`);
  if (failNames.length) lines.push(`✗ failed:\n${failNames.join('\n')}`);
  if (warnings.length) lines.push(`⚠ ${warnings.join('; ')}`);
  if (!lines.length) lines.push('No close-block fields detected — nothing written.');
  await thread.send(lines.join('\n'));

  if (close.world_event && process.env.WORLD_EVENTS_CHANNEL_ID) {
    try {
      const ch = await thread.client.channels.fetch(process.env.WORLD_EVENTS_CHANNEL_ID);
      if (ch?.isTextBased()) {
        for (const part of chunk(close.world_event)) {
          if (part.trim()) await ch.send(part);
        }
      }
    } catch (e) {
      console.warn('world event post failed:', e.message);
    }
  }
}

// Display name for a freshly-onboarded character. Preference order:
//   1. character_name from the state_patch (canonical when the MC sets it)
//   2. first H1 in the emitted sheet, with any trailing "— Character Sheet" stripped
//   3. title-cased kebab id (joe-nakama → "Joe Nakama")
// Falling back to session.player.name was wrong: for new characters that field
// is the Discord username, which leaks into the roster and the dashboard.
// Returns the list of REQUIRED close-block fields that are missing/invalid for
// a new-character (onboarding) session. Used to decide whether to commit the
// close or ask the MC to re-emit. Returning-character closes are not validated
// here — partial updates are fine for those.
export function missingNewCharCloseFields(close) {
  const missing = [];
  const pid = typeof close.player_id === 'string' ? close.player_id.trim() : '';
  if (!pid || pid === '__new__') missing.push('player_id');
  if (!close.sheet || !close.sheet.trim()) missing.push('sheet');

  let stateOk = false;
  if (close.state_patch && close.state_patch.trim()) {
    try {
      const parsed = JSON.parse(close.state_patch);
      stateOk = parsed
        && typeof parsed === 'object'
        && parsed.stats
        && typeof parsed.stats === 'object'
        && Object.keys(parsed.stats).length > 0;
    } catch {}
  }
  if (!stateOk) missing.push('state_patch (with stats)');
  return missing;
}

export function resolveNewCharacterName(parsedStatePatch, sheetText, id) {
  if (parsedStatePatch && typeof parsedStatePatch.character_name === 'string') {
    const v = parsedStatePatch.character_name.trim();
    if (v) return v;
  }
  if (sheetText) {
    const m = sheetText.match(/^#\s+(.+)$/m);
    if (m) {
      const name = m[1].replace(/\s+[—–-]\s+Character Sheet\s*$/i, '').trim();
      if (name) return name;
    }
  }
  return id.split('-').map(s => s ? s[0].toUpperCase() + s.slice(1) : s).join(' ');
}
