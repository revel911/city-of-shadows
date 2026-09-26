import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

// Live-session state lives on the bot's private volume, not in the public
// world repository. It lets a restart or deploy resume a thread exactly —
// transcript, pending roll, clarification, and draft — without a Git commit
// per turn. Disabled unless RUNTIME_DIR is set (tests and local dev).
const SNAPSHOT_VERSION = 1;

function directory(env = process.env) {
  return env.RUNTIME_DIR ? resolve(env.RUNTIME_DIR, 'sessions') : null;
}

function snapshotPath(dir, threadId) {
  return join(dir, `${String(threadId).replace(/[^0-9A-Za-z_-]/g, '_')}.json`);
}

const PERSISTED_FIELDS = [
  'player', 'draftId', 'threadId', 'messages', 'startedAt', 'rolls',
  'pendingRoll', 'pendingManualRoll', 'pendingMechanicsClarification', 'rollPromptMessageId',
  'mechanicsGateTriggers', 'mechanicsAdjudications', 'turnsWithoutRoll',
  'profileReady', 'mechanicsDepth', 'mechanicsSheet', 'rulesProfile', 'openingEchoId',
  'worldRevision', 'playstyleBaseline', 'playstyleSignals', 'lastPlayerText',
  'continuityRepair', 'continuityCorrections', 'closeAttempt', 'state', 'pendingDraft',
  'draftCommittedAt', 'draftStage',
  '_saveRetries', '_saveLeakRetries', '_closeRetries', '_impactRetries', '_lastTurnSaveLeak', '_onboardingSaved',
];

export function serializeSession(session) {
  const out = { schema_version: SNAPSHOT_VERSION, saved_at: new Date().toISOString() };
  for (const field of PERSISTED_FIELDS) if (session[field] !== undefined) out[field] = session[field];
  out.hydratedNpcIds = [...(session.hydratedNpcIds || [])];
  return out;
}

export function deserializeSession(snapshot) {
  if (!snapshot || snapshot.schema_version !== SNAPSHOT_VERSION || !snapshot.player || !Array.isArray(snapshot.messages)) return null;
  const { schema_version, saved_at, hydratedNpcIds, ...fields } = snapshot;
  return {
    ...fields,
    rolls: Array.isArray(fields.rolls) ? fields.rolls : [],
    hydratedNpcIds: new Set(Array.isArray(hydratedNpcIds) ? hydratedNpcIds : []),
    npcCatalog: null,
    npcMemoryCatalog: null,
  };
}

export async function saveSessionSnapshot(session, env = process.env) {
  const dir = directory(env);
  if (!dir || !session?.threadId) return false;
  await mkdir(dir, { recursive: true });
  const target = snapshotPath(dir, session.threadId);
  const temp = `${target}.${process.pid}.tmp`;
  await writeFile(temp, JSON.stringify(serializeSession(session)));
  await rename(temp, target);
  return true;
}

export async function loadSessionSnapshot(threadId, env = process.env) {
  const dir = directory(env);
  if (!dir || !threadId) return null;
  try {
    return deserializeSession(JSON.parse(await readFile(snapshotPath(dir, threadId), 'utf8')));
  } catch (error) {
    if (error.code !== 'ENOENT') console.error(`[runtime] snapshot for ${threadId} unreadable: ${error.message}`);
    return null;
  }
}

export async function removeSessionSnapshot(threadId, env = process.env) {
  const dir = directory(env);
  if (!dir || !threadId) return;
  await rm(snapshotPath(dir, threadId), { force: true });
}
