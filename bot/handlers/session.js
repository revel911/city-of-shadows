import { registerArchiveThread } from './archive-runtime.js';
import { randomUUID } from 'node:crypto';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import { lifecycleIntent, lifecyclePrompt, creationProgress, creationTurnContext, persistencePayloadProblems } from './lifecycle.js';
import { loadSessionSnapshot, removeSessionSnapshot, saveSessionSnapshot } from './runtime-store.js';
import { profilePath } from './profile.js';
import { appendContinuityCorrection, handleContinuityAction } from './continuity.js';
import { adjudicateMove, generate, buildOpeningContext, loadCharacterBundle, selectInteractionEcho } from './mc.js';
import { buildClarificationAdjudicationText } from './move-adjudicator.js';
import {
  buildMoveResolutionContext,
  withDerivedMysteryState,
} from './narrative-state.js';
import { commitBatch, listPlayers, readFile, readJSON, writeFile, updateJSON } from './github.js';
import { canPlayCharacter, chunk } from './read-utils.js';
import { characterSheetProblems } from './character-sheet.js';
import { readProfile, updateProfile } from './profile.js';
import {
  buildSceneDirectorContext,
  isCharacterRecapRequest,
  isNarrativeFollowThrough,
  isOutOfCharacterMessage,
  mergePlaystyleObservations,
  normalizePlaystyleSignals,
  updatePlaystyleSignals,
} from './scene-director.js';
import {
  applyInteractionOperations,
  buildRelevantWorldContext,
  findMentionedNpcs,
  formatNpcHydrationContext,
  mergeCanonicalPatches,
  mergeNpcCharacterMemoryPatches,
} from './world-state.js';
import {
  auditSession,
  buildMechanicsFallback,
  buildMechanicsGateContext,
  buildMoveAuditContext,
  buildRollPrompt,
  createRollRecord,
  detectMechanicsExpectation,
  deriveActiveArcIds,
  formatRoll,
  formatMoveNames,
  mergeDebtPatches,
  mechanicsResponseProblems,
  nextSessionId,
  parseDicePair,
  parseManualRoll,
  parseRollRequest,
  previewRollTotal,
  reconcileArcs,
  reconcileCharacterState,
  stripModelRollInstructions,
  stripRollRequest,
} from './mechanics.js';

const sessions = new Map();
const restoring = new Map();
const GENERATION_RETRIES = 2;
const OPENING_MAX_CHARS = 1400;
const OPENING_MAX_TOKENS = 450;
const TURN_MAX_CHARS = 1400;
const SHORT_TURN_MAX_CHARS = 900;
const SHORT_PLAYER_INPUT_CHARS = 120;
const OOC_MAX_CHARS = 1800;
const OOC_MAX_TOKENS = 550;

// Serializes async work on a single session so concurrent player messages
// don't interleave generate() calls and produce two consecutive user turns
// (which the chat-completions API rejects as an alternation error).
// After each turn the live session is snapshotted to the runtime volume so a
// restart resumes the exact conversation and pending mechanics.
function lock(session, fn) {
  const prev = session._chain || Promise.resolve();
  const next = prev.then(() => fn(), () => fn()).finally(() => persistRuntime(session));
  session._chain = next.catch(() => {});
  return next;
}

async function persistRuntime(session) {
  try {
    if (sessions.get(session.threadId) === session) await saveSessionSnapshot(session);
    else await removeSessionSnapshot(session.threadId);
  } catch (error) {
    console.error(`[runtime] snapshot failed for ${session.threadId}: ${error.message}`);
  }
}

// Background persistence (checkpoints) runs after the reply is posted. It is
// chained so writes land in order, and a close waits for it before committing.
function inBackground(session, label, fn) {
  const prev = session._bg || Promise.resolve();
  session._bg = prev.then(fn).catch(error => console.error(`[${label}] ${session.threadId}: ${error.message}`));
  return session._bg;
}

const TYPING_REFRESH_MS = 8000;
const STILL_WORKING_MS = 25000;

// Discord's typing indicator lapses after ~10s, and silence makes players
// think the bot died. Keep it alive and post one visible note on long waits.
async function withTyping(channel, fn, { note = '— *Still working on it. The city is thinking…* —' } = {}) {
  const typing = () => channel?.sendTyping?.()?.catch?.(() => {});
  typing();
  const timer = setInterval(typing, TYPING_REFRESH_MS);
  let notice = null;
  const slow = note ? setTimeout(async () => {
    notice = await channel?.send?.(note)?.catch?.(() => null);
  }, STILL_WORKING_MS) : null;
  timer.unref?.();
  slow?.unref?.();
  try {
    return await fn();
  } finally {
    clearInterval(timer);
    if (slow) clearTimeout(slow);
    if (notice?.delete) notice.delete().catch(() => {});
  }
}

const CANCEL_ACTION_RE = /^\s*(?:cancel(?: that)?|never ?mind|I (?:do not|don't) do that|change of plan)\s*[.!]?\s*$/i;

// World revisions change only on a session close (this process) or a Keeper
// run (scheduled). Local closes update the cache directly; Keeper changes are
// picked up within the TTL, so play turns do not wait on GitHub every time.
const WORLD_META_TTL_MS = 60000;
let worldMetaCache = { revision: null, at: 0, pending: null };

async function currentWorldRevision() {
  if (worldMetaCache.revision !== null && Date.now() - worldMetaCache.at < WORLD_META_TTL_MS) return worldMetaCache.revision;
  worldMetaCache.pending ||= readJSON('game/world-meta.json')
    .then(meta => {
      worldMetaCache = { revision: Number.isInteger(meta?.revision) ? meta.revision : 0, at: Date.now(), pending: null };
      return worldMetaCache.revision;
    })
    .catch(error => {
      worldMetaCache.pending = null;
      throw error;
    });
  return worldMetaCache.pending;
}

function noteWorldRevision(revision) {
  worldMetaCache = { revision, at: Date.now(), pending: null };
}

export function resetWorldRevisionCache() {
  worldMetaCache = { revision: null, at: 0, pending: null };
}

async function characterState(session) {
  if (!session.state) session.state = await readJSON(`players/${session.player.id}/state.json`) || {};
  return session.state;
}

export async function startSession(thread, player) {
  const bundle = await loadCharacterBundle(player);
  const opening = await buildOpeningContext(player, bundle);
  const {
    profile,
    state: openingState,
    interactions: openingInteractions,
    worldMeta,
    sheet: mechanicsSheet,
    creation: savedProgress,
    checkpoint: savedCheckpoint,
  } = bundle;
  const initialPlaystyleSignals = normalizePlaystyleSignals(profile?.inferred_playstyle);
  const session = {
    player,
    draftId: player.id === '__new__' ? `character-${randomUUID().slice(0, 8)}` : player.id,
    threadId: thread.id,
    messages: [{ role: 'user', content: opening }],
    startedAt: Date.now(),
    rolls: savedCheckpoint?.active && Array.isArray(savedCheckpoint.rolls) ? savedCheckpoint.rolls : [],
    pendingRoll: savedCheckpoint?.pending_roll || null,
    pendingManualRoll: savedCheckpoint?.pending_manual_roll || null,
    pendingMechanicsClarification: savedCheckpoint?.pending_mechanics_clarification || null,
    mechanicsGateTriggers: 0,
    mechanicsAdjudications: 0,
    turnsWithoutRoll: 0,
    profileReady: Boolean(profile),
    mechanicsDepth: profile?.mechanics_depth || 3,
    mechanicsSheet: mechanicsSheet || '',
    rulesProfile: {
      isNew: player.id === '__new__' || savedProgress?.status === 'draft' || player.creation_status === 'draft',
      playbook: openingState?.playbook || '',
      wod_extension: openingState?.wod_extension || '',
    },
    openingEchoId: selectInteractionEcho(openingInteractions, player.id)?.id || null,
    worldRevision: Number.isInteger(worldMeta?.revision) ? worldMeta.revision : 0,
    hydratedNpcIds: new Set(),
    npcCatalog: null,
    npcMemoryCatalog: null,
    playstyleBaseline: initialPlaystyleSignals,
    playstyleSignals: initialPlaystyleSignals,
    state: openingState || null,
  };
  if (session.rulesProfile.isNew) session.messages[0].content += '\n\n' + creationTurnContext(session);
  sessions.set(thread.id, session);
  await registerArchiveThread(thread, { id: session.draftId, name: player.name })
    .catch(error => console.error(`[archive] thread registration failed: ${error.message}`));
  await thread.send(sessionControls(session));

  await lock(session, async () => {
    const notice = await thread.send('— *The city is gathering your opening scene. This can take a minute…* —');
    await thread.sendTyping();
    try {
      const response = await withTyping(thread, () => generateSafeResponse(session, { opening: true, maxVisibleChars: session.rulesProfile.isNew ? 700 : OPENING_MAX_CHARS }), { note: null });
      session.messages.push({ role: 'assistant', content: response });
      const pendingBefore = session.pendingRoll;
      await postMCResponse(thread, response, session);
      // A roll restored from the checkpoint still needs its prompt and buttons.
      if (pendingBefore && session.pendingRoll === pendingBefore) await sendRollPrompt(thread, session);
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

export function playerFacingTurnLimit(playerContent, priorPlayerContent = '') {
  if (isOutOfCharacterMessage(playerContent, priorPlayerContent)) return OOC_MAX_CHARS;
  return String(playerContent || '').trim().length <= SHORT_PLAYER_INPUT_CHARS
    ? SHORT_TURN_MAX_CHARS
    : TURN_MAX_CHARS;
}

export function contextualManualRoll(session, playerContent) {
  const explicit = parseManualRoll(playerContent);
  if (!session?.pendingRoll) return { roll: explicit };
  if (explicit) return { roll: explicit };
  const pair = parseDicePair(playerContent);
  if (pair) return { roll: pair };
  const number = String(playerContent || '').trim().match(/^(-?\d+)[.!]?$/);
  if (!number) return { roll: null };
  if (Number.isInteger(session.pendingManualRoll?.rawTotal)) {
    return { roll: parseManualRoll(`instinct ${number[1]}`) };
  }
  return { roll: parseManualRoll(`I rolled ${number[1]}`) };
}

function clearPendingRoll(session) {
  session.pendingRoll = null;
  session.pendingManualRoll = null;
  session.turnsWithoutRoll = 0;
}

export function pendingRollGuard(session, playerContent) {
  if (!session?.pendingRoll) return null;
  if (parseManualRoll(playerContent)) return null;
  if (CANCEL_ACTION_RE.test(playerContent)) {
    clearPendingRoll(session);
    return 'That action is canceled. Tell me what you do instead.';
  }
  const move = session.mechanicsDepth <= 3 ? ` for **${session.pendingRoll.move}**` : '';
  return `A roll is still waiting${move}. Send both dice, Instinct die first (like \`4 2\`), send their total, tap **Roll for me**, or say **cancel that**.`;
}

function visibleResponseText(response) {
  let visible = typeof response === 'string' ? response : '';
  visible = stripRollRequest(visible);
  visible = stripCheckpointBlock(visible);
  visible = stripSavePlayerBlock(visible);
  visible = stripSaveOnboardingBlock(visible);
  visible = stripCloseBlock(visible);
  return sanitizePlayerFacingText(visible).cleaned.trim();
}

function normalizedEchoText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[>*_#]/g, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function isQuestionOnlyResponse(value) {
  const sentences = String(value || '').match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [];
  return sentences.length > 0 && sentences.every(sentence => sentence.trim().endsWith('?'));
}

export function proseQualityProblems(response) {
  const visible = visibleResponseText(response);
  const problems = [];
  if (/\b([A-Za-z]{2,})\s*,?\s+\1\b/i.test(visible)) {
    problems.push('accidental adjacent word repetition');
  }
  if (/\bwindows? (?:are|is|were|was) (?:all )?(?:up|closed)\b[\s\S]{0,500}\b(?:through|into) (?:an?|the) open window\b/i.test(visible)) {
    problems.push('contradictory window state');
  }
  if (/\b(?:he|she|they|you)\s+(?:is|are|was|were)\s+(?:he|she|they|you|his|her|their|your)\b/i.test(visible)) {
    problems.push('broken pronoun clause');
  }
  if (/\b(?:envelope|package|letter|item|object|phone|weapon|car|body)\s+(?:is|was|has been)\s+(?:gone|missing|taken|removed)\b[\s\S]{0,300}\b(?:see|watch|catch)\s+who\s+(?:picks?|takes?|removes?)\s+it\b/i.test(visible)) {
    problems.push('object is already gone but is also awaiting pickup');
  }
  return problems;
}

function openingDeadlineLacksCurrentTime(value) {
  const text = String(value || '');
  const hasDeadline = /\b(?:before|by|until|no later than)\s+(?:midnight|noon|[01]?\d(?::[0-5]\d)?\s*(?:a\.?m\.?|p\.?m\.?))\b/i.test(text);
  if (!hasDeadline) return false;
  return !/\b(?:it(?:'|’)s|it is|currently|right now|the clock (?:reads|shows)|current time is)\s+(?:about|around|roughly|nearly|just (?:before|after)\s+)?(?:[01]?\d(?::[0-5]\d)?\s*(?:a\.?m\.?|p\.?m\.?)|\d{1,2}\s*o['’]?clock|noon|midnight)\b/i.test(text);
}

export function responseSafetyProblems(response, {
  opening = false,
  maxVisibleChars,
  oocMode = false,
  playerContent = '',
  mechanicsExpectation = null,
  mechanicsDepth = 3,
} = {}) {
  const text = typeof response === 'string' ? response.trim() : '';
  const problems = [];
  if (!text) problems.push('empty response');
  if (/<\/?think(?:ing)?>/i.test(text)) problems.push('internal thinking tag');
  if (/THOUGHTS APPLIED|OPENING ANGLES TO NOTE|SYSTEM PREFERENCE OBSERVATION|SILENT SCENE DIRECTOR/i.test(text)
    || /(?:^|\n)\s*(?:\\?-{2,}\s*SYSTEM\b|\[SYSTEM(?:\s|\]))/im.test(text)
    || /\b(?:locked:\s*player|attention intent control|CLOSE-only|NO push)\b/i.test(text)) {
    problems.push('internal planning marker');
  }
  if (oocMode && /<(?:roll_request|checkpoint|save_player|save_onboarding|close_session|state_patch|npc_patch|location_patch|relationship_patch|debt_patch|arc_patch|mystery_patch|interaction_ops)\b/i.test(text)) {
    problems.push('out-of-character response attempts to advance or persist state');
  }
  const visible = visibleResponseText(text);
  if (/I (?:can(?:not|'t)|don(?:not|'t)) (?:write|decide|invent) (?:the |what(?:'s| is) )?contents|you (?:decide|tell me) what(?:'s| is) inside/i.test(visible)) problems.push('MC refuses responsibility for an observable discovery');
  if (oocMode && playerContent) {
    if (normalizedEchoText(visible) === normalizedEchoText(playerContent)) {
      problems.push('out-of-character response merely repeats the player');
    } else if (isQuestionOnlyResponse(visible)) {
      problems.push('out-of-character response asks a question without answering');
    }
  }
  const visibleLimit = maxVisibleChars || (opening ? OPENING_MAX_CHARS : TURN_MAX_CHARS);
  const visibleLength = visible.length;
  if (visibleLength > visibleLimit) {
    problems.push(`${opening ? 'opening' : 'visible turn'} exceeds ${visibleLimit} characters`);
  }
  if (opening && openingDeadlineLacksCurrentTime(visible)) {
    problems.push('opening deadline lacks the current in-fiction time');
  }
  problems.push(...proseQualityProblems(text));
  problems.push(...mechanicsResponseProblems(text, mechanicsExpectation, mechanicsDepth));
  return problems;
}

async function generateSafeResponse(session, {
  opening = false,
  maxVisibleChars,
  oocRecap = false,
  oocMode = false,
  playerContent = '',
  mechanicsExpectation = null,
  initial,
} = {}) {
  let response = typeof initial === 'string' ? initial : await generate(session, opening
    ? { maxTokens: OPENING_MAX_TOKENS, temperature: 0.7 }
    : (oocMode ? { maxTokens: OOC_MAX_TOKENS, temperature: 0.4 } : session.rulesProfile?.isNew ? { maxTokens: 6500 } : {}));
  for (let attempt = 0; attempt <= GENERATION_RETRIES; attempt += 1) {
    const problems = responseSafetyProblems(response, {
      opening,
      maxVisibleChars,
      oocMode,
      playerContent,
      mechanicsExpectation,
      mechanicsDepth: session.mechanicsDepth,
    });
    if (!opening && !oocMode && session.profileReady && session.rulesProfile?.isNew && !parseSaveOnboardingBlock(response)) {
      problems.push('creation progress must include a complete save_onboarding block before the visible question');
    }
    if (opening && !session.rulesProfile?.isNew && !/^\*\*Where we left off\*\*/i.test(visibleResponseText(response))) problems.push('returning opening must begin with **Where we left off**');
    if (!problems.length) return response;
    console.warn(`[generation-safety] rejected response: ${problems.join('; ')}`);
    if (attempt === GENERATION_RETRIES) {
      if (mechanicsExpectation) {
        console.warn(`[generation-safety] using deterministic ${mechanicsExpectation.move} fallback`);
        return buildMechanicsFallback(mechanicsExpectation, session.mechanicsDepth);
      }
      throw new Error(`unsafe response after ${GENERATION_RETRIES + 1} attempts: ${problems.join('; ')}`);
    }
    const visibleLimit = maxVisibleChars || (opening ? OPENING_MAX_CHARS : TURN_MAX_CHARS);
    session.messages.push({ role: 'assistant', content: '[Rejected draft omitted.]' });
    session.messages.push({
      role: 'user',
      content: [
        '[SYSTEM — RESPONSE CORRECTION]',
        `The previous response was rejected: ${problems.join('; ')}.`,
        `Keep player-facing text in 1–3 clear, concrete paragraphs, at most ${visibleLimit} characters. Preserve required hidden save and mechanics blocks.`,
        session.rulesProfile?.isNew && !opening && !oocMode ? creationTurnContext(session) : '',
        opening
          ? (session.rulesProfile?.isNew
              ? 'Continue character creation at the current stage. Ask one useful question. Do not open fictional play before the character is ready.'
              : 'Preserve the brief **Where we left off** orientation and continue the saved beat without repeating completed actions. If the hook has a deadline, state the current in-fiction time.')
          : (oocMode
              ? (oocRecap
                  ? 'Answer the out-of-character character refresher directly in at most five compact bullets. Do not advance the scene or ask for a decision.'
                  : 'Answer the player out of character. Do not bounce their question back. Never fabricate missing past events; consistent observable world details are the MC responsibility. Do not advance fiction or creation, infer a choice, request a roll, or change state.')
              : 'Resolve one consequential beat, then stop at the next player decision. Do not carry the character through multiple actions, locations, or discoveries.'),
        'Use complete sentences. No fragmented, repetitive, or stream-of-consciousness atmospheric prose.',
        'Reread every sentence for missing words, duplicated words, contradictory physical details, and unclear pronouns before answering.',
        mechanicsExpectation
          ? `This turn is mechanically gated: ${mechanicsExpectation.move} must be requested with one <roll_request>. Treat the player action as intent, stop before the outcome, and leave the roll prompt to the bot.`
          : '',
        'Use casual, plainspoken language by default. Never use an em dash. Elevated diction belongs only to a character whose established voice supports it.',
        'Never output analysis, planning, chain-of-thought, system text, preference observations, director notes, <think>, or <thinking> tags.',
      ].filter(Boolean).join('\n'),
    });
    try {
      response = await generate(session, opening
        ? { maxTokens: OPENING_MAX_TOKENS, temperature: 0.5 }
        : (oocMode ? { maxTokens: OOC_MAX_TOKENS, temperature: 0.3 } : { temperature: 0.5 }));
    } finally {
      session.messages.splice(-2, 2);
    }
  }
  throw new Error('unreachable generation safety state');
}

export function hasLiveSession(threadId) { return sessions.has(threadId); }

export function sessionControls(session) {
  const creating = session.rulesProfile?.isNew;
  const actions = creating
    ? [['help', 'Help me choose'], ['build', 'I know my build'], ['save', 'Save progress'], ['end', 'Finish later']]
    : [['recap', 'Quick recap'], ['correct', 'Correct something'], ['save', 'Save progress'], ['end', 'Save & end']];
  return { content: creating ? 'Build your character: Concept → Abilities → Connections → Review. You can save and return anytime.' : 'Continue at your own pace. Save progress keeps a recovery checkpoint; Save & end finishes this session.',
    components: [new ActionRowBuilder().addComponents(actions.map(([action, label]) => new ButtonBuilder().setCustomId(`session:${action}`).setLabel(label).setStyle(action === 'end' ? ButtonStyle.Primary : ButtonStyle.Secondary))), ...(creating ? [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('session:start').setLabel('Start playing').setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId('session:edit').setLabel('Edit a choice').setStyle(ButtonStyle.Secondary))] : [])] };
}

export async function handleSessionControl(interaction) {
  const { session } = await ensureSession(interaction.channel || { id: interaction.channelId }, interaction.user.id, { snapshotOnly: true });
  if (!session) { await interaction.reply({ content: 'This session is not loaded right now. Send any message in this thread (or use /play) to reload it.', ephemeral: true }); return; }
  if (String(session.player.discord_id) !== String(interaction.user.id)) {
    await interaction.reply({ content: 'These controls belong to the player running this session.', ephemeral: true }); return;
  }
  await interaction.deferUpdate();
  const action = interaction.customId.split(':')[1];
  if (action === 'correct') {
    await interaction.followUp({ content: 'Type **Continuity correction:** followed by what needs fixing. Play will pause while we record it.', ephemeral: true }); return;
  }
  const content = { start: 'I am ready to play. Review the required choices and start playing if complete.', edit: 'OOC: I want to edit a character choice. Show me the current choices briefly and ask which to change.', save: 'save progress', end: 'save & end', recap: 'OOC: Give me a quick recap.', help: 'Help me choose a character concept.', build: 'I know my build. Let me give you the choices together.' }[action];
  if (content) await handleMessage({ channel: interaction.channel, author: interaction.user, content, id: interaction.id });
}

async function runLifecycle(thread, session, intent) {
  const creating = session.rulesProfile?.isNew;
  if (session.closeAttempt) {
    const payload = Object.entries(session.closeAttempt.payload).filter(([, value]) => value != null).map(([key, value]) => `<${key}>${value}</${key}>`).join('\n');
    await postMCResponse(thread, `<close_session>\n${payload}\n</close_session>`, session);
    return;
  }
  session.messages.push({ role: 'user', content: lifecyclePrompt(intent, session) });
  await thread.send(intent === 'end'
    ? '— *Wrapping up: writing your handoff and world changes…* —'
    : creating ? '— *Saving your character draft…* —' : '— *Saving a recovery checkpoint…* —');
  // A lifecycle payload needs the full generation budget and bypasses OOC/move routing.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await withTyping(thread, () => generate(session, { maxTokens: 6500, temperature: 0.2 }));
    session.messages.push({ role: 'assistant', content: response });
    if (creating) {
      const save = parseSaveOnboardingBlock(response);
      if (save && !missingSaveOnboardingFields(save).length && !characterSheetProblems(save.sheet).length) {
        save.creation_status = 'draft';
        const result = await processSaveOnboarding(thread, session, save);
        if (result.success && intent === 'end') {
          sessions.delete(session.threadId);
          await thread.send('Creation paused. Use /play to continue your draft.');
          await thread.setArchived?.(true);
        }
        return;
      }
    } else if (intent === 'save') {
      const checkpoint = parseCheckpointBlock(response);
      if (checkpoint) {
        await session._bg;
        await writeCheckpoint(session, checkpoint);
        await thread.send('Recovery checkpoint saved. Keep playing, or use Save & end to finish and record all session changes.');
        return;
      }
    } else {
      const close = parseCloseBlock(response);
      if (close?.handoff && !validateWorldImpact(close).length && !persistencePayloadProblems(close).length) {
        await postMCResponse(thread, response, session);
        return;
      }
    }
    session.messages.push({ role: 'user', content: 'The required save payload was missing or invalid. Repair it now. ' + lifecyclePrompt(intent, session) });
  }
  // The last valid per-choice draft is still a faithful save of the player's choices.
  if (creating && session.pendingDraft) {
    const result = await processSaveOnboarding(thread, session, { ...session.pendingDraft, creation_status: 'draft' });
    if (result.success && intent === 'end') {
      sessions.delete(session.threadId);
      await thread.send('Creation paused. Use /play to continue your draft.');
      await thread.setArchived?.(true);
    }
    if (result.success) return;
  }
  await thread.send('Saving could not be completed. Your session is still open. Use the save control to retry.');
}

function isSessionThreadName(name) {
  return typeof name === 'string' && (name.endsWith(' — session') || name.endsWith(' — new character'));
}

// After a restart or deploy, a thread's live session is rebuilt on its next
// message or button press: from the runtime snapshot when one exists (exact
// transcript and pending mechanics), otherwise from the roster's saved thread
// with a fresh "Where we left off" opening.
export async function ensureSession(channel, userId, { snapshotOnly = false } = {}) {
  const live = sessions.get(channel.id);
  if (live) return { session: live, resumed: null };
  // Interactions must answer within 3s, so they never wait on a full reload.
  if (snapshotOnly && !restoring.has(channel.id) && !(await loadSessionSnapshot(channel.id))) return { session: null, resumed: null };
  if (!restoring.has(channel.id)) {
    restoring.set(channel.id, restoreSession(channel, userId)
      .catch(error => {
        console.error(`[runtime] restore failed for ${channel.id}: ${error.message}`);
        return { session: null, resumed: null };
      })
      .finally(() => restoring.delete(channel.id)));
  }
  return restoring.get(channel.id);
}

async function restoreSession(channel, userId) {
  const snapshot = await loadSessionSnapshot(channel.id);
  if (snapshot) {
    if (snapshot.player?.discord_id && String(snapshot.player.discord_id) !== String(userId)) return { session: null, resumed: null };
    snapshot.threadId = channel.id;
    sessions.set(channel.id, snapshot);
    await registerArchiveThread(channel, { id: snapshot.player.id === '__new__' ? snapshot.draftId : snapshot.player.id, name: snapshot.player.name })
      .catch(error => console.error(`[archive] thread registration failed: ${error.message}`));
    console.log(`[runtime] resumed ${channel.id} from snapshot`);
    return { session: snapshot, resumed: 'snapshot' };
  }
  if (!channel?.isThread?.() || !isSessionThreadName(channel.name)) return { session: null, resumed: null };
  const entry = (await listPlayers()).find(item => item.thread_id === channel.id);
  if (!entry || !canPlayCharacter(entry, userId)) return { session: null, resumed: null };
  await channel.send('— *The bot restarted. Reloading your scene from the last save…* —').catch(() => {});
  await startSession(channel, { ...entry, discord_id: String(userId) });
  return { session: sessions.get(channel.id) || null, resumed: 'opening' };
}

export async function handleMessage(message) {
  if (!message.content?.trim()) return;
  const { session, resumed } = await ensureSession(message.channel, message.author?.id);
  if (!session) {
    // Nothing to recover (for example, a brand-new character that was never
    // saved). Tell the player so they don't type into a void.
    const ch = message.channel;
    if (ch?.isThread?.() && isSessionThreadName(ch.name)) {
      try { await ch.send('The bot restarted and this thread could not be recovered automatically. Use `/play` and choose this character to continue.'); } catch {}
    }
    return;
  }
  if (resumed === 'opening') {
    // The fresh opening already re-anchored the scene; the earlier message was
    // written before it, so ask rather than guess whether it still applies.
    await message.channel.send('If your last message still fits the scene above, send it again.').catch(() => {});
    return;
  }

  await lock(session, async () => {
    if (session.player.discord_id && String(message.author?.id) !== String(session.player.discord_id)) return;
    const intent = lifecycleIntent(message.content);
    if (intent) { await runLifecycle(message.channel, session, intent); return; }
    if (session.closeAttempt) { await message.channel.send('The previous save is incomplete. Use Save & end to retry before continuing play.'); return; }
    const priorPlayerText = session.lastPlayerText || '';
    const repairReply = await handleContinuityAction(session, message.content, {
      priorText: priorPlayerText,
      id: message.id,
      recordedAt: new Date().toISOString(),
      save: correction => updateJSON(
        `players/${session.player.id}/continuity.json`,
        doc => appendContinuityCorrection(doc, correction),
        `[continuity] player correction for ${session.player.name}`
      ),
    });
    if (repairReply) {
      session.lastPlayerText = message.content;
      await message.channel.send(repairReply);
      return;
    }
    await refreshSessionWorld(session);
    const hasMechanicsClarification = Boolean(session.pendingMechanicsClarification);
    const oocMode = session.continuityRepair
      || (!hasMechanicsClarification && isOutOfCharacterMessage(message.content, priorPlayerText));
    const contextualRoll = oocMode ? {} : contextualManualRoll(session, message.content);
    const manualRoll = contextualRoll.roll;
    if (manualRoll) {
      await handleManualRoll(session, message.channel, manualRoll, message.content);
      return;
    }
    const hadPendingRoll = Boolean(session.pendingRoll);
    const pendingGuard = oocMode ? null : pendingRollGuard(session, message.content);
    if (pendingGuard) {
      if (hadPendingRoll && !session.pendingRoll) {
        await retireRollPrompt(message.channel, session, 'Canceled.');
        session.messages.push({
          role: 'user',
          content: '[SYSTEM — PENDING ACTION CANCELED]\nThe player withdrew the action before rolling. Do not resolve it or apply consequences.',
        });
        session.messages.push({ role: 'assistant', content: pendingGuard });
      }
      await message.channel.send(pendingGuard);
      return;
    }
    const lastAssistant = [...session.messages].reverse()
      .find(entry => entry.role === 'assistant')?.content || '';
    const npcHydration = await buildNpcMentionHydration(
      session,
      `${lastAssistant}\n${message.content}`
    );
    const { content: userContent, exhausted } = oocMode
      ? { content: message.content, exhausted: false }
      : applySaveLeakNudge(session, message.content);
    if (exhausted) {
      await message.channel.send(
        `⚠ <save_onboarding> still leaking after ${SAVE_ONBOARDING_MAX_RETRIES} retries. ` +
        `The close block will need to carry the save data.`
      );
      console.error(`[save-onboarding] leak retries exhausted for session ${session.threadId}`);
    }
    if (!oocMode) {
      session.playstyleSignals = updatePlaystyleSignals(session.playstyleSignals, message.content);
    }
    const oocRecap = isCharacterRecapRequest(message.content, priorPlayerText);
    const mechanicsActive = !session.rulesProfile?.isNew
      && (hasMechanicsClarification || (!oocMode && !isNarrativeFollowThrough(message.content)));
    const clarification = mechanicsActive ? session.pendingMechanicsClarification : null;
    if (clarification && CANCEL_ACTION_RE.test(message.content)) {
      session.pendingMechanicsClarification = null;
      session.lastPlayerText = message.content;
      await message.channel.send(`Got it. Tell me what ${session.player.name} does instead.`);
      return;
    }
    if (clarification?.exchanges?.length) {
      clarification.exchanges[clarification.exchanges.length - 1].answer = message.content;
    }
    const adjudicationPlayerText = clarification
      ? buildClarificationAdjudicationText({
          originalPlayerText: clarification.originalPlayerText,
          exchanges: clarification.exchanges,
        })
      : message.content;
    let mechanicsExpectation = mechanicsActive && !clarification
      ? detectMechanicsExpectation(message.content, { lastAssistant })
      : null;
    const sceneDirection = buildSceneDirectorContext({
      playerText: message.content,
      priorPlayerText,
      playstyleSignals: session.playstyleSignals,
      forceOoc: Boolean(session.continuityRepair),
      lastAssistant,
    });
    const turnContent = (expectation, drought) => [
      npcHydration,
      session.rulesProfile?.isNew && !oocMode ? creationTurnContext(session) : '',
      sceneDirection,
      mechanicsActive ? buildMoveAuditContext(drought) : '',
      buildMechanicsGateContext(expectation, session.mechanicsDepth),
      clarification
        ? `[PLAYER ACTION WITH CLARIFICATIONS]\n${adjudicationPlayerText}`
        : `[PLAYER MESSAGE]\n${userContent}`,
    ]
      .filter(Boolean)
      .join('\n\n');
    const noteGate = expectation => {
      session.mechanicsGateTriggers += 1;
      session.turnsWithoutRoll = 0;
      console.log(`[mechanics-gate] session=${session.threadId} move=${expectation.move}`);
    };
    const options = {
      maxVisibleChars: playerFacingTurnLimit(message.content, priorPlayerText),
      oocRecap,
      oocMode,
      playerContent: message.content,
    };
    session.lastPlayerText = message.content;
    let response = null;
    try {
      response = await withTyping(message.channel, async () => {
        if (!mechanicsActive || mechanicsExpectation || oocMode) {
          if (mechanicsExpectation) noteGate(mechanicsExpectation);
          else if (mechanicsActive) session.turnsWithoutRoll += 1;
          session.messages.push({ role: 'user', content: turnContent(mechanicsExpectation, session.turnsWithoutRoll) });
          return generateSafeResponse(session, { ...options, mechanicsExpectation });
        }
        // Ambiguous turn: the move router and the narrator run side by side
        // instead of one after the other. Most turns need no roll, so the
        // speculative narration is usually the reply.
        const turn = { role: 'user', content: turnContent(null, session.turnsWithoutRoll + 1) };
        session.messages.push(turn);
        const speculative = generate(session).then(text => ({ text }), error => ({ error }));
        const adjudication = await adjudicateTurn(session, { clarification, adjudicationPlayerText, lastAssistant, playerText: message.content });
        if (adjudication?.decision === 'clarify') {
          session.turnsWithoutRoll += 1;
          await message.channel.send(adjudication.question);
          await speculative;
          turn.content = [npcHydration, `[PLAYER MESSAGE]\n${userContent}`].filter(Boolean).join('\n\n');
          session.messages.push({ role: 'assistant', content: adjudication.question });
          return null;
        }
        const draft = await speculative;
        if (draft.error) console.warn(`[generation] speculative narration failed: ${draft.error.message}`);
        if (adjudication?.decision === 'roll') {
          mechanicsExpectation = adjudication.expectation;
          noteGate(mechanicsExpectation);
          turn.content = turnContent(mechanicsExpectation, 0);
        } else {
          session.turnsWithoutRoll += 1;
        }
        return generateSafeResponse(session, { ...options, mechanicsExpectation, initial: draft.text });
      });
    } catch (err) {
      console.error(`[generation] failed for session ${session.threadId}: ${err.message}`);
      const safeFailure = oocMode
        ? (oocRecap
            ? 'I couldn’t fit that refresher into a clean reply. Say **“short recap”** and I’ll retry it in compact bullets.'
            : 'I couldn’t prepare a clean out-of-character reply. Ask again with **OOC:** and I’ll retry without advancing anything.')
        : 'I couldn’t prepare a clean reply for that turn. Say **“try again”** and I’ll retry without advancing the scene.';
      session.messages.push({ role: 'assistant', content: safeFailure });
      await message.channel.send(safeFailure);
      return;
    }
    if (response === null) return;
    session.messages.push({ role: 'assistant', content: response });
    await postMCResponse(message.channel, response, session);
  });
}

// Runs the strict move router and records clarification state. Returns null
// when the router fails, so the narrator's own move audit still applies.
async function adjudicateTurn(session, { clarification, adjudicationPlayerText, lastAssistant, playerText }) {
  try {
    const adjudication = await adjudicateMove({
      playerText: adjudicationPlayerText,
      lastAssistant: clarification?.fictionBeforeClarification || lastAssistant,
      sheet: session.mechanicsSheet,
      priorClarificationQuestions: clarification?.exchanges?.map(item => item.question) || [],
    });
    session.mechanicsAdjudications += 1;
    if (adjudication.decision === 'clarify') {
      if (clarification) {
        clarification.exchanges.push({ question: adjudication.question, answer: null });
      } else {
        session.pendingMechanicsClarification = {
          originalPlayerText: playerText,
          fictionBeforeClarification: lastAssistant,
          exchanges: [{ question: adjudication.question, answer: null }],
        };
      }
    } else {
      session.pendingMechanicsClarification = null;
    }
    return adjudication;
  } catch (err) {
    console.warn(`[move-adjudicator] falling back to narrator audit: ${err.message}`);
    return null;
  }
}

async function handleManualRoll(session, channel, manualRoll, text) {
  const say = content => channel.send(content);
  if (!session.pendingRoll) {
    await say('There is no roll waiting right now. The MC will ask when a move needs one.');
    return;
  }
  if (manualRoll.error) {
    await say(manualRoll.error);
    return;
  }
  session.lastPlayerText = text;
  if (manualRoll.rawTotal !== undefined) {
    const preview = previewRollTotal({
      request: session.pendingRoll,
      state: await characterState(session),
      rawTotal: manualRoll.rawTotal,
    });
    if (preview.result === 'miss') {
      // The Instinct die only matters on a miss, so ask for it only then.
      session.pendingManualRoll = { rawTotal: manualRoll.rawTotal };
      await say('After your modifier that is a miss (6 or less). What did the Instinct die show? Just send the number.');
      return;
    }
    await resolvePendingRoll(session, channel, { rawTotal: manualRoll.rawTotal, diceSource: 'manual', acknowledge: say });
    return;
  }
  if (manualRoll.other === undefined) {
    const pendingTotal = session.pendingManualRoll?.rawTotal;
    if (!Number.isInteger(pendingTotal)) {
      await say('Send both dice, Instinct die first (like `4 2`), or send their total.');
      return;
    }
    const other = pendingTotal - manualRoll.instinct;
    if (other < 1 || other > 6) {
      await say('That Instinct die cannot be part of the total you sent. Check the total and die, then try again.');
      return;
    }
    await resolvePendingRoll(session, channel, {
      instinct: manualRoll.instinct,
      other,
      rawTotal: pendingTotal,
      diceSource: 'manual',
      acknowledge: say,
    });
    return;
  }
  await resolvePendingRoll(session, channel, { ...manualRoll, diceSource: 'manual', acknowledge: say });
}

async function buildNpcMentionHydration(session, text) {
  if (!session?.player?.id || session.player.id === '__new__') return '';
  if (!session.npcCatalog) {
    const npcDoc = await readJSON('game/npcs.json');
    session.npcCatalog = npcDoc?.npcs || [];
  }
  if (!session.npcMemoryCatalog) {
    const memoryDoc = await readJSON('game/npc-character-memory.json');
    session.npcMemoryCatalog = (memoryDoc?.memories || [])
      .filter(memory => memory.character_id === session.player.id);
  }
  if (!(session.hydratedNpcIds instanceof Set)) session.hydratedNpcIds = new Set();
  const mentioned = findMentionedNpcs(text, session.npcCatalog, session.hydratedNpcIds);
  for (const npc of mentioned) session.hydratedNpcIds.add(npc.id);
  const memories = session.npcMemoryCatalog
    .filter(memory => mentioned.some(npc => npc.id === memory.npc_id));
  return mentioned.length ? formatNpcHydrationContext(mentioned, memories) : '';
}

async function refreshSessionWorld(session) {
  if (!session?.player?.id || session.player.id === '__new__') return;
  const nextRevision = await currentWorldRevision();
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
  if (state) session.state = state;
  session.npcCatalog = null;
  session.npcMemoryCatalog = null;
}

export function recoverPendingRoll(session) {
  if (!session || session.pendingRoll) return session?.pendingRoll || null;
  const lastAssistant = [...(session.messages || [])].reverse()
    .find(entry => entry.role === 'assistant')?.content || '';
  const expectation = detectMechanicsExpectation(session.lastPlayerText, { lastAssistant });
  if (!expectation) return null;
  session.pendingRoll = expectation;
  session.pendingManualRoll = null;
  session.turnsWithoutRoll = 0;
  return expectation;
}

export const ROLL_BUTTON_PREFIX = 'roll:';
export const ROLL_MODAL_ID = 'roll:modal';

function rollPromptComponents(disabled = false) {
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('roll:auto').setLabel('Roll for me').setEmoji('🎲').setStyle(ButtonStyle.Primary).setDisabled(disabled),
    new ButtonBuilder().setCustomId('roll:manual').setLabel('Enter my dice').setStyle(ButtonStyle.Secondary).setDisabled(disabled),
    new ButtonBuilder().setCustomId('roll:cancel').setLabel('Cancel action').setStyle(ButtonStyle.Secondary).setDisabled(disabled),
  )];
}

// Posted by the bot after every roll request: the move, the canonical
// modifier, and one-tap ways to roll, so the model never has to phrase it.
export async function sendRollPrompt(channel, session) {
  if (!session.pendingRoll) return null;
  const state = session.player.id === '__new__' ? {} : await characterState(session).catch(() => ({}));
  const sent = await channel.send({
    content: buildRollPrompt(session.pendingRoll, state, session.mechanicsDepth),
    components: rollPromptComponents(),
  });
  session.rollPromptMessageId = sent?.id || null;
  return sent;
}

// Disables the buttons on the last roll prompt so a resolved or canceled roll
// cannot be pressed again. Best-effort: a missing message never blocks play.
async function retireRollPrompt(channel, session, note = null) {
  const id = session.rollPromptMessageId;
  session.rollPromptMessageId = null;
  if (!id || typeof channel?.messages?.fetch !== 'function') return;
  try {
    const prompt = await channel.messages.fetch(id);
    await prompt.edit({
      content: note ? `${prompt.content}\n*${note}*` : prompt.content,
      components: rollPromptComponents(true),
    });
  } catch (error) {
    console.warn(`[roll-prompt] could not retire ${id}: ${error.message}`);
  }
}

async function resolvePendingRoll(session, channel, {
  instinct,
  other,
  rawTotal,
  diceSource,
  acknowledge,
}) {
  if (!session.pendingRoll) {
    throw new Error('There is no unresolved move to resolve.');
  }
  const request = session.pendingRoll;
  const state = await characterState(session);
  const record = createRollRecord({
    request,
    state,
    instinct,
    other,
    rawTotal,
    diceSource,
    sessionId: session.threadId,
    characterId: session.player.id,
  });
  clearPendingRoll(session);
  await retireRollPrompt(channel, session);
  session.rolls.push(record);
  session.messages.push({
    role: 'user',
    content: [
      '[SYSTEM — AUTHORITATIVE ROLL RESULT]',
      JSON.stringify(record),
      'Resolve this move now. Do not ask the player to repeat the dice and do not alter the total or result tier.',
      buildMoveResolutionContext(record),
    ].join('\n'),
  });
  await acknowledge(formatRoll(record, session.mechanicsDepth));
  let response;
  try {
    response = await withTyping(channel, () => generateSafeResponse(session));
  } catch (err) {
    console.error(`[generation] roll narration failed for session ${session.threadId}: ${err.message}`);
    const safeFailure = 'The roll is recorded, but I couldn’t narrate it cleanly. Say **“try again”** and I’ll describe what happens.';
    session.messages.push({ role: 'assistant', content: safeFailure });
    await channel.send(safeFailure);
    return;
  }
  session.messages.push({ role: 'assistant', content: response });
  await postMCResponse(channel, response, session);
}

const rollDie = () => 1 + Math.floor(Math.random() * 6);

// Shared ownership/recovery checks for /roll, roll buttons, and the dice form.
async function rollSessionFor(interaction) {
  const { session } = await ensureSession(interaction.channel || { id: interaction.channelId }, interaction.user.id, { snapshotOnly: true });
  if (!session) {
    await interaction.reply({ content: 'This session is not loaded right now. Send any message in this thread (or use `/play`) to reload it, then roll again.', ephemeral: true });
    return null;
  }
  if (session.player.discord_id && String(interaction.user.id) !== String(session.player.discord_id)) {
    await interaction.reply({ content: 'Only the player who owns this session can resolve its pending move.', ephemeral: true });
    return null;
  }
  return session;
}

export async function resolveSessionRoll(interaction) {
  const session = await rollSessionFor(interaction);
  if (!session) return;
  if (!session.pendingRoll) {
    const recovered = recoverPendingRoll(session);
    if (recovered) {
      console.warn('[mechanics-recovery] restored ' + recovered.move + ' for session ' + session.threadId);
    }
  }
  if (!session.pendingRoll) {
    await interaction.reply({
      content: 'There is no roll waiting right now. The MC will ask when a move needs one.',
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply({ ephemeral: session.mechanicsDepth >= 4 });
  await lock(session, async () => {
    await refreshSessionWorld(session);
    if (!session.pendingRoll) {
      await interaction.editReply('That move was already resolved.');
      return;
    }
    await resolvePendingRoll(session, interaction.channel, {
      instinct: rollDie(),
      other: rollDie(),
      diceSource: 'bot',
      acknowledge: content => interaction.editReply(content),
    });
  });
}

// Roll prompt buttons and the "Enter my dice" form.
export async function handleRollInteraction(interaction) {
  const action = interaction.isModalSubmit?.() ? 'modal' : interaction.customId.slice(ROLL_BUTTON_PREFIX.length);
  if (action === 'auto') {
    await resolveSessionRoll(interaction);
    return;
  }
  const session = await rollSessionFor(interaction);
  if (!session) return;
  if (!session.pendingRoll) {
    await interaction.reply({ content: 'That roll was already resolved or canceled.', ephemeral: true });
    return;
  }
  if (action === 'manual') {
    const die = (id, label) => new ActionRowBuilder().addComponents(new TextInputBuilder()
      .setCustomId(id).setLabel(label).setStyle(TextInputStyle.Short).setMinLength(1).setMaxLength(1).setPlaceholder('1-6').setRequired(true));
    await interaction.showModal(new ModalBuilder()
      .setCustomId(ROLL_MODAL_ID)
      .setTitle(`Roll for ${session.mechanicsDepth <= 3 ? session.pendingRoll.move : 'the move'}`.slice(0, 45))
      .addComponents(die('instinct', 'Instinct die'), die('other', 'Other die')));
    return;
  }
  if (action === 'cancel') {
    await interaction.deferUpdate();
    await lock(session, async () => {
      if (!session.pendingRoll) return;
      const reply = pendingRollGuard(session, 'cancel that');
      await retireRollPrompt(interaction.channel, session, 'Canceled.');
      session.messages.push({
        role: 'user',
        content: '[SYSTEM — PENDING ACTION CANCELED]\nThe player withdrew the action before rolling. Do not resolve it or apply consequences.',
      });
      session.messages.push({ role: 'assistant', content: reply });
      await interaction.channel.send(reply);
    });
    return;
  }
  if (action === 'modal') {
    const pair = parseDicePair(`${interaction.fields.getTextInputValue('instinct')} ${interaction.fields.getTextInputValue('other')}`);
    if (!pair || pair.error) {
      await interaction.reply({ content: 'Each die must be a number from 1 to 6. Tap **Enter my dice** to try again.', ephemeral: true });
      return;
    }
    await interaction.deferReply({ ephemeral: session.mechanicsDepth >= 4 });
    await lock(session, async () => {
      if (!session.pendingRoll) {
        await interaction.editReply('That move was already resolved.');
        return;
      }
      await resolvePendingRoll(session, interaction.channel, {
        ...pair,
        diceSource: 'manual',
        acknowledge: content => interaction.editReply(content),
      });
    });
  }
}

const NEW_CHAR_CLOSE_MAX_RETRIES = 2;
export const SAVE_ONBOARDING_MAX_RETRIES = 2;

async function postMCResponse(thread, response, session) {
  const rollRequest = parseRollRequest(response);
  if (rollRequest) {
    session.pendingRoll = rollRequest;
    session.pendingManualRoll = null;
    session.turnsWithoutRoll = 0;
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
  if (checkpoint) response = stripCheckpointBlock(response);

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
          session.profileReady = true;
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
  let draftNote = null;
  if (save) {
    const missing = missingSaveOnboardingFields(save);
    if (save.character_id !== (session.player.id === '__new__' ? session.draftId : session.player.id)) missing.push('permanent character_id supplied by bot');
    if (save.creation_status === 'ready' && !/\b(?:start (?:playing|play|the story)|ready to play|let'?s (?:play|start)|begin (?:play|the story))\b/i.test(session.lastPlayerText || '')) missing.push('explicit player decision to start play');
    if (save.sheet?.trim()) {
      missing.push(...characterSheetProblems(save.sheet).map(problem => `sheet ${problem}`));
    }
    if (missing.length && save.creation_status !== 'ready' && session.player.id !== '__new__') {
      // Routine per-choice drafts are optional snapshots. A malformed one never
      // blocks the turn; the next valid draft or an explicit save supersedes it.
      console.warn(`[save-onboarding] skipped malformed draft for ${session.player.id}: ${missing.join(', ')}`);
      response = stripSaveOnboardingBlock(response);
    } else if (missing.length) {
      const retries = session._saveRetries || 0;
      if (retries < SAVE_ONBOARDING_MAX_RETRIES) {
        session._saveRetries = retries + 1;
        await thread.send(
          'I’m repairing the character save. Your choices are still here.'
        );
        session.messages.push({ role: 'user', content: buildSaveRetryPrompt(missing) });
        await thread.sendTyping();
        const retryResp = await generateSafeResponse(session);
        session.messages.push({ role: 'assistant', content: retryResp });
        await postMCResponse(thread, retryResp, session);
        return;
      }
      await thread.send(
        'Your character could not be saved completely. Use Save progress to retry.'
      );
      console.error(`[save-onboarding] exhausted retries for ${session.player.name}: missing ${missing.join(', ')}`);
      return;
    } else {
      response = stripSaveOnboardingBlock(response);
      session._saveLeakRetries = 0;
      session._saveRetries = 0;
      cleanSaveFiredThisTurn = true;
      if (shouldCommitDraft(session, save)) {
        await thread.send('Saving your character…');
        await processSaveOnboarding(thread, session, save);
      } else {
        // Between stages the draft lives in the session (and its runtime
        // snapshot); it is committed at the next stage, save, or start.
        session.pendingDraft = save;
        session.mechanicsSheet = save.sheet;
        draftNote = `✓ Draft updated. Next: ${String(save.next_step || 'keep building').trim()}`;
      }
    }
  }

  const close = parseCloseBlock(response);
  if (close && persistencePayloadProblems(close).length) {
    console.error('[close] invalid payload', persistencePayloadProblems(close));
    await thread.send('The save needs repair before anything can be written. Use Save & end to retry.');
    return;
  }
  if (close && close.character_id && close.character_id !== session.player.id && session.player.id !== '__new__') {
    await thread.send('The save did not match this character. Use Save & end to retry.');
    return;
  }
  if (close && !close.handoff?.trim()) {
    await thread.send('The resume point was missing. Use Save & end to retry; this thread will stay open.');
    return;
  }

  // 2. <close_session> retry guard — only for sessions still in '__new__' state
  //    (i.e., save_onboarding never fired). If save fired earlier, session.player
  //    is now the real character and a normal close is enough.
  if (close && session.player.id === '__new__') {
    const missing = missingNewCharCloseFields(close);
    if (close.sheet?.trim()) {
      missing.push(...characterSheetProblems(close.sheet).map(problem => `sheet ${problem}`));
    }
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
  const { cleaned, leakDetected } = sanitizePlayerFacingText(stripped);
  const visible = formatMoveNames(
    rollRequest ? stripModelRollInstructions(cleaned) : cleaned,
    [session.pendingRoll?.move, session.rolls?.at(-1)?.move],
  );
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
  if (draftNote) await thread.send(draftNote);
  if (rollRequest && session.pendingRoll === rollRequest) await sendRollPrompt(thread, session);

  // Checkpoints are recovery context, so they are written after the reply is
  // visible. A close supersedes them with its own inactive checkpoint.
  if (checkpoint && !close && session.player.id !== '__new__') {
    inBackground(session, 'checkpoint', () => writeCheckpoint(session, checkpoint));
  }

  if (close) {
    await thread.send('Saving your session…');
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
    '- <sheet>: copy the exact H1/H2 structure and section order from character-sheet-template.md; use TBD for unfinished values',
    '- <state_patch>: JSON with character_name, stats (Blood/Heart/Mind/Spirit), harm: 0, corrupt: 0, xp: 0, advances, circle_ratings, circle_status, safety, gear, circle_marks, effects, playbook_state, notes. Omit bot-owned active_arc_ids and last_session.',
    '- <handoff>: full first handoff',
    '- <npc_patch>: every NPC introduced during onboarding, with the complete personality profile (core scores, voice_note, verbosity, humor_frequency, humor_style, contrast_note, calibration_note, flirtatiousness and intimacy_style; author adult starting traits; use null for inapplicable exceptions)',
    '- <relationship_patch>: JSON array of public character ties established during onboarding; use [] if none are established yet',
    '- <debt_patch>: JSON array of public Debts established during onboarding; use [] if none are established yet',
    '',
    'You may repeat your closing narrative if you want, but the priority is a complete close block. Do not skip the sheet because the character is short-lived — the data you collected during onboarding has to land in the repo.',
  ].join('\n');
}

function buildImpactRetryPrompt(problems) {
  return [
    `[SYSTEM] Your trailing <close_session> block has world-impact problems: ${problems.join('; ')}.`,
    'Re-emit the closing narrative and complete trailing <close_session> block now.',
    'Include <world_impact> containing JSON with level (none, personal, or shared), summary, affected_ids, and optional fiction_time.',
    'If level is shared, include at least one matching events_append, npc_patch, npc_memory_patch, location_patch, relationship_patch, debt_patch, arc_patch, mystery_patch, hub_patch, or interaction_ops field.',
    'Do not continue the scene.',
  ].join('\n');
}

function buildSaveRetryPrompt(missing) {
  return [
    `Your <save_onboarding> block is missing required fields: ${missing.join(', ')}.`,
    'Re-emit the block now. At minimum it needs <character_id> (kebab-case, e.g. "joe-nakama").',
    'Include whatever data you have at this point: <sheet>, <state_patch> (JSON with at least character_name and stats), <npc_patch> for any NPCs introduced.',
    'Always include <relationship_patch> and <debt_patch> as JSON arrays; use [] when an early save has not established any public ties or Debts yet.',
    'The sheet must copy the exact H1/H2 structure and section order from character-sheet-template.md. Keep every section and write TBD for unfinished values.',
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
    mystery_patch: grabTag(body, 'mystery_patch'),
    npc_memory_patch: grabTag(body, 'npc_memory_patch'),
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

function checkpointDocument(session, checkpoint, active = true, characterId = session?.player?.id) {
  return JSON.stringify({
    schema_version: 1,
    active,
    character_id: characterId,
    world_revision: session.worldRevision || 0,
    updated_at: new Date().toISOString(),
    ...checkpoint,
    thread_id: session.threadId,
    pending_roll: session.pendingRoll || null,
    pending_manual_roll: session.pendingManualRoll || null,
    pending_mechanics_clarification: session.pendingMechanicsClarification || null,
    rolls: session.rolls || [],
  }, null, 2) + '\n';
}

async function writeCheckpoint(session, checkpoint, active = true) {
  const characterId = session?.player?.id;
  if (!characterId || characterId === '__new__') return;
  await writeFile(
    `players/${characterId}/checkpoint.json`,
    checkpointDocument(session, checkpoint, active),
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
      close.mystery_patch, close.npc_memory_patch, close.hub_patch, close.interaction_ops, close.interactions_patch,
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
    creation_status: grabTag(body, 'creation_status'),
    next_step: grabTag(body, 'next_step'),
    creation_stage: grabTag(body, 'creation_stage'),
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
  'mystery_patch',
  'npc_memory_patch',
  'events_append',
  'interactions_patch',
  'interaction_ops',
  'world_impact',
  'world_event',
  'checkpoint',
  'creation_status',
  'next_step',
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
  'creation_stage',
  ...STRUCTURED_BARE_TAGS,
];

// Tags that should always be stripped when found as a balanced bare pair,
// regardless of body content. Unlike STRUCTURED_BARE_TAGS, these have NO
// legitimate narrative use — they only ever belong inside save_onboarding
// or close_session containers. Step 3's looksStructured check would miss
// them (a kebab-case slug is neither JSON-shaped nor a schema-key marker).
const ALWAYS_STRIP_BARE_TAGS = ['character_id', 'creation_stage'];

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

  working = normalizePlayerFacingStyle(working);
  return { cleaned: working.trim(), leakDetected };
}

export function normalizePlayerFacingStyle(text) {
  return String(text || '')
    .replace(/[ \t]*\u2014[ \t]*/g, ', ')
    .replace(/(^|\n),\s*/g, '$1')
    .replace(/,\s*(?=[.!?,:;])/g, '');
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
// sheet to be created). relationship_patch and debt_patch are also required so
// onboarding cannot silently persist a roster entry without making an explicit
// decision about its atlas-visible ties. Empty arrays are valid for an early
// save. state_patch is optional at save time: the player may
// be saving early with stats still TBD, and the MC can fill in stats later
// via state_patch in the session-close block.
export function missingSaveOnboardingFields(save) {
  const missing = [];
  const pid = typeof save.character_id === 'string' ? save.character_id.trim() : '';
  if (!pid || pid === '__new__') missing.push('character_id');
  if (!save.sheet || !save.sheet.trim()) missing.push('sheet');
  requireJsonArrayField(save, 'relationship_patch', missing);
  requireJsonArrayField(save, 'debt_patch', missing);
  return missing;
}

function requireJsonArrayField(block, field, problems) {
  const raw = typeof block?.[field] === 'string' ? block[field].trim() : '';
  if (!raw) {
    problems.push(field);
    return;
  }
  try {
    if (!Array.isArray(JSON.parse(raw))) problems.push(`${field} (JSON array)`);
  } catch {
    problems.push(`${field} (JSON array)`);
  }
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

const DRAFT_COMMIT_INTERVAL_MS = 10 * 60 * 1000;
const CREATION_STAGE_PATTERNS = [
  ['review', /\breview\b/],
  ['connections', /\b(?:connection|circle|debt|relationship|contact)/],
  ['abilities', /\b(?:abilit|stat|move|gear|power)/],
  ['concept', /\b(?:concept|playbook|name|look|archetype)/],
];

// Which of the four creation stages a draft is in, from the explicit
// <creation_stage> tag or, failing that, the next_step wording.
export function creationStage(save) {
  const explicit = String(save?.creation_stage || '').trim().toLowerCase();
  if (CREATION_STAGE_PATTERNS.some(([stage]) => stage === explicit)) return explicit;
  const text = String(save?.next_step || '').toLowerCase();
  return CREATION_STAGE_PATTERNS.find(([, pattern]) => pattern.test(text))?.[0] || null;
}

// Per-choice drafts are committed when they matter: the first save (so the
// character appears in /play), each stage change, readiness, or after a
// quiet interval. Everything in between lives in the runtime snapshot.
export function shouldCommitDraft(session, save, now = Date.now()) {
  if (session.player.id === '__new__' || save.creation_status === 'ready') return true;
  const stage = creationStage(save);
  if (stage && stage !== session.draftStage) return true;
  return now - (session.draftCommittedAt || 0) >= DRAFT_COMMIT_INTERVAL_MS;
}

class SaveRejected extends Error {
  constructor(problems) {
    super(problems.join('; '));
    this.problems = problems;
  }
}

function jsonDocument(value) {
  return JSON.stringify(value, null, 2) + '\n';
}

// Persist a complete draft snapshot as one commit; completion is a separate validated transition.
export async function processSaveOnboarding(thread, session, save) {
  if (persistencePayloadProblems(save).length) {
    console.error('[creation] invalid payload', persistencePayloadProblems(save));
    await thread.send('The draft needs repair before it can be saved. Use Save progress to retry.');
    return { success: false };
  }
  if (!session.rulesProfile?.isNew) {
    await thread.send('Character creation is already complete. Use Save progress for this session.');
    return { success: false };
  }
  const id = session.player.id === '__new__' ? session.draftId : session.player.id;
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id || '') || save.character_id !== id) {
    await thread.send('The draft could not be matched to this character. Use Save progress to retry.');
    return { success: false };
  }
  const stamp = new Date().toISOString().slice(0, 10);
  const publicSessionId = `${id}:session_000`;

  let parsedStatePatch = null;
  if (save.state_patch) {
    try {
      parsedStatePatch = JSON.parse(save.state_patch);
      if (!parsedStatePatch || typeof parsedStatePatch !== 'object' || Array.isArray(parsedStatePatch)) throw new Error('expected a state object');
      delete parsedStatePatch.safety;
      delete parsedStatePatch.profile_patch;
    } catch (e) {
      console.error(`[creation] state_patch: ${e.message}`);
      await thread.send('The draft could not be saved. Use Save progress to retry.');
      return { success: false };
    }
  }
  const displayName = resolveNewCharacterName(parsedStatePatch, save.sheet, id);
  const ownerId = session.player && session.player.discord_id ? String(session.player.discord_id) : null;
  const patch = (field, collection, idPrefix, extra = {}) => {
    const raw = save[field];
    if (!raw) return null;
    const patches = JSON.parse(raw);
    return patches.length ? { patches, collection, idPrefix, extra } : null;
  };

  let outcome;
  try {
    outcome = await commitBatch(`[creation] save ${id} (${stamp})`, async tx => {
      const warnings = [];
      const statePath = `players/${id}/state.json`;
      const currentState = await tx.readJSON(statePath);
      const progress = creationProgress(save, applyPatch(currentState || {}, parsedStatePatch || {}));
      // Seeded with the full schema so missing patch fields keep their
      // template defaults; the dashboard reads state.json with no fallback.
      const nextState = applyPatch(currentState || freshCharacterState(id), parsedStatePatch || {});
      if (save.sheet) tx.write(`players/${id}/sheet.md`, save.sheet.endsWith('\n') ? save.sheet : save.sheet + '\n');
      tx.write(statePath, jsonDocument(nextState));

      for (const [file, entry] of [
        ['game/npcs.json', patch('npc_patch', 'npcs', 'npc_', { allowNameMatch: true })],
        ['game/locations.json', patch('location_patch', 'locations', 'loc_', { allowNameMatch: true })],
        ['game/relationships.derived.json', patch('relationship_patch', 'relationships', 'rel_', { publicOnly: true })],
      ]) {
        if (!entry) continue;
        await tx.updateJSON(file, doc => {
          const result = mergeCanonicalPatches(doc, entry.patches, { collection: entry.collection, idPrefix: entry.idPrefix, sessionId: publicSessionId, stamp, ...entry.extra });
          warnings.push(...result.rejected.map(message => `${entry.collection}: ${message}`));
          return result.doc;
        });
      }
      const debts = save.debt_patch ? JSON.parse(save.debt_patch) : [];
      if (debts.length) {
        await tx.updateJSON('game/debts.json', doc => {
          const result = mergeDebtPatches(doc, debts, { sessionId: publicSessionId, stamp });
          warnings.push(...result.rejected.map(message => `debt_patch: ${message}`));
          return result.doc;
        });
      }
      if (save.events_append?.trim()) {
        await tx.update('game/events-log.md', current => prependPublicEvent(current, save.events_append.trim()));
      }
      await tx.updateJSON('players/index.json', current => {
        const list = Array.isArray(current) ? current : [];
        const existing = list.find(p => p.id === id);
        if (existing) {
          if (ownerId && !existing.owner_id) existing.owner_id = ownerId;
          existing.name = displayName;
          existing.creation_status = progress.status;
          existing.thread_id = thread.id;
        } else {
          const entry = { id, name: displayName, creation_status: progress.status, thread_id: thread.id };
          if (ownerId) entry.owner_id = ownerId;
          list.push(entry);
        }
        return list;
      });
      if (ownerId) {
        await tx.updateJSON(profilePath(ownerId), current => {
          if (!current) return null;
          const characters = Array.isArray(current.characters) ? current.characters : [];
          return characters.includes(id) ? null : { ...current, characters: [...characters, id] };
        });
      }
      tx.write(`players/${id}/creation.json`, jsonDocument({ schema_version: 1, ...progress, updated_at: new Date().toISOString() }));
      // All or nothing: a rejected patch leaves the previous draft untouched.
      if (warnings.length) throw new SaveRejected(warnings);
      return { progress, nextState };
    });
  } catch (err) {
    if (/required character choices/.test(err.message)) { await thread.send(err.message); return { success: false }; }
    console.error(`[creation] save failed for ${id}: ${err.message}`);
    await thread.send('Your character was not saved. This thread is still open. Use Save progress to retry.');
    return { success: false };
  }
  const { progress, nextState } = outcome.result;
  session.player = { ...session.player, id, name: displayName, creation_status: progress.status };
  session._onboardingSaved = true;
  session.rulesProfile = { isNew: progress.status === 'draft', playbook: nextState.playbook || '', wod_extension: nextState.wod_extension || '' };
  session.mechanicsSheet = save.sheet;
  session.state = nextState;
  session.pendingDraft = null;
  session.draftCommittedAt = Date.now();
  session.draftStage = creationStage(save) || session.draftStage || null;
  await renameSessionThread(thread, displayName);
  await registerArchiveThread(thread, { id, name: displayName })
    .catch(error => console.error(`[archive] character registration failed: ${error.message}`));
  if (progress.status === 'ready') await thread.send(sessionControls(session));
  await thread.send(progress.status === 'draft' ? `Draft saved. Next: ${progress.next_step}` : `${displayName} is ready. Your character is saved.`);
  return { success: true };
}

async function processSessionClose(thread, session, close) {
  const id = close.character_id || session.player.id;
  if (id === '__new__') {
    await thread.send('⚠️ Cannot write session close for a new character without a character_id in the close block. Skipping writes.');
    return { success: false };
  }
  // Let any in-flight recovery checkpoint land before the close supersedes it.
  await session._bg;
  const stamp = new Date().toISOString().slice(0, 10);
  const worldImpact = parseWorldImpact(close) || { level: 'personal', summary: 'Missing impact declaration.', affected_ids: [] };
  const baseWorldRevision = session.worldRevision || 0;
  session.closeAttempt ||= { payload: close };
  const discordId = session.player && session.player.discord_id ? String(session.player.discord_id) : null;
  const isNewCharacter = session.player.id === '__new__';

  const parseWarnings = [];
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
      parseWarnings.push(`state_patch: ${e.message}`);
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
      parseWarnings.push(`arc_patch: ${e.message}`);
    }
  }
  const parsePatch = (field, label = field) => {
    if (!close[field]) return null;
    try { return JSON.parse(close[field]); }
    catch (e) { parseWarnings.push(`${label}: ${e.message}`); return null; }
  };
  const npcPatches = parsePatch('npc_patch');
  const locationPatches = parsePatch('location_patch');
  const mysteryPatches = parsePatch('mystery_patch');
  const memoryPatches = parsePatch('npc_memory_patch');
  const relationshipPatches = parsePatch('relationship_patch');
  const debtPatches = parsePatch('debt_patch');
  const hubPatches = parsePatch('hub_patch');
  const interactionOps = parsePatch('interaction_ops');
  const emittedInteractions = interactionOps ? null : parsePatch('interactions_patch');

  const sharedTouchKeys = [
    'events_append', 'npc_patch', 'location_patch', 'relationship_patch',
    'debt_patch', 'arc_patch', 'mystery_patch', 'npc_memory_patch', 'hub_patch', 'interaction_ops', 'interactions_patch',
  ];
  const hasSharedTouches = worldImpact.level === 'shared' || sharedTouchKeys.some(key => Boolean(close[key]));
  const newName = isNewCharacter ? resolveNewCharacterName(parsedStatePatch, close.sheet, id) : null;

  let outcome;
  try {
    // Every file a close touches lands in ONE commit: the save is all or
    // nothing, and a retry after a failure cannot double-apply anything.
    outcome = await commitBatch(`[session] close ${id} (${stamp})`, async tx => {
      const warnings = [...parseWarnings];
      const conflicts = [];
      const statePath = `players/${id}/state.json`;
      await tx.prefetch([statePath, 'game/arcs.json', 'game/world-meta.json']);
      const stateBefore = await tx.readJSON(statePath) || freshCharacterState(id);
      const nextSession = nextSessionId(stateBefore.last_session);
      const logicalSessionId = `${id}:${nextSession}`;
      const merge = async (file, patches, options) => {
        if (!patches) return;
        await tx.updateJSON(file, doc => {
          const result = mergeCanonicalPatches(doc, patches, { sessionId: logicalSessionId, stamp, ...options });
          warnings.push(...result.rejected.map(message => `${options.collection}: ${message}`));
          conflicts.push(...(result.conflicts || []));
          return options.derive ? options.derive(result.doc) : result.doc;
        });
      };

      if (close.handoff) tx.write(`players/${id}/handoff.md`, close.handoff.endsWith('\n') ? close.handoff : close.handoff + '\n');
      if (close.sheet) tx.write(`players/${id}/sheet.md`, close.sheet.endsWith('\n') ? close.sheet : close.sheet + '\n');

      // Arcs are reconciled before character state because active_arc_ids is a
      // derived index. An involved arc ignored for two consecutive sessions gains
      // one pressure (escalation), while a touched arc resets its ignore counter.
      let arcs = await tx.readJSON('game/arcs.json') || { arcs: [] };
      if (arcPatches.length || deriveActiveArcIds(arcs, id).length) {
        arcs = reconcileArcs(arcs, arcPatches, { characterId: id, sessionId: logicalSessionId, stamp, conflicts });
        tx.write('game/arcs.json', jsonDocument(arcs));
      }
      const activeArcIds = deriveActiveArcIds(arcs, id);

      // Session numbering, ranges, Circle marks from recorded rolls, effects
      // containers, and arc membership are bot-owned invariants.
      const reconciled = reconcileCharacterState(stateBefore, parsedStatePatch, {
        characterId: id,
        activeArcIds,
        rolls: session.rolls || [],
      });
      warnings.push(...reconciled.warnings);
      tx.write(statePath, jsonDocument(reconciled.state));

      if (close.events_append?.trim()) {
        await tx.update('game/events-log.md', current => prependPublicEvent(current, close.events_append.trim()));
      }
      await merge('game/npcs.json', npcPatches, { collection: 'npcs', idPrefix: 'npc_', allowNameMatch: true });
      await merge('game/locations.json', locationPatches, { collection: 'locations', idPrefix: 'loc_', allowNameMatch: true });
      await merge('game/mysteries.json', mysteryPatches, { collection: 'mysteries', idPrefix: 'mystery_', derive: withDerivedMysteryState });
      if (memoryPatches) {
        const validNpcIds = new Set(((await tx.readJSON('game/npcs.json'))?.npcs || []).map(npc => npc.id));
        await tx.updateJSON('game/npc-character-memory.json', doc => {
          const result = mergeNpcCharacterMemoryPatches(doc, memoryPatches, { characterId: id, validNpcIds, sessionId: logicalSessionId, stamp });
          warnings.push(...result.rejected.map(message => `npc_memory_patch: ${message}`));
          conflicts.push(...(result.conflicts || []));
          return result.doc;
        });
      }
      await merge('game/relationships.derived.json', relationshipPatches, { collection: 'relationships', idPrefix: 'rel_', publicOnly: true });
      if (debtPatches) {
        await tx.updateJSON('game/debts.json', doc => {
          const result = mergeDebtPatches(doc, debtPatches, { sessionId: logicalSessionId, stamp });
          warnings.push(...result.rejected.map(message => `debt_patch: ${message}`));
          return result.doc;
        });
      }
      await merge('game/hub-state.json', hubPatches, { collection: 'hubs', idPrefix: 'hub_' });

      if (interactionOps || emittedInteractions || session.openingEchoId) {
        await tx.updateJSON('game/interactions.json', current => {
          if (interactionOps) {
            const withOpeningConsume = session.openingEchoId
              ? [...interactionOps, { op: 'consume', id: session.openingEchoId }]
              : interactionOps;
            const result = applyInteractionOperations(current, withOpeningConsume, { stamp, sessionId: logicalSessionId });
            warnings.push(...result.rejected.map(message => `interaction_ops: ${message}`));
            return result.doc;
          }
          const next = emittedInteractions || current || { interactions: [] };
          const list = Array.isArray(next.interactions) ? next.interactions : [];
          return {
            ...next,
            interactions: session.openingEchoId ? list.filter(item => item.id !== session.openingEchoId) : list,
          };
        });
      }

      // A brand-new character closed without an onboarding save is registered
      // here so /play can find it.
      if (isNewCharacter) {
        await tx.updateJSON('players/index.json', current => {
          const list = Array.isArray(current) ? current : [];
          const existing = list.find(p => p.id === id);
          if (existing) {
            if (discordId && !existing.owner_id) existing.owner_id = discordId;
          } else {
            list.push({ id, name: newName, ...(discordId ? { owner_id: discordId } : {}) });
          }
          return list;
        });
      }

      if (conflicts.length) {
        await tx.updateJSON('game/conflicts.json', current => {
          const list = Array.isArray(current?.conflicts) ? [...current.conflicts] : [];
          for (const conflict of conflicts) {
            const suffix = `${logicalSessionId}_${conflict.entity_id}_${conflict.fields.join('_')}`.replace(/[^a-zA-Z0-9_]+/g, '_').toLowerCase();
            const conflictId = `conflict_${suffix}`;
            if (list.some(item => item.id === conflictId && item.status === 'pending')) continue;
            list.push({
              id: conflictId,
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
        });
      }

      let resultingWorldRevision = baseWorldRevision;
      if (hasSharedTouches) {
        await tx.updateJSON('game/world-meta.json', current => {
          resultingWorldRevision = (Number.isInteger(current?.revision) ? current.revision : 0) + 1;
          return {
            ...(current || {}),
            schema_version: 1,
            revision: resultingWorldRevision,
            last_player_update: new Date().toISOString(),
            maintenance_status: 'open',
          };
        });
      }

      tx.write(`game/session-ledger/${id}-${nextSession}.json`, jsonDocument({
        schema_version: 1,
        session_id: logicalSessionId,
        character_id: id,
        closed_at: new Date().toISOString(),
        base_world_revision: baseWorldRevision,
        resulting_world_revision: resultingWorldRevision,
        world_impact: worldImpact,
        touched: sharedTouchKeys.filter(key => Boolean(close[key])),
        public_event: close.events_append || null,
        conflicts: conflicts.map(item => ({ entity_id: item.entity_id, fields: item.fields })),
        warnings: [...warnings],
      }));

      const reconciledState = reconciled.state;
      if (reconciledState?.last_session) {
        tx.write(`players/${id}/sessions/${reconciledState.last_session}.json`, jsonDocument({
          schema_version: 1,
          session_id: reconciledState.last_session,
          character_id: id,
          date: stamp,
          rolls: (session.rolls || []).map(roll => ({
            move: roll.move,
            modifier_key: roll.modifier_key,
            circle: roll.circle,
            instinct_die: roll.instinct_die,
            other_die: roll.other_die,
            modifier: roll.modifier,
            total: roll.total,
            result: roll.result,
            advanced_move: roll.advanced_move,
            extreme_failure: roll.extreme_failure,
          })),
          active_arc_ids: reconciledState.active_arc_ids || [],
          touched_arc_ids: arcPatches.map(item => item.id).filter(Boolean),
          pacing_audit: auditSession({
            messages: session.messages,
            rolls: session.rolls,
            close,
            mechanicsGateTriggers: session.mechanicsGateTriggers,
            mechanicsAdjudications: session.mechanicsAdjudications,
          }),
        }));
      }

      tx.write(`players/${id}/checkpoint.json`, checkpointDocument(session, {
        summary: 'Session closed successfully.',
        location_id: '',
        present_entity_ids: [],
        open_threads: [],
        pending_mechanics: [],
      }, false, id));

      // Player profile follow-ups: link a new character, merge broad play
      // tendencies (soft signals, no romance or safety inference), and apply
      // any optional profile_patch lifted out of state_patch above.
      let profileAfter = null;
      if (discordId) {
        const path = profilePath(discordId);
        if (isNewCharacter) {
          await tx.updateJSON(path, current => {
            if (!current) return null;
            const characters = Array.isArray(current.characters) ? current.characters : [];
            return characters.includes(id) ? null : { ...current, characters: [...characters, id] };
          });
        }
        profileAfter = await tx.updateJSON(path, current => current ? {
          ...current,
          inferred_playstyle: mergePlaystyleObservations(current.inferred_playstyle, session.playstyleBaseline, session.playstyleSignals),
        } : null);
        if (profilePatch && typeof profilePatch === 'object') {
          profileAfter = await tx.updateJSON(path, current => {
            if (!current) return null;
            const next = { ...current };
            if (profilePatch.safety && typeof profilePatch.safety === 'object') {
              next.safety = { ...current.safety };
              if (Array.isArray(profilePatch.safety.hard_limits)) next.safety.hard_limits = profilePatch.safety.hard_limits;
              if (Array.isArray(profilePatch.safety.soft_limits)) next.safety.soft_limits = profilePatch.safety.soft_limits;
            }
            if (typeof profilePatch.mechanics_depth === 'number' && profilePatch.mechanics_depth >= 1 && profilePatch.mechanics_depth <= 5) {
              next.mechanics_depth = profilePatch.mechanics_depth;
              next.mechanics_depth_set = true;
            }
            return next;
          }) || profileAfter;
        }
      }
      return { reconciledState, warnings, resultingWorldRevision, profileAfter };
    });
  } catch (err) {
    console.error(`[session-close] commit failed for ${id} (${stamp}): ${err.message}`);
    await thread.send('Your session was not fully saved. This thread is still open. Use Save & end to retry.');
    return { success: false, failures: [err.message] };
  }

  const { reconciledState, warnings, resultingWorldRevision, profileAfter } = outcome.result;
  if (warnings.length) console.error('[session-close]', { warnings });
  session.state = reconciledState;
  if (hasSharedTouches) {
    session.worldRevision = resultingWorldRevision;
    noteWorldRevision(resultingWorldRevision);
  }
  if (isNewCharacter) {
    // The thread is still titled "<username> — new character"; retitle it so
    // the reviewable record shows the character's name.
    await renameSessionThread(thread, newName);
    await registerArchiveThread(thread, { id, name: newName })
      .catch(error => console.error(`[archive] character registration failed: ${error.message}`));
  }
  await thread.send('Session saved. Use /play when you want to continue.');

  // One-shot mechanics-depth calibration prompt. The prompt itself is the
  // calibration event, so the flag is set after sending regardless of reply.
  if (discordId) {
    const profile = profileAfter || (await readProfile(discordId).catch(() => null));
    if (profile && profile.mechanics_depth_set === false) {
      try {
        await thread.send({
          content:
            `Quick calibration — how did the amount of mechanics feel this session? ` +
            `Pick a level from **1** (surface most mechanics — named moves, dice, modifiers) ` +
            `to **5** (mechanics fully hidden, pure story). ` +
            `\n\nReply with \`/prefs mechanics N\` (where N is 1–5) and that will be your default going forward.`,
        });
        await updateProfile(
          discordId,
          current => (!current || current.mechanics_depth_set) ? null : { ...current, mechanics_depth_set: true },
          `[session] mark mechanics_depth_set after calibration prompt for ${discordId} (${stamp})`
        ).catch(err => console.error(`[session] failed to mark mechanics_depth_set for ${discordId}: ${err.message}`));
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
  return { success: true, failures: [] };
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
  requireJsonArrayField(close, 'relationship_patch', missing);
  requireJsonArrayField(close, 'debt_patch', missing);
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
