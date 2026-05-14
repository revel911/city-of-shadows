import { generate, buildOpeningContext } from './mc.js';
import { writeFile, readFile, readJSON } from './github.js';

const sessions = new Map();

const DISCORD_LIMIT = 1900;

export async function startSession(thread, player) {
  const opening = await buildOpeningContext(player);
  const session = {
    player,
    threadId: thread.id,
    messages: [{ role: 'user', content: opening }],
    startedAt: Date.now(),
  };
  sessions.set(thread.id, session);

  await thread.sendTyping();
  const response = await generate(session);
  session.messages.push({ role: 'assistant', content: response });
  await postMCResponse(thread, response, session);
}

export async function handleMessage(message) {
  const session = sessions.get(message.channel.id);
  if (!session) return;
  if (!message.content?.trim()) return;

  session.messages.push({ role: 'user', content: message.content });

  await message.channel.sendTyping();
  const response = await generate(session);
  session.messages.push({ role: 'assistant', content: response });
  await postMCResponse(message.channel, response, session);
}

async function postMCResponse(thread, response, session) {
  const close = parseCloseBlock(response);
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

function chunk(text, limit = DISCORD_LIMIT) {
  if (!text) return [];
  if (text.length <= limit) return [text];
  const parts = [];
  let rest = text;
  while (rest.length > limit) {
    let cut = rest.lastIndexOf('\n\n', limit);
    if (cut < limit / 2) cut = rest.lastIndexOf('\n', limit);
    if (cut < limit / 2) cut = rest.lastIndexOf(' ', limit);
    if (cut <= 0) cut = limit;
    parts.push(rest.slice(0, cut));
    rest = rest.slice(cut).trimStart();
  }
  if (rest.length) parts.push(rest);
  return parts;
}

function grabTag(body, tag) {
  const re = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`);
  const m = body.match(re);
  return m ? m[1].trim() : null;
}

function parseCloseBlock(text) {
  const m = text.match(/<close_session>([\s\S]*?)<\/close_session>/);
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
  return text.replace(/<close_session>[\s\S]*?<\/close_session>/, '').trim();
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

  if (close.state_patch) {
    try {
      const patch = JSON.parse(close.state_patch);
      const current = (await readJSON(`players/${id}/state.json`)) || {};
      const merged = applyPatch(current, patch);
      writes.push(['state', writeFile(
        `players/${id}/state.json`,
        JSON.stringify(merged, null, 2) + '\n',
        `[session] state for ${session.player.name} (${stamp})`
      )]);
    } catch (e) {
      warnings.push(`state_patch: ${e.message}`);
    }
  }

  if (close.events_append) {
    const existing = (await readFile('game/events-log.md')) || '';
    const next = existing.replace(/\s*$/, '\n\n') + close.events_append.trim() + '\n';
    writes.push(['events-log', writeFile(
      'game/events-log.md',
      next,
      `[session] events log (${stamp})`
    )]);
  }

  if (close.npc_patch) {
    try {
      const patches = JSON.parse(close.npc_patch);
      const doc = (await readJSON('game/npcs.json')) || { npcs: [] };
      const list = doc.npcs || [];
      for (const p of patches) {
        const idx = list.findIndex(n => (p.id && n.id === p.id) || (p.name && n.name === p.name));
        if (idx >= 0) list[idx] = { ...list[idx], ...p };
        else list.push(p);
      }
      doc.npcs = list;
      writes.push(['npcs', writeFile(
        'game/npcs.json',
        JSON.stringify(doc, null, 2) + '\n',
        `[session] npcs (${stamp})`
      )]);
    } catch (e) {
      warnings.push(`npc_patch: ${e.message}`);
    }
  }

  if (close.arc_patch) {
    try {
      const patches = JSON.parse(close.arc_patch);
      const doc = (await readJSON('game/arcs.json')) || { arcs: [] };
      const list = doc.arcs || [];
      for (const p of patches) {
        const idx = list.findIndex(a => a.id === p.id);
        if (idx >= 0) list[idx] = { ...list[idx], ...p };
        else list.push(p);
      }
      doc.arcs = list;
      writes.push(['arcs', writeFile(
        'game/arcs.json',
        JSON.stringify(doc, null, 2) + '\n',
        `[session] arcs (${stamp})`
      )]);
    } catch (e) {
      warnings.push(`arc_patch: ${e.message}`);
    }
  }

  if (close.interactions_patch) {
    try {
      const next = JSON.parse(close.interactions_patch);
      writes.push(['interactions', writeFile(
        'game/interactions.json',
        JSON.stringify(next, null, 2) + '\n',
        `[session] interactions (${stamp})`
      )]);
    } catch (e) {
      warnings.push(`interactions_patch: ${e.message}`);
    }
  }

  const results = await Promise.allSettled(writes.map(([, p]) => p));
  const okNames = [], failNames = [];
  results.forEach((r, i) => {
    const name = writes[i][0];
    if (r.status === 'fulfilled') okNames.push(name);
    else failNames.push(`${name}: ${r.reason?.message || r.reason}`);
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
      if (ch?.isTextBased()) await ch.send(close.world_event);
    } catch (e) {
      console.warn('world event post failed:', e.message);
    }
  }
}
