import { generate, buildOpeningContext } from './mc.js';
import { writeFile, updateFile, updateJSON } from './github.js';
import { chunk } from './read-utils.js';
import { readProfile, writeProfile } from './profile.js';

const REPO_ROOT = process.env.COS_REPO_ROOT || process.cwd();

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
const SAVE_ONBOARDING_MAX_RETRIES = 2;

async function postMCResponse(thread, response, session) {
  // 0. <save_player> — persists the *player* profile (Discord user) at the end
  //    of player-onboarding. Runs BEFORE save_onboarding because a brand-new
  //    user sometimes emits both in the same response (or back-to-back), and
  //    the profile.json must exist before any character writes reference it.
  //    Failures here log but never throw — we don't want a malformed
  //    save_player to break the rest of the response handling.
  const savePlayer = parseSavePlayerBlock(response);
  if (savePlayer) {
    const missingPlayer = missingSavePlayerFields(savePlayer);
    if (missingPlayer.length) {
      console.warn(
        `<save_player> missing required fields: ${missingPlayer.join(', ')} — skipping write`
      );
    } else {
      let safetyParsed;
      try {
        safetyParsed = JSON.parse(savePlayer.safety);
        if (!safetyParsed || typeof safetyParsed !== 'object') {
          throw new Error('safety did not parse to an object');
        }
      } catch (err) {
        console.warn(
          `<save_player> safety JSON did not parse: ${err.message} — writing empty limits`
        );
        safetyParsed = { hard_limits: [], soft_limits: [] };
      }
      if (!Array.isArray(safetyParsed.hard_limits)) safetyParsed.hard_limits = [];
      if (!Array.isArray(safetyParsed.soft_limits)) safetyParsed.soft_limits = [];

      const profile = {
        discord_id: savePlayer.discord_id,
        display_name: savePlayer.display_name || '',
        safety: safetyParsed,
        mechanics_depth: 3,
        mechanics_depth_set: false,
        characters: [],
      };
      try {
        writeProfile(REPO_ROOT, profile);
      } catch (err) {
        console.error(`<save_player> writeProfile failed: ${err.message}`);
      }
    }
  }

  // 1. <save_onboarding> — mid-flow persistence for a new character. Fires when
  //    onboarding completes (Phase 12 + player confirms done), when the player
  //    asks the MC to save, or when the player wants to start the first scene
  //    before character creation is fully done. Writes sheet/state/npcs to
  //    GitHub immediately and mutates session.player out of '__new__'. After
  //    this fires, a subsequent <close_session> only needs the handoff.
  const save = parseSaveOnboardingBlock(response);
  if (save) {
    const missing = missingSaveOnboardingFields(save);
    if (missing.length) {
      const retries = session._saveRetries || 0;
      if (retries < SAVE_ONBOARDING_MAX_RETRIES) {
        session._saveRetries = retries + 1;
        await thread.send(
          `⚠ <save_onboarding> is missing: ${missing.join(', ')}. ` +
          `Asking the MC to re-emit — retry ${session._saveRetries}/${SAVE_ONBOARDING_MAX_RETRIES}.`
        );
        session.messages.push({ role: 'user', content: buildSaveRetryPrompt(missing) });
        await thread.sendTyping();
        const retryResp = await generate(session);
        session.messages.push({ role: 'assistant', content: retryResp });
        await postMCResponse(thread, retryResp, session);
        return;
      }
      await thread.send(
        `⚠ <save_onboarding> still incomplete after ${SAVE_ONBOARDING_MAX_RETRIES} retries ` +
        `(still missing: ${missing.join(', ')}). Skipping the save; the close block will need to carry the data.`
      );
      console.error(`[save-onboarding] exhausted retries for ${session.player.name}: missing ${missing.join(', ')}`);
    } else {
      await thread.send('— *saving character to GitHub…* —');
      await processSaveOnboarding(thread, session, save);
      response = stripSaveOnboardingBlock(response);
    }
  }

  const close = parseCloseBlock(response);

  // 2. <close_session> retry guard — only for sessions still in '__new__' state
  //    (i.e., save_onboarding never fired). If save fired earlier, session.player
  //    is now the real character and a normal close is enough.
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
    '- <character_id>: kebab-case id (firstname-lastname)',
    '- <sheet>: the full sheet you built across onboarding (Identity, Playbook, Stats, Moves, Circle Ratings & Status, Debts, Anchors, Gear, Experience Tier)',
    '- <state_patch>: JSON with character_name, stats (Blood/Heart/Mind/Spirit), harm: 0, corrupt: 0, xp: 0, advances, circle_ratings, circle_status, safety, gear, active_arc_ids: [], last_session, notes',
    '- <handoff>: full first handoff',
    '- <npc_patch>: every NPC introduced during onboarding, with full personality-engine scores',
    '',
    'You may repeat your closing narrative if you want, but the priority is a complete close block. Do not skip the sheet because the character is short-lived — the data you collected during onboarding has to land in the repo.',
  ].join('\n');
}

function buildSaveRetryPrompt(missing) {
  return [
    `Your <save_onboarding> block is missing required fields: ${missing.join(', ')}.`,
    'Re-emit the block now. At minimum it needs <character_id> (kebab-case, e.g. "joe-nakama").',
    'Include whatever data you have at this point: <sheet>, <state_patch> (JSON with at least character_name and stats), <npc_patch> for any NPCs introduced. Partial is fine — better to persist what we have than lose it.',
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
    character_id:     grabTag(body, 'character_id'),
  };
}

// Unlike close_session, save_onboarding can appear mid-message — the MC will
// typically emit it during the transition from Phase 12 (id confirmed) into
// Phase 13 (first scene), and may follow it with narrative for the opener.
const SAVE_ONBOARDING_BLOCK_RE = /<save_onboarding>([\s\S]*?)<\/save_onboarding>/;

export function parseSaveOnboardingBlock(text) {
  const m = text.match(SAVE_ONBOARDING_BLOCK_RE);
  if (!m) return null;
  const body = m[1];
  return {
    sheet:         grabTag(body, 'sheet'),
    state_patch:   grabTag(body, 'state_patch'),
    events_append: grabTag(body, 'events_append'),
    npc_patch:     grabTag(body, 'npc_patch'),
    character_id:     grabTag(body, 'character_id'),
  };
}

function stripSaveOnboardingBlock(text) {
  return text.replace(SAVE_ONBOARDING_BLOCK_RE, '').trim();
}

// Player-onboarding persistence block. Parallel to <save_onboarding> but for
// the *player* entity (Discord user) rather than a character. Fires when the
// MC finishes the player-onboarding phase (greeting, safety, display name) and
// is about to hand off to character creation. Carries discord_id, optional
// display_name, and a safety JSON object. Like <save_onboarding>, it can
// appear mid-message — narrative may follow.
const SAVE_PLAYER_OPEN = '<save_player>';
const SAVE_PLAYER_CLOSE = '</save_player>';

export function parseSavePlayerBlock(text) {
  if (typeof text !== 'string') return null;
  const openIdx = text.indexOf(SAVE_PLAYER_OPEN);
  const closeIdx = text.indexOf(SAVE_PLAYER_CLOSE);
  if (openIdx === -1 || closeIdx === -1 || closeIdx <= openIdx) return null;
  const body = text.slice(openIdx + SAVE_PLAYER_OPEN.length, closeIdx);
  const get = (tag) => {
    const m = body.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`));
    return m ? m[1].trim() : null;
  };
  return {
    discord_id: get('discord_id'),
    display_name: get('display_name'),
    safety: get('safety'),
  };
}

// discord_id and safety are required; display_name is optional (the MC may
// not have collected one yet, or the player may prefer to use their Discord
// handle as-is).
export function missingSavePlayerFields(save) {
  if (!save) return ['discord_id', 'safety'];
  const missing = [];
  const did = typeof save.discord_id === 'string' ? save.discord_id.trim() : '';
  if (!did) missing.push('discord_id');
  const sa = typeof save.safety === 'string' ? save.safety.trim() : '';
  if (!sa) missing.push('safety');
  return missing;
}

// Validation for <save_onboarding>. The save MUST land a sheet — that's the
// whole point of the mid-flow persistence (all three triggers — onboarding
// complete, player says "save", player wants to start the story — require a
// sheet to be created). state_patch is optional at save time: the player may
// be saving early with stats still TBD, and the MC can fill in stats later
// via state_patch in the session-close block.
export function missingSaveOnboardingFields(save) {
  const missing = [];
  const pid = typeof save.character_id === 'string' ? save.character_id.trim() : '';
  if (!pid || pid === '__new__') missing.push('character_id');
  if (!save.sheet || !save.sheet.trim()) missing.push('sheet');
  return missing;
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

// Persists a new character mid-session, before the session ends. Writes sheet,
// state, npcs, and the arrival event (if present) and adds the character to
// players/index.json. After this fires, session.player.id moves from '__new__'
// to the real id, so a later <close_session> only needs the handoff. Idempotent:
// if save_onboarding fires a second time in the same session, the second call
// is a no-op (we already saved).
async function processSaveOnboarding(thread, session, save) {
  if (session._onboardingSaved) {
    await thread.send('ℹ️ Character is already saved — ignoring duplicate <save_onboarding>.');
    return;
  }
  const id = (save.character_id || '').trim();
  const stamp = new Date().toISOString().slice(0, 10);
  const writes = [];
  const warnings = [];

  let parsedStatePatch = null;
  if (save.state_patch) {
    try { parsedStatePatch = JSON.parse(save.state_patch); }
    catch (e) { warnings.push(`state_patch: ${e.message}`); }
  }

  if (save.sheet) {
    writes.push(['sheet', writeFile(
      `players/${id}/sheet.md`,
      save.sheet.endsWith('\n') ? save.sheet : save.sheet + '\n',
      `[onboarding] sheet for ${id} (${stamp})`
    )]);
  }

  if (parsedStatePatch) {
    writes.push(['state', updateJSON(
      `players/${id}/state.json`,
      (current) => applyPatch(current || {}, parsedStatePatch),
      `[onboarding] state for ${id} (${stamp})`
    )]);
  }

  if (save.npc_patch) {
    try {
      const patches = JSON.parse(save.npc_patch);
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
      }, `[onboarding] npcs (${stamp})`)]);
    } catch (e) {
      warnings.push(`npc_patch: ${e.message}`);
    }
  }

  if (save.events_append) {
    const append = save.events_append.trim();
    writes.push(['events-log', updateFile(
      'game/events-log.md',
      (current) => (current || '').replace(/\s*$/, '\n\n') + append + '\n',
      `[onboarding] events log (${stamp})`
    )]);
  }

  const displayName = resolveNewCharacterName(parsedStatePatch, save.sheet, id);
  const ownerId = session.player && session.player.discord_id ? String(session.player.discord_id) : null;
  writes.push(['players-index', updateJSON('players/index.json', (current) => {
    const list = Array.isArray(current) ? current : [];
    const existing = list.find(p => p.id === id);
    if (existing) {
      if (ownerId && !existing.owner_id) existing.owner_id = ownerId;
    } else {
      const entry = { id, name: displayName };
      if (ownerId) entry.owner_id = ownerId;
      list.push(entry);
    }
    return list;
  }, `[onboarding] register new character ${id} (${stamp})`)]);

  if (ownerId) {
    try {
      const profile = readProfile(REPO_ROOT, ownerId);
      if (profile) {
        if (!Array.isArray(profile.characters)) profile.characters = [];
        if (!profile.characters.includes(id)) {
          profile.characters.push(id);
          writeProfile(REPO_ROOT, profile);
        }
      }
    } catch (err) {
      console.warn(`[onboarding] failed to link character ${id} to profile ${ownerId}: ${err.message}`);
    }
  }

  const results = await Promise.allSettled(writes.map(([, p]) => p));
  const okNames = [], failNames = [];
  results.forEach((r, i) => {
    const name = writes[i][0];
    if (r.status === 'fulfilled') okNames.push(name);
    else {
      const reason = r.reason?.message || r.reason;
      failNames.push(`${name}: ${reason}`);
      console.error(`[save-onboarding] write '${name}' failed for ${id} (${stamp}):`, reason);
    }
  });

  // Only flip the session out of '__new__' if the roster write actually landed.
  // Otherwise /play won't find this character next time, and we want the close
  // block retry path to still see this as a new-character session.
  const registered = !failNames.some(f => f.startsWith('players-index'));
  if (registered) {
    session.player = { id, name: displayName };
    session._onboardingSaved = true;
  }

  const lines = [];
  if (okNames.length) lines.push(`✓ character saved: ${okNames.join(', ')}`);
  if (failNames.length) lines.push(`✗ failed:\n${failNames.join('\n')}`);
  if (warnings.length) lines.push(`⚠ ${warnings.join('; ')}`);
  if (!lines.length) lines.push('No onboarding fields detected — nothing written.');
  await thread.send(lines.join('\n'));
}

async function processSessionClose(thread, session, close) {
  const id = close.character_id || session.player.id;
  if (id === '__new__') {
    await thread.send('⚠️ Cannot write session close for a new character without a character_id in the close block. Skipping writes.');
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
    const closeOwnerId = session.player && session.player.discord_id ? String(session.player.discord_id) : null;
    writes.push(['players-index', updateJSON('players/index.json', (current) => {
      const list = Array.isArray(current) ? current : [];
      const existing = list.find(p => p.id === id);
      if (existing) {
        if (closeOwnerId && !existing.owner_id) existing.owner_id = closeOwnerId;
      } else {
        const entry = { id, name: displayName };
        if (closeOwnerId) entry.owner_id = closeOwnerId;
        list.push(entry);
      }
      return list;
    }, `[session] register new character ${id} (${stamp})`)]);

    if (closeOwnerId) {
      try {
        const profile = readProfile(REPO_ROOT, closeOwnerId);
        if (profile) {
          if (!Array.isArray(profile.characters)) profile.characters = [];
          if (!profile.characters.includes(id)) {
            profile.characters.push(id);
            writeProfile(REPO_ROOT, profile);
          }
        }
      } catch (err) {
        console.warn(`[session] failed to link character ${id} to profile ${closeOwnerId}: ${err.message}`);
      }
    }
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
  const pid = typeof close.character_id === 'string' ? close.character_id.trim() : '';
  if (!pid || pid === '__new__') missing.push('character_id');
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
