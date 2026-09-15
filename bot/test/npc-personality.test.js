import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { personalityProblems } from '../handlers/npc-personality.js';
import { npcBehaviorCard, formatNpcHydrationContext, formatCanonicalWorldContext, mergeCanonicalPatches } from '../handlers/world-state.js';

const profile = {
  moral: 4, order: 3, manner: 5, violence: 4, voice_note: 'Welcomes people with few words.',
  verbosity: 1, humor_frequency: 2, humor_style: 'Gentle understatement.',
  contrast_note: 'Brief in speech, attentive in action.', calibration_note: 'Initial authored profile.',
  flirtatiousness: null, intimacy_style: null,
};
const options = { collection: 'npcs', idPrefix: 'npc_', stamp: '2026-09-14', sessionId: 'test' };
const existing = () => ({ npcs: [{ id: 'npc_test', name: 'Test', revision: 4, personality: { ...profile } }] });

test('warmth and verbosity vary independently and do not imply romantic interest', () => {
  const warm = npcBehaviorCard({ id: 'npc_warm', personality: profile });
  const cold = npcBehaviorCard({ id: 'npc_cold', personality: { ...profile, manner: 1, verbosity: 5 } });
  assert.match(warm.dialogue_register, /Warm and disarming/);
  assert.match(warm.verbosity, /Minimal words/);
  assert.match(cold.dialogue_register, /Hostile/);
  assert.match(cold.verbosity, /Expansive/);
  assert.match(warm.flirtation, /Unestablished/);
  assert.match(warm.relationship_rule, /Family.*not romantic interest/);
});

test('opening and later hydration both include humor, contrast, calibration, and boundaries', () => {
  const npc = { id: 'npc_test', personality: profile };
  for (const context of [formatCanonicalWorldContext({ npcs: [npc] }), formatNpcHydrationContext([npc])]) {
    assert.match(context, /Gentle understatement/);
    assert.match(context, /Brief in speech, attentive in action/);
    assert.match(context, /Initial authored profile/);
    assert.match(context, /No sexual portrayal of minors/);
  }
});

test('legacy profiles get conservative runtime fallbacks without mutation', () => {
  const p = { voice_note: 'Do not invent a voice.' };
  const before = structuredClone(p);
  const card = npcBehaviorCard({ id: 'npc_old', personality: p });
  assert.match(card.humor, /never force a joke/);
  assert.match(card.calibration, /Legacy fallback/);
  assert.match(card.intimacy, /Unestablished/);
  assert.deepEqual(p, before);
});

test('new NPC creation rejects incomplete profiles and accepts complete profiles', () => {
  const rejected = mergeCanonicalPatches({ npcs: [] }, [{ id: 'npc_bad', personality: { moral: 3 } }], options);
  assert.equal(rejected.doc.npcs.length, 0);
  assert.match(rejected.rejected[0], /verbosity/);
  const accepted = mergeCanonicalPatches({ npcs: [] }, [{ id: 'npc_good', personality: profile }], options);
  assert.equal(accepted.rejected.length, 0);
  assert.deepEqual(accepted.doc.npcs[0].personality, profile);
});

test('partial personality edits preserve omitted fields and input records', () => {
  const doc = existing();
  const result = mergeCanonicalPatches(doc, [{ id: 'npc_test', expected_revision: 4, changes: { personality: { humor_frequency: 4 } } }], options);
  assert.equal(result.rejected.length, 0);
  assert.equal(result.doc.npcs[0].personality.humor_frequency, 4);
  assert.equal(result.doc.npcs[0].personality.voice_note, profile.voice_note);
  assert.equal(result.doc.npcs[0].personality.flirtatiousness, null);
  assert.equal(result.doc.npcs[0].revision, 5);
  assert.equal(doc.npcs[0].personality.humor_frequency, 2);
});

test('unversioned, stale, and malformed personality updates cannot overwrite current traits', () => {
  for (const patch of [
    { id: 'npc_test', personality: { verbosity: 4 } },
    { id: 'npc_test', expected_revision: 4, changes: { personality: { humor_frequency: 9 } } },
    { id: 'npc_test', expected_revision: 4, changes: { personality: null } },
  ]) {
    const result = mergeCanonicalPatches(existing(), [patch], options);
    assert.equal(result.rejected.length, 1);
    assert.deepEqual(result.doc.npcs[0].personality, profile);
  }
  const stale = mergeCanonicalPatches(existing(), [{ id: 'npc_test', expected_revision: 3, changes: { personality: { verbosity: 4 } } }], options);
  assert.deepEqual(stale.doc.npcs[0].personality, profile);
  assert.deepEqual(stale.conflicts[0].fields, ['personality']);
  const status = mergeCanonicalPatches(existing(), [{ id: 'npc_test', expected_revision: 4, changes: { status: 'away' } }], options);
  assert.deepEqual(status.doc.npcs[0].personality, profile);
});

test('nullable intimate traits are explicit and invalid types are rejected', () => {
  assert.deepEqual(personalityProblems(profile), []);
  for (const changes of [{ flirtatiousness: undefined }, { flirtatiousness: 0 }, { intimacy_style: false }, { verbosity: 2.5 }, { humor_style: '' }]) {
    assert.ok(personalityProblems({ ...profile, ...changes }).length);
  }
});

test('canonical roster has full profiles while preserving distinctive established portrayals', async () => {
  const { npcs } = JSON.parse(await readFile(new URL('../../game/npcs.json', import.meta.url), 'utf8'));
  for (const npc of npcs) {
    assert.deepEqual(personalityProblems(npc.personality), [], npc.id);
    if (!['npc_marcus_teen', 'npc_the_collector'].includes(npc.id)) {
      assert.ok(Number.isInteger(npc.personality.flirtatiousness), npc.id);
      assert.equal(typeof npc.personality.intimacy_style, 'string', npc.id);
    }
  }
  const get = id => npcs.find(n => n.id === id).personality;
  assert.equal(get('npc_dara_shin').verbosity, 1);
  assert.equal(get('npc_sister_catherine_burke').manner, 5);
  assert.equal(get('npc_sister_catherine_burke').verbosity, 2);
  assert.match(get('npc_tommy_greer').humor_style, /Nervous/);
  assert.match(get('npc_the_collector').voice_note, /does not speak/);
  assert.equal(get('npc_marcus_teen').flirtatiousness, null);
  assert.equal(get('npc_marcus_teen').intimacy_style, null);
});
