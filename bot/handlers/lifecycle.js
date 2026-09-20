// Lifecycle requests are table controls, never fictional character actions.
export function lifecycleIntent(text) {
  const value = String(text || '').trim().replace(/[.!]+$/, '').toLowerCase();
  if (/^(?:\/end|save\s*(?:&|and)\s*end|end (?:the )?session|(?:i'm |i am )?done for (?:tonight|today)|let'?s stop here|stop for (?:tonight|today)|finish later)$/.test(value)) return 'end';
  if (/^(?:\/save|save|save (?:my )?(?:character|progress|draft)|retry sav(?:e|ing))$/.test(value)) return 'save';
  return null;
}

export function creationProgress(save, state = {}) {
  const status = save.creation_status === 'ready' ? 'ready' : 'draft';
  const nextStep = String(save.next_step || 'Continue character creation').trim().slice(0, 240);
  if (status === 'ready') {
    const stats = state.stats || {};
    if (!state.character_name || !state.playbook ||
        !['Blood', 'Heart', 'Mind', 'Spirit'].every(key => Number.isInteger(stats[key]) && stats[key] >= -2 && stats[key] <= 3) ||
        /\bTBD\b/i.test(save.sheet || '')) {
      throw new Error('Finish the required character choices before starting play.');
    }
  }
  return { status, next_step: status === 'ready' ? '' : nextStep };
}

export function lifecyclePrompt(intent, session) {
  return [
    '[SYSTEM — PLAYER LIFECYCLE REQUEST]',
    `The player explicitly requested ${intent === 'end' ? 'save and end' : 'save progress'}. This is not an in-fiction action.`,
    'Do not advance time, invent events, resolve pending actions, ask for a roll, or ask the player to summarize the session. Do not claim saving succeeded; the bot supplies the receipt.',
    session.rulesProfile?.isNew
      ? 'Emit a complete <save_onboarding> with the current sheet and confirmed choices, creation_status draft, and next_step. Keep unfinished sections TBD. Do not mark ready or open a scene.'
      : intent === 'save'
        ? 'Emit a <checkpoint> JSON block with summary, location_id, present_entity_ids, open_threads, and pending_mechanics. Record only established public-safe fiction, including discoveries, consequences, and outstanding decisions. This is recovery context, not a canonical session close.'
        : 'Emit a complete trailing <close_session> with character_id, handoff, world_impact, and all outstanding state/world changes. Summarize the actual stop point and unresolved decisions yourself.',
    `Use character_id ${session.player.id === '__new__' ? session.draftId : session.player.id}.`,
    session.pendingRoll ? `Preserve this unresolved roll without resolving it: ${JSON.stringify(session.pendingRoll)}. Manual subtotal awaiting Instinct: ${JSON.stringify(session.pendingManualRoll || null)}.` : '',
  ].filter(Boolean).join('\n');
}

export function creationTurnContext(session) {
  return [
    '[SYSTEM — CHARACTER CREATION PROGRESS]',
    `Permanent character_id: ${session.player.id === '__new__' ? session.draftId : session.player.id}. Use exactly this ID in every save; never ask the player to approve it.`,
    'For each confirmed creation choice, emit <save_onboarding> FIRST with the full current canonical sheet, state_patch of confirmed choices, relationship_patch and debt_patch arrays, creation_status (draft or ready), and next_step (one short question or remaining choice). Preserve earlier answers. Never serialize player safety settings into character files.',
    'Keep creation_status draft until the player explicitly chooses to start play after reviewing the character and all required choices are filled. Saving a draft does not finish creation. Do not claim saved; the bot supplies the receipt.',
    'Show only one of four stages: Concept, Abilities, Connections, Review. Ask one useful question, offer at most three relevant options plus access to the full list. Accept multiple answers and edits; invalidate dependent choices when needed. OOC questions never advance creation.',
  ].join('\n');
}


// A retry in this live session repeats only writes that failed. This prevents
// duplicate session increments, automatic corruption, events, and arc pressure.
export function retryableCloseWrites(attempt, io) {
  attempt.completed ||= new Map();
  attempt.documents ||= new Map();
  async function once(path, operation) {
    if (attempt.completed.has(path)) return attempt.completed.get(path);
    const result = await operation();
    attempt.completed.set(path, result);
    return result;
  }
  const writeFile = (path, content, message) => once(path, async () => {
    const result = await io.writeFile(path, content, message);
    attempt.documents.set(path, content);
    return result;
  });
  const updateFile = (path, transform, message) => once(path, async () => {
    let next;
    const result = await io.updateFile(path, async current => {
      next = await transform(current);
      return next;
    }, message);
    attempt.documents.set(path, next);
    return result;
  });
  const updateJSON = (path, transform, message) => updateFile(path, async text =>
    JSON.stringify(await transform(text ? JSON.parse(text) : null), null, 2) + '\n', message);
  return { writeFile, updateFile, updateJSON, document: path => attempt.documents.get(path) };
}


export function persistencePayloadProblems(payload) {
  const problems = [];
  const arrayFields = ['npc_patch', 'location_patch', 'relationship_patch', 'debt_patch', 'arc_patch', 'mystery_patch', 'npc_memory_patch', 'hub_patch', 'interaction_ops'];
  for (const key of ['state_patch', 'world_impact', 'interactions_patch', ...arrayFields]) {
    if (!payload[key]) continue;
    try {
      const value = JSON.parse(payload[key]);
      if (arrayFields.includes(key) ? !Array.isArray(value) : !value || typeof value !== 'object' || Array.isArray(value)) {
        problems.push(`${key} has the wrong JSON type`);
      }
    } catch { problems.push(`${key} is not valid JSON`); }
  }
  return problems;
}
