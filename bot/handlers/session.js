import { generate, buildOpeningContext, selectInteractionEcho } from './mc.js';
import { readFile, readJSON, writeFile, updateFile, updateJSON } from './github.js';
import { chunk } from './read-utils.js';
import { readProfile, updateProfile } from './profile.js';
import {
  applyInteractionOperations,
  buildRelevantWorldContext,
  findMentionedNpcs,
  formatNpcHydrationContext,
  mergeCanonicalPatches,
} from './world-state.js';
import {
  auditSession,
  createRollRecord,
  deriveActiveArcIds,
  formatRoll,
  mergeDebtPatches,
  nextSessionId,
  parseRollRequest,
  reconcileArcs,
  reconcileCharacterState,
  stripRollRequest,
} from './mechanics.js';

const sessions = new Map();
const GENERATION_RETRIES = 2;
const OPENING_MAX_CHARS = 1800;
const OPENING_MAX_TOKENS = 550;

// Serializes async work on a single session so concurrent player messages
// don't interleave generate() calls and produce two consecutive user turns
// (which the chat-completions API rejects as an alternation error).
function lock(session, fn) {
  const prev = session._chain || Promise.resolve();
  const next = prev.then(() => fn(), () => fn());
  session._chain = next.catch(() => {});
  return next;
}

export async function startSession(thread, player) {
  const [opening, profile, openingState, openingInteractions, worldMeta] = await Promise.all([
    buildOpeningContext(player),
    player.discord_id ? readProfile(player.discord_id) : null,
    player.id !== '__new__' ? readJSON(`players/${player.id}/state.json`) : null,
    player.id !== '__new__' ? readJSON('game/interactions.json') : null,
    readJSON('game/world-meta.json'),
  ]);
  const session = {
    player,
    threadId: thread.id,
    messages: [{ role: 'user', content: opening }],
    startedAt: Date.now(),
    rolls: [],
    pendingRoll: null,
    mechanicsDepth: profile?.mechanics_depth || 3,
    rulesProfile: {
      isNew: player.id === '__new__',
      playbook: openingState?.playbook || '',
      wod_extension: openingState?.wod_extension || '',
    },
    openingEchoId: selectInteractionEcho(openingInteractions, player.id)?.id || null,
    worldRevision: Number.isInteger(worldMeta?.revision) ? worldMeta.revision : 0,
    hydratedNpcIds: new Set(),
    npcCatalog: null,
  };
  sessions.set(thread.id, session);

  await lock(session, async () => {
    const notice = await thread.send('— *The city is gathering your opening scene. This can take a minute…* —');
    await thread.sendTyping();
    try {
      const response = await generateSafeResponse(session, { opening: true });
      session.messages.push({ role: 'assistant', content: response });
      await postMCResponse(thread, response, session);
      if (typeof notice?.delete === 'function') notice.delete().catch(() => {});
    } catch (err) {
      console.error(`[opening] failed for ${player.id}: ${err.message}`);
      if (typeof notice?.edit === 'function') {
        await notice.edit('⚠ The opening scene could not be prepared cleanly. Send a message here to retry.');
      } else {
        await thread.send('⚠ The opening scene could not be prepared cleanly. Send a message here to retry.');
      }
    }
  });
}

export function responseSafetyProblems(response, { opening = false } = {}) {
  const text = typeof response === 'string' ? response.trim() : '';
  const problems = [];
  if (!text) problems.push('empty response');
  if (/<\/?think(?:ing)?>/i.test(text)) problems.push('internal thinking tag');
  if (/THOUGHTS APPLIED|OPENING ANGLES TO NOTE/i.test(text)) problems.push('internal planning marker');
  if (opening && text.length > OPENING_MAX_CHARS) {
    problems.push(`opening exceeds ${OPENING_MAX_CHARS} characters`);
  }
  return problems;
}

async function generateSafeResponse(session, { opening = false } = {}) {
  let response = await generate(session, opening
    ? { maxTokens: OPENING_MAX_TOKENS, temperature: 0.7 }
    : {});
  for (let attempt = 0; attempt <= GENERATION_RETRIES; attempt += 1) {
    const problems = responseSafetyProblems(response, { opening });
    if (!problems.length) return response;
    console.warn(`[generation-safety] rejected response: ${problems.join('; ')}`);
    if (attempt === GENERATION_RETRIES) {
      throw new Error(`unsafe response after ${GENERATION_RETRIES + 1} attempts: ${problems.join('; ')}`);
    }
    session.messages.push({ role: 'assistant', content: response });
    session.messages.push({
      role: 'user',
      content: [
        '[SYSTEM — RESPONSE CORRECTION]',
        `The previous response was rejected: ${problems.join('; ')}.`,
        opening
          ? 'Re-emit only the player-facing opening scene: 2–5 clear, concrete paragraphs, at most 1800 characters. Establish the location, immediate pressure, and one actionable hook, then end with a direct question. No fragmented or stream-of-consciousness prose.'
          : 'Re-emit only the player-facing response.',
        'Never output analysis, planning, chain-of-thought, <think>, or <thinking> tags.',
      ].join('\n'),
    });
    try {
      response = await generate(session, opening
        ? { maxTokens: OPENING_MAX_TOKENS, temperature: 0.5 }
        : {});
    } finally {
      session.messages.splice(-2, 2);
    }
  }
  throw new Error('unreachable generation safety state');
}

export async function handleMessage(message) {
  const session = sessions.get(message.channel.id);
  if (!session) {
    // Session thread we no longer have state for — most likely a bot restart.
    // Tell the player so they don't sit there typing into a void.
    const ch = message.channel;
    if (ch?.isThread?.() && typeof ch.name === 'string' &&
        (ch.name.endsWith(' — session') || ch.name.endsWith(' — new character'))) {
      try { await ch.send('Session state was lost (the bot likely restarted). Use `/play` to start a new session.'); } catch {}
    }
    return;
  }
  if (!message.content?.trim()) return;

  await lock(session, async () => {
    await refreshSessionWorld(session);
    const lastAssistant = [...session.messages].reverse()
      .find(entry => entry.role === 'assistant')?.content || '';
    const npcHydration = await buildNpcMentionHydration(
      session,
      `${lastAssistant}\n${message.content}`
    );
    const { content: userContent, exhausted } = applySaveLeakNudge(session, message.content);
    if (exhausted) {
      await message.channel.send(
        `⚠ <save_onboarding> still leaking after ${SAVE_ONBOARDING_MAX_RETRIES} retries. ` +
        `The close block will need to carry the save data.`
      );
      console.error(`[save-onboarding] leak retries exhausted for session ${session.threadId}`);
    }
    session.messages.push({
      role: 'user',
      content: npcHydration
        ? `${npcHydration}\n\n[PLAYER MESSAGE]\n${userContent}`
        : userContent,
    });
    await message.channel.sendTyping();
    const response = await generateSafeResponse(session);
    session.messages.push({ role: 'assistant', content: response });
    await postMCResponse(message.channel, response, session);
  });
}

async function buildNpcMentionHydration(session, text) {
  if (!session?.player?.id || session.player.id === '__new__') return '';
  if (!session.npcCatalog) {
    const npcDoc = await readJSON('game/npcs.json');
    session.npcCatalog = npcDoc?.npcs || [];
  }
  if (!(session.hydratedNpcIds instanceof Set)) session.hydratedNpcIds = new Set();
  const mentioned = findMentionedNpcs(text, session.npcCatalog, session.hydratedNpcIds);
  for (const npc of mentioned) session.hydratedNpcIds.add(npc.id);
  return mentioned.length ? formatNpcHydrationContext(mentioned) : '';
}

async function refreshSessionWorld(session) {
  if (!session?.player?.id || session.player.id === '__new__') return;
  const worldMeta = await readJSON('game/world-meta.json');
  const nextRevision = Number.isInteger(worldMeta?.revision) ? worldMeta.revision : 0;
  if (nextRevision <= (session.worldRevision || 0)) return;
  const [state, handoff, events] = await Promise.all([
    readJSON(`players/${session.player.id}/state.json`),
    readFile(`players/${session.player.id}/handoff.md`),
    readFile('game/events-log.md'),
  ]);
  const world = await buildRelevantWorldContext({
    characterId: session.player.id,
    state: state || {},
    handoff: handoff || '',
  });
  const eventTail = String(events || '').split('\n').slice(0, 120).join('\n');
  session.messages.push({
    role: 'user',
    content: [
      `[SYSTEM — SHARED WORLD UPDATE revision ${session.worldRevision || 0} → ${nextRevision}]`,
      'Another session or the City Keeper changed the shared city. Integrate these facts without retconning actions already established in this thread.',
      eventTail,
      world,
    ].join('\n\n'),
  });
  session.worldRevision = nextRevision;
  session.npcCatalog = null;
}

export async function resolveSessionRoll(interaction) {
  const session = sessions.get(interaction.channelId);
  if (!session) {
    await interaction.reply({
      content: 'Use `/roll` inside an active character session.',
      ephemeral: true,
    });
    return;
  }
  if (session.player.discord_id && String(interaction.user.id) !== String(session.player.discord_id)) {
    await interaction.reply({
      content: 'Only the player who owns this session can resolve its pending move.',
      ephemeral: true,
    });
    return;
  }
  if (!session.pendingRoll) {
    await interaction.reply({
      content: 'There is no unresolved move right now. Wait for the MC to request a roll.',
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply({ ephemeral: session.mechanicsDepth >= 4 });
  await lock(session, async () => {
    await refreshSessionWorld(session);
    const request = session.pendingRoll;
    const state = await readJSON(`players/${session.player.id}/state.json`) || {};
    const d6 = () => 1 + Math.floor(Math.random() * 6);
    const record = createRollRecord({
      request,
      state,
      instinct: d6(),
      other: d6(),
      sessionId: session.threadId,
      characterId: session.player.id,
    });
    session.pendingRoll = null;
    session.rolls.push(record);
    session.messages.push({
      role: 'user',
      content: [
        '[SYSTEM — AUTHORITATIVE ROLL RESULT]',
        JSON.stringify(record),
        'Resolve this move now. Do not ask the player to repeat the dice and do not alter the total or result tier.',
      ].join('\n'),
    });
    await interaction.editReply(formatRoll(record, session.mechanicsDepth));
    await interaction.channel.sendTyping();
    const response = await generateSafeResponse(session);
    session.messages.push({ role: 'assistant', content: response });
    await postMCResponse(interaction.channel, response, session);
  });
}

const NEW_CHAR_CLOSE_MAX_RETRIES = 2;
export const SAVE_ONBOARDING_MAX_RETRIES = 2;

async function postMCResponse(thread, response, session) {
  const rollRequest = parseRollRequest(response);
  if (rollRequest) {
    session.pendingRoll = rollRequest;
    response = stripRollRequest(response);
  } else if (/<roll_request>/.test(response)) {
    console.warn(`[session ${session.threadId}] ignored malformed roll_request`);
    response = stripRollRequest(response);
  }
  // Track whether a clean save fired this turn. If yes, suppress
  // _lastTurnSaveLeak even if sanitize finds leftover bare tags — the save
  // already persisted, so a re-emit nudge next turn would trigger the
  // duplicate-save guard and confuse the MC.
  let cleanSaveFiredThisTurn = false;

  // Lightweight crash/restart recovery. The MC emits this after meaningful
  // scene transitions; it is stripped before Discord and stores no transcript
  // or player profile data.
  const checkpoint = parseCheckpointBlock(response);
  if (checkpoint) {
    response = stripCheckpointBlock(response);
    if (session.player.id !== '__new__') {
      try {
        await writeCheckpoint(session, checkpoint);
      } catch (err) {
        console.error(`[checkpoint] write failed for ${session.player.id}: ${err.message}`);
      }
    }
  }
  // 0. <save_player> — persists the *player* profile (Discord user) at the end
  //    of player-onboarding. Runs BEFORE save_onboarding because a brand-new
  //    user sometimes emits both in the same response (or back-to-back), and
  //    the profile.json must exist before any character writes reference it.
  //    Failures here log but never throw — we don't want a malformed
  //    save_player to break the rest of the response handling.
  const savePlayer = parseSavePlayerBlock(response);
  if (savePlayer) {
    // Always strip the block from the visible response, even if validation
    // fails below — the raw tags + safety JSON must never reach Discord
    // regardless of whether the write itself succeeds.
    response = stripSavePlayerBlock(response);
    const missingPlayer = missingSavePlayerFields(savePlayer);
    if (missingPlayer.length) {
      console.error(
        `<save_player> missing required fields: ${missingPlayer.join(', ')} — skipping write`
      );
    } else {
      // Parse and validate safety. Malformed safety is a CRITICAL data-loss
      // path — writing empty limits silently is worse than refusing the write,
      // because the player thinks their limits are recorded when they aren't.
      let safetyParsed = null;
      try {
        const candidate = JSON.parse(savePlayer.safety);
        if (
          candidate &&
          typeof candidate === 'object' &&
          !Array.isArray(candidate) &&
          Array.isArray(candidate.hard_limits) &&
          Array.isArray(candidate.soft_limits)
        ) {
          safetyParsed = {
            hard_limits: candidate.hard_limits,
            soft_limits: candidate.soft_limits,
          };
        }
      } catch (_) {
        safetyParsed = null;
      }
      if (!safetyParsed) {
        console.error(
          `<save_player> safety did not parse to {hard_limits, soft_limits} arrays — refusing write for ${savePlayer.discord_id}`
        );
      } else {
        // Idempotency: if a profile already exists, do NOT clobber the player's
        // existing mechanics_depth, calibration flag, or character list. A
        // confused MC re-emitting <save_player> for a returning player should
        // be a no-op on those fields, only updating safety + display_name.
        // If the MC collected a mechanics_depth from the player, persist it
        // and mark calibration done so the post-first-session prompt does
        // not fire on top of an already-set value. If omitted (deferred),
        // keep the default (3) and leave mechanics_depth_set=false so the
        // automatic calibration still runs at first close.
        const depthOverride = Number.isInteger(savePlayer.mechanics_depth)
          ? savePlayer.mechanics_depth
          : null;
        try {
          await updateProfile(
            savePlayer.discord_id,
            (existing) => {
              if (existing) {
                const next = {
                  ...existing,
                  display_name: savePlayer.display_name || existing.display_name || '',
                  safety: safetyParsed,
                };
                if (depthOverride !== null) {
                  next.mechanics_depth = depthOverride;
                  next.mechanics_depth_set = true;
                }
                return next;
              }
              return {
                discord_id: savePlayer.discord_id,
                display_name: savePlayer.display_name || '',
                safety: safetyParsed,
                mechanics_depth: depthOverride !== null ? depthOverride : 3,
                mechanics_depth_set: depthOverride !== null,
                characters: [],
              };
            },
            `[player] onboarding for ${savePlayer.discord_id}`
          );
        } catch (err) {
          console.error(`<save_player> updateProfile failed: ${err.message}`);
        }
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
        const retryResp = await generateSafeResponse(session);
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
      await thread.send('— *saving character to GitHub (this usually takes 10–20 seconds)…* —');
      await processSaveOnboarding(thread, session, save);
      response = stripSaveOnboardingBlock(response);
      // Clean save fired — reset the leak retry counter so a future,
      // unrelated leak gets the full SAVE_ONBOARDING_MAX_RETRIES budget.
      session._saveLeakRetries = 0;
      cleanSaveFiredThisTurn = true;
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
        const retryResp = await generateSafeResponse(session);
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

  if (close) {
    const impactProblems = validateWorldImpact(close);
    if (impactProblems.length) {
      const retries = session._impactRetries || 0;
      if (retries < NEW_CHAR_CLOSE_MAX_RETRIES) {
        session._impactRetries = retries + 1;
        await thread.send(
          `⚠ Close block needs a valid world-impact declaration: ${impactProblems.join('; ')}. ` +
          `Asking the MC to re-emit — retry ${session._impactRetries}/${NEW_CHAR_CLOSE_MAX_RETRIES}.`
        );
        session.messages.push({ role: 'user', content: buildImpactRetryPrompt(impactProblems) });
        await thread.sendTyping();
        const retryResp = await generateSafeResponse(session);
        session.messages.push({ role: 'assistant', content: retryResp });
        await postMCResponse(thread, retryResp, session);
        return;
      }
      await thread.send(`⚠ World-impact declaration remained incomplete; saving with impact level personal and flagging the ledger.`);
      close.world_impact = JSON.stringify({ level: 'personal', summary: 'Impact declaration recovery fallback.', affected_ids: [] });
    }
  }

  const stripped = close ? stripCloseBlock(response) : response;
  const { cleaned: visible, leakDetected } = sanitizePlayerFacingText(stripped);
  if (leakDetected) {
    console.warn(
      `[session ${session.threadId}] sanitize stripped structured leak from MC output` +
      (cleanSaveFiredThisTurn ? ' (clean save also fired this turn; suppressing re-emit nudge)' : '')
    );
    if (!cleanSaveFiredThisTurn) {
      // Only nudge for re-emit when no save actually fired. If a save
      // succeeded this turn, the leftover bare-tag leak is just operator-
      // visible noise — the persistence path already completed.
      session._lastTurnSaveLeak = true;
    }
  }
  for (const part of chunk(visible)) {
    if (part.trim()) await thread.send(part);
  }

  if (close) {
    await thread.send('— *writing session close to GitHub (this usually takes 10–20 seconds)…* —');
    const result = await processSessionClose(thread, session, close);
    if (result?.success) {
      sessions.delete(session.threadId);
      if (typeof thread.setArchived === 'function') {
        thread.setArchived(true).catch(() => {});
      }
    } else {
      await thread.send('The close was not fully persisted, so this session remains open. Ask me to close again after the write issue is resolved.');
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
    '- <state_patch>: JSON with character_name, stats (Blood/Heart/Mind/Spirit), harm: 0, corrupt: 0, xp: 0, advances, circle_ratings, circle_status, safety, gear, circle_marks, effects, playbook_state, notes. Omit bot-owned active_arc_ids and last_session.',
    '- <handoff>: full first handoff',
    '- <npc_patch>: every NPC introduced during onboarding, with full personality-engine scores',
    '',
    'You may repeat your closing narrative if you want, but the priority is a complete close block. Do not skip the sheet because the character is short-lived — the data you collected during onboarding has to land in the repo.',
  ].join('\n');
}

function buildImpactRetryPrompt(problems) {
  return [
    `[SYSTEM] Your trailing <close_session> block has world-impact problems: ${problems.join('; ')}.`,
    'Re-emit the closing narrative and complete trailing <close_session> block now.',
    'Include <world_impact> containing JSON with level (none, personal, or shared), summary, affected_ids, and optional fiction_time.',
    'If level is shared, include at least one matching events_append, npc_patch, location_patch, relationship_patch, debt_patch, arc_patch, hub_patch, or interaction_ops field.',
    'Do not continue the scene.',
  ].join('\n');
}

function buildSaveRetryPrompt(missing) {
  return [
    `Your <save_onboarding> block is missing required fields: ${missing.join(', ')}.`,
    'Re-emit the block now. At minimum it needs <character_id> (kebab-case, e.g. "joe-nakama").',
    'Include whatever data you have at this point: <sheet>, <state_patch> (JSON with at least character_name and stats), <npc_patch> for any NPCs introduced. Partial is fine — better to persist what we have than lose it.',
  ].join('\n');
}

// Nudge prepended to the next MC turn after a leak was detected and stripped.
// Reuses the SAVE_ONBOARDING_MAX_RETRIES cap so leak retries and missing-fields
// retries share the same exhaustion budget shape, though they use separate
// counters on the session (_saveLeakRetries vs _saveRetries).
export function buildSaveLeakNudge(retryNumber) {
  return [
    `[SYSTEM] Your previous response contained an unterminated <save_onboarding> (or <close_session>) block, or bare structured tags outside any container.`,
    `The bot stripped that content before posting, and the persistence did not occur.`,
    ``,
    `Re-emit a complete <save_onboarding> block as the FIRST content of your next response, before any narrative. Confirm the closing </save_onboarding> tag is present.`,
    `Retry ${retryNumber} of ${SAVE_ONBOARDING_MAX_RETRIES}.`,
  ].join('\n');
}

// Pure helper extracted from handleMessage so the nudge/exhaustion branches
// can be unit-tested without a Discord channel mock. Mutates `session`
// (clearing _lastTurnSaveLeak, bumping _saveLeakRetries) and returns the
// composed user-message content plus whether the retry budget is exhausted.
// `exhausted = true` tells the caller to surface a thread warning and skip
// the nudge — the original player content is still returned in `content`.
export function applySaveLeakNudge(session, playerContent) {
  if (!session._lastTurnSaveLeak) {
    return { content: playerContent, exhausted: false };
  }
  const retries = (session._saveLeakRetries || 0) + 1;
  session._saveLeakRetries = retries;
  session._lastTurnSaveLeak = false;
  if (retries > SAVE_ONBOARDING_MAX_RETRIES) {
    return { content: playerContent, exhausted: true, retries };
  }
  return {
    content: `${buildSaveLeakNudge(retries)}\n\n[PLAYER MESSAGE]\n${playerContent}`,
    exhausted: false,
    retries,
  };
}

// Rename a new-character session thread once the character's real display name
// is known. New-character threads launch titled "<username> — new character"
// (no character id/name exists at /play time), which collapses every character
// a player creates under their Discord username and makes review confusing.
// Renaming to "<name> — session" gives each character a distinct, reviewable
// thread and lets the per-character active-session block work on later plays.
// Best-effort: a failed rename only affects the thread title, never persistence.
async function renameSessionThread(thread, displayName) {
  if (!thread || typeof thread.setName !== 'function') return;
  const target = `${displayName} — session`;
  if (thread.name === target) return;
  try {
    await thread.setName(target);
  } catch (err) {
    console.error(`[session] failed to rename thread ${thread.id} to "${target}": ${err.message}`);
  }
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
    location_patch: grabTag(body, 'location_patch'),
    relationship_patch: grabTag(body, 'relationship_patch'),
    debt_patch:    grabTag(body, 'debt_patch'),
    hub_patch:     grabTag(body, 'hub_patch'),
    arc_patch:     grabTag(body, 'arc_patch'),
    interactions_patch: grabTag(body, 'interactions_patch'),
    interaction_ops: grabTag(body, 'interaction_ops'),
    world_impact:  grabTag(body, 'world_impact'),
    world_event:   grabTag(body, 'world_event'),
    character_id:     grabTag(body, 'character_id'),
  };
}

const CHECKPOINT_BLOCK_RE = /<checkpoint>([\s\S]*?)<\/checkpoint>/;

export function parseCheckpointBlock(text) {
  if (typeof text !== 'string') return null;
  const match = text.match(CHECKPOINT_BLOCK_RE);
  if (!match) return null;
  try {
    const raw = JSON.parse(match[1].trim());
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const strings = (value, limit = 12) => Array.isArray(value)
      ? [...new Set(value.map(String).map(item => item.trim()).filter(Boolean))].slice(0, limit)
      : [];
    const summary = typeof raw.summary === 'string' ? raw.summary.trim().slice(0, 1000) : '';
    if (!summary) return null;
    return {
      summary,
      location_id: typeof raw.location_id === 'string' ? raw.location_id.trim().slice(0, 120) : '',
      present_entity_ids: strings(raw.present_entity_ids),
      open_threads: strings(raw.open_threads),
      pending_mechanics: strings(raw.pending_mechanics),
    };
  } catch {
    return null;
  }
}

export function stripCheckpointBlock(text) {
  return typeof text === 'string' ? text.replace(CHECKPOINT_BLOCK_RE, '').trim() : text;
}

async function writeCheckpoint(session, checkpoint, active = true) {
  const characterId = session?.player?.id;
  if (!characterId || characterId === '__new__') return;
  await writeFile(
    `players/${characterId}/checkpoint.json`,
    JSON.stringify({
      schema_version: 1,
      active,
      character_id: characterId,
      world_revision: session.worldRevision || 0,
      updated_at: new Date().toISOString(),
      ...checkpoint,
    }, null, 2) + '\n',
    `[session] checkpoint for ${session.player.name}`
  );
}

export function parseWorldImpact(close) {
  if (!close?.world_impact) return null;
  try {
    const impact = JSON.parse(close.world_impact);
    if (!impact || typeof impact !== 'object' || Array.isArray(impact)) return null;
    return {
      level: String(impact.level || '').toLowerCase(),
      summary: typeof impact.summary === 'string' ? impact.summary.trim().slice(0, 500) : '',
      affected_ids: Array.isArray(impact.affected_ids) ? [...new Set(impact.affected_ids.map(String))] : [],
      fiction_time: typeof impact.fiction_time === 'string' ? impact.fiction_time.trim().slice(0, 120) : '',
    };
  } catch {
    return null;
  }
}

export function validateWorldImpact(close) {
  const impact = parseWorldImpact(close);
  if (!impact) return ['missing or invalid <world_impact> JSON'];
  if (!['none', 'personal', 'shared'].includes(impact.level)) return ['world_impact.level must be none, personal, or shared'];
  if (!impact.summary) return ['world_impact.summary is required'];
  if (impact.level === 'shared') {
    const touches = [
      close.events_append, close.npc_patch, close.location_patch,
      close.relationship_patch, close.debt_patch, close.arc_patch,
      close.hub_patch, close.interaction_ops, close.interactions_patch,
    ];
    if (!touches.some(Boolean)) return ['shared impact requires a world patch, interaction operation, or public event'];
  }
  return [];
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
    location_patch: grabTag(body, 'location_patch'),
    relationship_patch: grabTag(body, 'relationship_patch'),
    debt_patch:    grabTag(body, 'debt_patch'),
    character_id:     grabTag(body, 'character_id'),
  };
}

function stripSaveOnboardingBlock(text) {
  return text.replace(SAVE_ONBOARDING_BLOCK_RE, '').trim();
}

// List of structured-data tags that should never appear in player-facing text
// outside their container blocks (save_onboarding / close_session). Defined at
// module scope so callers and tests share the same source of truth.
const STRUCTURED_BARE_TAGS = [
  'state_patch',
  'npc_patch',
  'location_patch',
  'relationship_patch',
  'debt_patch',
  'hub_patch',
  'roll_request',
  'sheet',
  'handoff',
  'arc_patch',
  'events_append',
  'interactions_patch',
  'interaction_ops',
  'world_impact',
  'world_event',
  'checkpoint',
];

// Step-4 orphan cleanup considers container tags too — bare opens/closes of
// save_onboarding, close_session, or save_player (no matching pair) are also
// leaks. save_player is included here so a malformed/truncated player-onboarding
// block never dumps discord_id + safety JSON into the player's thread.
const ORPHAN_TAGS = [
  'save_onboarding',
  'close_session',
  'save_player',
  'character_id',
  ...STRUCTURED_BARE_TAGS,
];

// Tags that should always be stripped when found as a balanced bare pair,
// regardless of body content. Unlike STRUCTURED_BARE_TAGS, these have NO
// legitimate narrative use — they only ever belong inside save_onboarding
// or close_session containers. Step 3's looksStructured check would miss
// them (a kebab-case slug is neither JSON-shaped nor a schema-key marker).
const ALWAYS_STRIP_BARE_TAGS = ['character_id'];

// Schema-key markers used by sanitize step 3 to decide whether a <TAG>body</TAG>
// payload is structured data. Looking only at first-char {/[ would miss
// hand-written sheet bodies that aren't strictly JSON but still belong inside
// a container block.
const STRUCTURED_KEY_MARKERS = [
  '"id":',
  '"character_name":',
  '"stats":',
  '"personality":',
  '"faction":',
];

// True when the body of a <TAG>...</TAG> match looks like a structured payload
// (starts with { or [, or contains a known schema-key marker). Used by step 3
// to distinguish accidental leaks from in-fiction prose like
// "Marcus glanced at the <sheet>blank paper</sheet>".
function looksStructured(body) {
  const trimmed = body.trim();
  if (trimmed.length === 0) return false;
  const first = trimmed[0];
  if (first === '{' || first === '[') return true;
  return STRUCTURED_KEY_MARKERS.some((k) => trimmed.includes(k));
}

// Matches an opening <save_onboarding> tag with no corresponding closing tag —
// used to strip truncated/malformed blocks from player-facing text.
const UNTERMINATED_SAVE_ONBOARDING_RE = /<save_onboarding>(?![\s\S]*<\/save_onboarding>)[\s\S]*$/;

// Step-2 mate of UNTERMINATED_SAVE_ONBOARDING_RE: a <close_session> opener
// with no matching closer anywhere in the response.
const UNTERMINATED_CLOSE_SESSION_RE = /<close_session>(?![\s\S]*<\/close_session>)[\s\S]*$/;

// Step-2.5 mate: a <save_player> opener with no matching closer. Whole-block
// strip (not just the open tag) is required because the body carries
// discord_id and a safety JSON payload that would otherwise be posted raw.
const UNTERMINATED_SAVE_PLAYER_RE = /<save_player>(?![\s\S]*<\/save_player>)[\s\S]*$/;

// Defense-in-depth sanitizer for MC output that has already passed through
// stripSaveOnboardingBlock/stripCloseBlock. By the time text reaches this
// function, any *valid* container block has been extracted. Anything
// structured that survives is by definition a leak (truncated, malformed,
// or orphaned), and posting it to a Discord thread is always wrong.
//
// Returns { cleaned, leakDetected }. The caller posts `cleaned` to the
// thread and, if `leakDetected`, sets a session flag so the next MC turn
// receives a re-emit nudge.
export function sanitizePlayerFacingText(text) {
  // Internal callers always pass a string, but the export is reachable from
  // tests and future callers; guard so a null/undefined argument can't throw.
  if (typeof text !== 'string') return { cleaned: '', leakDetected: false };
  let working = text;
  let leakDetected = false;

  // Step 1: unterminated <save_onboarding> — opener with no matching closer;
  // strip from the tag to end of string. Reaches this path only when the
  // upstream stripSaveOnboardingBlock pass found no valid block (i.e., the
  // MC's response was truncated mid-block or otherwise malformed).
  if (UNTERMINATED_SAVE_ONBOARDING_RE.test(working)) {
    working = working.replace(UNTERMINATED_SAVE_ONBOARDING_RE, '');
    leakDetected = true;
  }

  // Step 2: unterminated <close_session>. Same shape — opener with no closer
  // — strip from open tag to end of string. Triggers when the MC tries to end
  // the session but the response is cut off before </close_session>.
  if (UNTERMINATED_CLOSE_SESSION_RE.test(working)) {
    working = working.replace(UNTERMINATED_CLOSE_SESSION_RE, '');
    leakDetected = true;
  }

  // Step 2.5: unterminated <save_player>. Same shape as steps 1/2. Reaches this
  // path when the MC's player-onboarding response is truncated mid-block and
  // the upstream stripSavePlayerBlock pass found no valid block to extract.
  if (UNTERMINATED_SAVE_PLAYER_RE.test(working)) {
    working = working.replace(UNTERMINATED_SAVE_PLAYER_RE, '');
    leakDetected = true;
  }

  // Step 3: bare structured tags floating outside any container. By this
  // point, all *valid* save/close blocks were already removed upstream by
  // stripSaveOnboardingBlock / stripCloseBlock. Anything still matching a
  // <TAG>...</TAG> pair from STRUCTURED_BARE_TAGS is therefore floating —
  // but we only strip if the body looks structured (JSON-shaped or contains
  // a known schema key marker), to avoid false-positives on legitimate
  // narrative prose that happens to use one of these words in angle brackets.
  for (const tag of STRUCTURED_BARE_TAGS) {
    const re = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, 'g');
    working = working.replace(re, (match, body) => {
      if (looksStructured(body)) {
        leakDetected = true;
        return '';
      }
      return match;
    });
  }

  // Step 3.5: tags with no legitimate narrative use. Always strip balanced
  // pairs regardless of body shape. Currently just <character_id>, whose
  // body is a kebab slug that looksStructured would not catch.
  for (const tag of ALWAYS_STRIP_BARE_TAGS) {
    const re = new RegExp(`<${tag}>[\\s\\S]*?<\\/${tag}>`, 'g');
    if (re.test(working)) {
      working = working.replace(new RegExp(`<${tag}>[\\s\\S]*?<\\/${tag}>`, 'g'), '');
      leakDetected = true;
    }
  }

  // Step 4: orphan-tag cleanup. By this point, every valid <TAG>...</TAG>
  // pair from STRUCTURED_BARE_TAGS with a structured body has been removed,
  // and unterminated containers (save_onboarding, close_session) have been
  // stripped to end-of-string by steps 1-2. Any remaining standalone <TAG>
  // or </TAG> for a tag in ORPHAN_TAGS is by definition orphaned. Four
  // sub-cases handled per tag:
  //   a) Unterminated open with structured-data payload (<TAG> with no </TAG>)
  //      — applies only to STRUCTURED_BARE_TAGS. Strip from the open tag to
  //      end-of-string so the trailing JSON/payload fragment is removed too.
  //      (Non-structured tags like character_id carry short IDs, not payloads,
  //      so stripping to end-of-string would wrongly discard subsequent prose.)
  //   b) Lone close (</TAG> with no matching <TAG> in the string) — strip just
  //      the close tag.
  //   c) Lone open (<TAG> with no matching </TAG>) for non-structured tags —
  //      strip just the open tag, preserving the content that follows it.
  //   d) Balanced pairs (<TAG>...</TAG> surviving step 3 as legit narrative) —
  //      leave alone.
  for (const tag of ORPHAN_TAGS) {
    const isStructured = STRUCTURED_BARE_TAGS.includes(tag);

    if (isStructured) {
      // Sub-case (a): unterminated structured open — strip from tag to EOS.
      // Catches "<npc_patch>\n[truncated JSON" where </npc_patch> was never
      // emitted. Use the same negative-lookahead shape as steps 1-2.
      const unterminatedRe = new RegExp(`<${tag}>(?![\\s\\S]*<\\/${tag}>)[\\s\\S]*$`);
      if (unterminatedRe.test(working)) {
        working = working.replace(unterminatedRe, '');
        leakDetected = true;
      }
    }

    // Sub-case (b): lone close tag — no matching open left in the string.
    // After sub-case (a) may have consumed an unterminated open above, any
    // surviving </TAG> without a <TAG> counterpart is orphaned.
    const hasOpen = new RegExp(`<${tag}>`).test(working);
    if (!hasOpen) {
      const closeRe = new RegExp(`<\\/${tag}>`, 'g');
      if (closeRe.test(working)) {
        working = working.replace(new RegExp(`<\\/${tag}>`, 'g'), '');
        leakDetected = true;
      }
    } else if (!isStructured) {
      // Sub-case (c): non-structured tag with an open but no close — strip
      // just the open tag. (Structured tags with unmatched open are handled
      // by sub-case (a) above; balanced pairs are left alone per sub-case (d).)
      const hasClose = new RegExp(`<\\/${tag}>`).test(working);
      if (!hasClose) {
        working = working.replace(new RegExp(`<${tag}>`, 'g'), '');
        leakDetected = true;
      }
    }
    // Sub-case (d): balanced pair — no action. For STRUCTURED_BARE_TAGS,
    // step 3 already decided whether to strip; for the other ORPHAN_TAGS
    // members, balanced pairs are either handled by step 3.5 (character_id)
    // or are legitimate container blocks already removed upstream
    // (save_onboarding, close_session).
  }

  return { cleaned: working.trim(), leakDetected };
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
  // mechanics_depth is optional in the block. Player-onboarding can either
  // collect a value 1-5 from the player or let them defer the choice — in
  // both omitted and invalid cases the bot falls back to the default of 3
  // with mechanics_depth_set=false so the post-first-session calibration
  // still fires. Anything outside [1,5] or non-numeric collapses to null.
  const rawDepth = get('mechanics_depth');
  let mechanics_depth = null;
  if (rawDepth !== null) {
    const parsed = Number(rawDepth);
    if (Number.isInteger(parsed) && parsed >= 1 && parsed <= 5) {
      mechanics_depth = parsed;
    }
  }
  return {
    discord_id: get('discord_id'),
    display_name: get('display_name'),
    safety: get('safety'),
    mechanics_depth,
  };
}

// Removes the first balanced <save_player>...</save_player> block from text.
// Mirrors stripSaveOnboardingBlock / stripCloseBlock — the bot extracts the
// block, processes it, and must not post the raw tags + safety JSON to the
// player's Discord thread. No-op when no block is present.
export function stripSavePlayerBlock(text) {
  if (typeof text !== 'string') return text;
  const openIdx = text.indexOf(SAVE_PLAYER_OPEN);
  const closeIdx = text.indexOf(SAVE_PLAYER_CLOSE);
  if (openIdx === -1 || closeIdx === -1 || closeIdx <= openIdx) return text;
  const before = text.slice(0, openIdx);
  const after = text.slice(closeIdx + SAVE_PLAYER_CLOSE.length);
  return (before + after).trim();
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

export function applyPatch(current, patch) {
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

export function prependPublicEvent(current, entry) {
  const markdown = String(current || '');
  const append = String(entry || '').trim();
  if (!append) return markdown;
  const firstEntry = markdown.search(/^## /m);
  if (firstEntry < 0) return `${markdown.trimEnd()}\n\n${append}\n`;
  return `${markdown.slice(0, firstEntry).trimEnd()}\n\n${append}\n\n${markdown.slice(firstEntry).trimStart()}`;
}

// Full default state.json shape for a brand-new character. Mirrors
// players/_template/state.json — kept in sync by convention. Used as the seed
// before applying the MC's state_patch so any field the MC omits keeps its
// zero default instead of going missing (dashboard reads state.json directly
// and has no fallback for circle_ratings / circle_status / harm / etc.).
export function freshCharacterState(id) {
  return {
    character_id: id,
    character_name: '',
    playbook: '',
    wod_extension: '',
    stats: { Blood: 0, Heart: 0, Mind: 0, Spirit: 0 },
    harm: 0,
    corrupt: 0,
    xp: 0,
    advances: 0,
    circle_ratings: { Mortalis: 0, Night: 0, Power: 0, Wild: 0 },
    circle_status:  { Mortalis: 0, Night: 0, Power: 0, Wild: 0 },
    circle_marks:   { Mortalis: false, Night: false, Power: false, Wild: false },
    gear: [],
    active_arc_ids: [],
    last_session: 'session_000',
    effects: { holds: [], forward: [], ongoing: [] },
    playbook_state: {},
    notes: '',
  };
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
  const publicSessionId = `${id}:session_000`;
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

  // Always write state.json on first save, seeded with the full schema so
  // missing patch fields keep their template defaults. Dashboard reads
  // state.json directly with no fallback for most fields — a sparse file
  // makes circles/harm/xp silently vanish.
  writes.push(['state', updateJSON(
    `players/${id}/state.json`,
    (current) => applyPatch(current || freshCharacterState(id), parsedStatePatch || {}),
    `[onboarding] state for ${id} (${stamp})`
  )]);

  if (save.npc_patch) {
    try {
      const patches = JSON.parse(save.npc_patch);
      writes.push(['npcs', updateJSON('game/npcs.json', (doc) => {
        const result = mergeCanonicalPatches(doc, patches, { collection: 'npcs', idPrefix: 'npc_', sessionId: publicSessionId, stamp, allowNameMatch: true });
        warnings.push(...result.rejected.map(message => `npc_patch: ${message}`));
        return result.doc;
      }, `[onboarding] npcs (${stamp})`)]);
    } catch (e) { warnings.push(`npc_patch: ${e.message}`); }
  }

  if (save.location_patch) {
    try {
      const patches = JSON.parse(save.location_patch);
      writes.push(['locations', updateJSON('game/locations.json', (doc) => {
        const result = mergeCanonicalPatches(doc, patches, { collection: 'locations', idPrefix: 'loc_', sessionId: publicSessionId, stamp, allowNameMatch: true });
        warnings.push(...result.rejected.map(message => `location_patch: ${message}`));
        return result.doc;
      }, `[onboarding] locations (${stamp})`)]);
    } catch (e) { warnings.push(`location_patch: ${e.message}`); }
  }

  if (save.relationship_patch) {
    try {
      const patches = JSON.parse(save.relationship_patch);
      writes.push(['relationships', updateJSON('game/relationships.derived.json', (doc) => {
        const result = mergeCanonicalPatches(doc, patches, { collection: 'relationships', idPrefix: 'rel_', sessionId: publicSessionId, stamp, publicOnly: true });
        warnings.push(...result.rejected.map(message => `relationship_patch: ${message}`));
        return result.doc;
      }, `[onboarding] relationships (${stamp})`)]);
    } catch (e) { warnings.push(`relationship_patch: ${e.message}`); }
  }

  if (save.debt_patch) {
    try {
      const patches = JSON.parse(save.debt_patch);
      writes.push(['debts', updateJSON('game/debts.json', (doc) => {
        const result = mergeDebtPatches(doc, patches, { sessionId: publicSessionId, stamp });
        warnings.push(...result.rejected.map(message => `debt_patch: ${message}`));
        return result.doc;
      }, `[onboarding] debts (${stamp})`)]);
    } catch (e) { warnings.push(`debt_patch: ${e.message}`); }
  }

  if (save.events_append) {
    const append = save.events_append.trim();
    writes.push(['events-log', updateFile(
      'game/events-log.md',
      (current) => prependPublicEvent(current, append),
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
      await updateProfile(
        ownerId,
        (current) => {
          if (!current) return null;
          const characters = Array.isArray(current.characters) ? current.characters : [];
          if (characters.includes(id)) return null;
          return { ...current, characters: [...characters, id] };
        },
        `[onboarding] link character ${id} to player ${ownerId} (${stamp})`
      );
    } catch (err) {
      console.error(`[onboarding] failed to link character ${id} to profile ${ownerId}: ${err.message}`);
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
    // Preserve discord_id — the close-session path reads it for profile_patch
    // application, calibration firing, and character→profile linking. Dropping
    // it here silently breaks all three for the very population they exist for
    // (a brand-new player just finishing onboarding).
    session.player = { ...session.player, id, name: displayName };
    session._onboardingSaved = true;
    // Thread launched as "<username> — new character"; now that the character
    // has a real name, retitle it so this character's thread is distinct.
    await renameSessionThread(thread, displayName);
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
  const okNames = [];
  const failNames = [];
  const recordedConflicts = [];
  const worldImpact = parseWorldImpact(close) || { level: 'personal', summary: 'Missing impact declaration.', affected_ids: [] };
  const baseWorldRevision = session.worldRevision || 0;
  const stateBeforeClose = await readJSON(`players/${id}/state.json`) || freshCharacterState(id);
  const logicalSessionId = `${id}:${nextSessionId(stateBeforeClose.last_session)}`;

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

  let parsedStatePatch = {};
  let profilePatch = null;
  if (close.state_patch) {
    try {
      parsedStatePatch = JSON.parse(close.state_patch);
      // The MC may nest a `profile_patch` inside state_patch (carryover-confirm
      // beat). Lift it out so it does not pollute the character's state.json.
      if (parsedStatePatch && typeof parsedStatePatch === 'object' && parsedStatePatch.profile_patch) {
        profilePatch = parsedStatePatch.profile_patch;
        const { profile_patch, ...stateOnly } = parsedStatePatch;
        parsedStatePatch = stateOnly;
      }
    } catch (e) {
      warnings.push(`state_patch: ${e.message}`);
      parsedStatePatch = {};
    }
  }

  let arcPatches = [];
  if (close.arc_patch) {
    try {
      const parsed = JSON.parse(close.arc_patch);
      if (!Array.isArray(parsed)) throw new Error('expected an array');
      arcPatches = parsed;
    } catch (e) {
      warnings.push(`arc_patch: ${e.message}`);
    }
  }

  // Arcs are reconciled before character state because active_arc_ids is a
  // derived index. An involved arc ignored for two consecutive sessions gains
  // one pressure (escalation), while a touched arc resets its ignore counter.
  let currentArcs = await readJSON('game/arcs.json') || { arcs: [] };
  const originalArcs = currentArcs;
  const hadActiveArcs = deriveActiveArcIds(currentArcs, id).length > 0;
  if (arcPatches.length || hadActiveArcs) {
    try {
      await updateJSON('game/arcs.json', (doc) => {
        currentArcs = reconcileArcs(doc, arcPatches, {
          characterId: id,
          sessionId: logicalSessionId,
          stamp,
          conflicts: recordedConflicts,
        });
        return currentArcs;
      }, `[session] arcs (${stamp})`);
      okNames.push('arcs');
    } catch (e) {
      currentArcs = originalArcs;
      failNames.push(`arcs: ${e.message}`);
      console.error(`[session-close] arc reconciliation failed for ${id}: ${e.message}`);
    }
  }
  const activeArcIds = deriveActiveArcIds(currentArcs, id);

  // State is always written on a real close. Session numbering, ranges,
  // Circle marks from recorded rolls, effects containers, and arc membership
  // are bot-owned invariants rather than model suggestions.
  let reconciledState = null;
  try {
    await updateJSON(`players/${id}/state.json`, (current) => {
      const result = reconcileCharacterState(current || stateBeforeClose, parsedStatePatch, {
        characterId: id,
        activeArcIds,
        rolls: session.rolls || [],
      });
      reconciledState = result.state;
      warnings.push(...result.warnings);
      return result.state;
    }, `[session] state for ${session.player.name} (${stamp})`);
    okNames.push('state');
  } catch (e) {
    failNames.push(`state: ${e.message}`);
    console.error(`[session-close] state reconciliation failed for ${id}: ${e.message}`);
  }

  if (close.events_append) {
    const append = close.events_append.trim();
    writes.push(['events-log', updateFile(
      'game/events-log.md',
      (current) => prependPublicEvent(current, append),
      `[session] events log (${stamp})`
    )]);
  }

  if (close.npc_patch) {
    try {
      const patches = JSON.parse(close.npc_patch);
      writes.push(['npcs', updateJSON('game/npcs.json', (doc) => {
        const result = mergeCanonicalPatches(doc, patches, { collection: 'npcs', idPrefix: 'npc_', sessionId: logicalSessionId, stamp, allowNameMatch: true });
        warnings.push(...result.rejected.map(message => `npc_patch: ${message}`));
        recordedConflicts.push(...result.conflicts);
        return result.doc;
      }, `[session] npcs (${stamp})`)]);
    } catch (e) { warnings.push(`npc_patch: ${e.message}`); }
  }

  if (close.location_patch) {
    try {
      const patches = JSON.parse(close.location_patch);
      writes.push(['locations', updateJSON('game/locations.json', (doc) => {
        const result = mergeCanonicalPatches(doc, patches, { collection: 'locations', idPrefix: 'loc_', sessionId: logicalSessionId, stamp, allowNameMatch: true });
        warnings.push(...result.rejected.map(message => `location_patch: ${message}`));
        recordedConflicts.push(...result.conflicts);
        return result.doc;
      }, `[session] locations (${stamp})`)]);
    } catch (e) { warnings.push(`location_patch: ${e.message}`); }
  }

  if (close.relationship_patch) {
    try {
      const patches = JSON.parse(close.relationship_patch);
      writes.push(['relationships', updateJSON('game/relationships.derived.json', (doc) => {
        const result = mergeCanonicalPatches(doc, patches, { collection: 'relationships', idPrefix: 'rel_', sessionId: logicalSessionId, stamp, publicOnly: true });
        warnings.push(...result.rejected.map(message => `relationship_patch: ${message}`));
        recordedConflicts.push(...result.conflicts);
        return result.doc;
      }, `[session] relationships (${stamp})`)]);
    } catch (e) { warnings.push(`relationship_patch: ${e.message}`); }
  }

  if (close.debt_patch) {
    try {
      const patches = JSON.parse(close.debt_patch);
      writes.push(['debts', updateJSON('game/debts.json', (doc) => {
        const result = mergeDebtPatches(doc, patches, { sessionId: logicalSessionId, stamp });
        warnings.push(...result.rejected.map(message => `debt_patch: ${message}`));
        return result.doc;
      }, `[session] debts (${stamp})`)]);
    } catch (e) { warnings.push(`debt_patch: ${e.message}`); }
  }

  if (close.hub_patch) {
    try {
      const patches = JSON.parse(close.hub_patch);
      writes.push(['hub-state', updateJSON('game/hub-state.json', (doc) => {
        const result = mergeCanonicalPatches(doc, patches, { collection: 'hubs', idPrefix: 'hub_', sessionId: logicalSessionId, stamp });
        warnings.push(...result.rejected.map(message => `hub_patch: ${message}`));
        recordedConflicts.push(...result.conflicts);
        return result.doc;
      }, `[session] hub state (${stamp})`)]);
    } catch (e) { warnings.push(`hub_patch: ${e.message}`); }
  }

  if (close.interaction_ops || close.interactions_patch || session.openingEchoId) {
    try {
      const operations = close.interaction_ops ? JSON.parse(close.interaction_ops) : null;
      const emitted = !operations && close.interactions_patch ? JSON.parse(close.interactions_patch) : null;
      writes.push(['interactions', updateJSON(
        'game/interactions.json',
        (current) => {
          if (operations) {
            const withOpeningConsume = session.openingEchoId
              ? [...operations, { op: 'consume', id: session.openingEchoId }]
              : operations;
            const result = applyInteractionOperations(current, withOpeningConsume, { stamp, sessionId: logicalSessionId });
            warnings.push(...result.rejected.map(message => `interaction_ops: ${message}`));
            return result.doc;
          }
          const next = emitted || current || { interactions: [] };
          const list = Array.isArray(next.interactions) ? next.interactions : [];
          return {
            ...next,
            interactions: session.openingEchoId
              ? list.filter(item => item.id !== session.openingEchoId)
              : list,
          };
        },
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
    // save_onboarding never fired this session, so the thread is still titled
    // "<username> — new character". Retitle before it's archived so the
    // reviewable record shows the character's name, not the player's username.
    await renameSessionThread(thread, displayName);
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
        await updateProfile(
          closeOwnerId,
          (current) => {
            if (!current) return null;
            const characters = Array.isArray(current.characters) ? current.characters : [];
            if (characters.includes(id)) return null;
            return { ...current, characters: [...characters, id] };
          },
          `[session] link character ${id} to player ${closeOwnerId} (${stamp})`
        );
      } catch (err) {
        console.error(`[session] failed to link character ${id} to profile ${closeOwnerId}: ${err.message}`);
      }
    }
  }

  const results = await Promise.allSettled(writes.map(([, p]) => p));
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

  if (recordedConflicts.length) {
    try {
      await updateJSON('game/conflicts.json', (current) => {
        const list = Array.isArray(current?.conflicts) ? [...current.conflicts] : [];
        for (const conflict of recordedConflicts) {
          const suffix = `${logicalSessionId}_${conflict.entity_id}_${conflict.fields.join('_')}`.replace(/[^a-zA-Z0-9_]+/g, '_').toLowerCase();
          const id = `conflict_${suffix}`;
          if (list.some(item => item.id === id && item.status === 'pending')) continue;
          list.push({
            id,
            status: 'pending',
            entity_id: conflict.entity_id,
            expected_revision: conflict.expected_revision,
            actual_revision: conflict.actual_revision,
            fields: conflict.fields,
            proposed_changes: conflict.proposed_changes,
            evidence_session_ids: [logicalSessionId],
            created_at: new Date().toISOString(),
          });
        }
        return { ...(current || {}), schema_version: 1, last_updated: stamp, conflicts: list };
      }, `[session] record continuity conflicts (${stamp})`);
      okNames.push('conflicts');
    } catch (e) {
      failNames.push(`conflicts: ${e.message}`);
    }
  }

  const sharedTouchKeys = [
    'events_append', 'npc_patch', 'location_patch', 'relationship_patch',
    'debt_patch', 'arc_patch', 'hub_patch', 'interaction_ops', 'interactions_patch',
  ];
  const hasSharedTouches = worldImpact.level === 'shared' || sharedTouchKeys.some(key => Boolean(close[key]));
  let resultingWorldRevision = session.worldRevision || 0;
  if (hasSharedTouches) {
    try {
      await updateJSON('game/world-meta.json', (current) => {
        resultingWorldRevision = (Number.isInteger(current?.revision) ? current.revision : 0) + 1;
        return {
          ...(current || {}),
          schema_version: 1,
          revision: resultingWorldRevision,
          last_player_update: new Date().toISOString(),
          maintenance_status: 'open',
        };
      }, `[session] world revision ${logicalSessionId} (${stamp})`);
      session.worldRevision = resultingWorldRevision;
      okNames.push('world-meta');
    } catch (e) {
      failNames.push(`world-meta: ${e.message}`);
    }
  }

  try {
    const ledgerName = `${id}-${nextSessionId(stateBeforeClose.last_session)}`;
    const ledger = {
      schema_version: 1,
      session_id: logicalSessionId,
      character_id: id,
      closed_at: new Date().toISOString(),
      base_world_revision: baseWorldRevision,
      resulting_world_revision: resultingWorldRevision,
      world_impact: worldImpact,
      touched: sharedTouchKeys.filter(key => Boolean(close[key])),
      public_event: close.events_append || null,
      conflicts: recordedConflicts.map(item => ({ entity_id: item.entity_id, fields: item.fields })),
      warnings: [...warnings],
    };
    await writeFile(
      `game/session-ledger/${ledgerName}.json`,
      JSON.stringify(ledger, null, 2) + '\n',
      `[session] public ledger ${logicalSessionId} (${stamp})`
    );
    okNames.push('session-ledger');
  } catch (e) {
    failNames.push(`session-ledger: ${e.message}`);
  }

  if (reconciledState?.last_session) {
    const publicRolls = (session.rolls || []).map(roll => ({
      move: roll.move,
      modifier_key: roll.modifier_key,
      circle: roll.circle,
      instinct_die: roll.instinct_die,
      other_die: roll.other_die,
      modifier: roll.modifier,
      total: roll.total,
      result: roll.result,
      extreme_failure: roll.extreme_failure,
    }));
    const receipt = {
      schema_version: 1,
      session_id: reconciledState.last_session,
      character_id: id,
      date: stamp,
      rolls: publicRolls,
      active_arc_ids: reconciledState.active_arc_ids || [],
      touched_arc_ids: arcPatches.map(item => item.id).filter(Boolean),
      pacing_audit: auditSession({ messages: session.messages, rolls: session.rolls, close }),
    };
    try {
      await writeFile(
        `players/${id}/sessions/${reconciledState.last_session}.json`,
        JSON.stringify(receipt, null, 2) + '\n',
        `[session] receipt for ${session.player.name} ${reconciledState.last_session} (${stamp})`
      );
      okNames.push('receipt');
    } catch (e) {
      failNames.push(`receipt: ${e.message}`);
      console.error(`[session-close] receipt write failed for ${id}: ${e.message}`);
    }
  }

  if (!failNames.length) {
    try {
      await writeCheckpoint(session, {
        summary: 'Session closed successfully.',
        location_id: '',
        present_entity_ids: [],
        open_threads: [],
        pending_mechanics: [],
      }, false);
      okNames.push('checkpoint');
    } catch (e) {
      failNames.push(`checkpoint: ${e.message}`);
    }
  }

  const lines = [];
  if (okNames.length) lines.push(`✓ wrote: ${okNames.join(', ')}`);
  if (failNames.length) lines.push(`✗ failed:\n${failNames.join('\n')}`);
  if (warnings.length) lines.push(`⚠ ${warnings.join('; ')}`);
  if (!lines.length) lines.push('No close-block fields detected — nothing written.');
  await thread.send(lines.join('\n'));

  // Player profile follow-ups: apply any `profile_patch` carried inside the
  // close block's state_patch (already lifted out of parsedStatePatch above),
  // then fire the one-shot mechanics-depth calibration prompt if the player
  // still hasn't been calibrated. The profile_patch is OPTIONAL and permissive
  // — both `safety` and `mechanics_depth` inside it are optional, unknown keys
  // are ignored, and out-of-range mechanics_depth values are dropped silently.
  const discordId = session.player && session.player.discord_id ? String(session.player.discord_id) : null;
  if (discordId) {
    // Apply profile_patch via RMW so a /prefs invocation racing this close
    // doesn't lose its update. The transform reads the latest profile from
    // GitHub each retry attempt.
    let postPatchProfile = null;
    if (profilePatch && typeof profilePatch === 'object') {
      try {
        postPatchProfile = await updateProfile(
          discordId,
          (current) => {
            if (!current) return null;
            let dirty = false;
            const next = { ...current };
            if (profilePatch.safety && typeof profilePatch.safety === 'object') {
              const nextSafety = { ...current.safety };
              if (Array.isArray(profilePatch.safety.hard_limits)) nextSafety.hard_limits = profilePatch.safety.hard_limits;
              if (Array.isArray(profilePatch.safety.soft_limits)) nextSafety.soft_limits = profilePatch.safety.soft_limits;
              next.safety = nextSafety;
              dirty = true;
            }
            if (
              typeof profilePatch.mechanics_depth === 'number' &&
              profilePatch.mechanics_depth >= 1 &&
              profilePatch.mechanics_depth <= 5
            ) {
              next.mechanics_depth = profilePatch.mechanics_depth;
              next.mechanics_depth_set = true;
              dirty = true;
            }
            return dirty ? next : null;
          },
          `[session] profile_patch for ${discordId} (${stamp})`
        );
      } catch (err) {
        console.error(`[session] failed to apply profile_patch for ${discordId}: ${err.message}`);
      }
    }

    // Fire the one-shot calibration prompt at most once. Use the post-patch
    // in-memory profile when we just wrote one (avoids the GitHub eventual-
    // consistency window where a fresh read could still see the pre-write
    // value). Then set `mechanics_depth_set: true` AFTER sending so we never
    // re-prompt — the prompt itself is the calibration event, regardless of
    // whether the player responds.
    const profile = postPatchProfile || (await readProfile(discordId));
    if (profile && profile.mechanics_depth_set === false) {
      try {
        await thread.send({
          content:
            `Quick calibration — how did the amount of mechanics feel this session? ` +
            `Pick a level from **1** (surface most mechanics — named moves, dice, modifiers) ` +
            `to **5** (mechanics fully hidden, pure story). ` +
            `\n\nReply with \`/prefs mechanics N\` (where N is 1–5) and that will be your default going forward.`,
        });
        try {
          await updateProfile(
            discordId,
            (current) => {
              if (!current || current.mechanics_depth_set) return null;
              return { ...current, mechanics_depth_set: true };
            },
            `[session] mark mechanics_depth_set after calibration prompt for ${discordId} (${stamp})`
          );
        } catch (err) {
          console.error(`[session] failed to mark mechanics_depth_set for ${discordId}: ${err.message}`);
        }
      } catch (err) {
        console.error(`[session] failed to post calibration prompt: ${err.message}`);
      }
    }
  }

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
  return { success: failNames.length === 0, failures: failNames };
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
