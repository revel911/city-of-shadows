import {test} from 'node:test';
import assert from 'node:assert/strict';
import {continuityAction, handleContinuityAction, appendContinuityCorrection, formatContinuityContext, parseContinuityFixes, stripContinuityFixes} from '../handlers/continuity.js';
import {readFileSync} from 'node:fs';
import {sanitizePlayerFacingText} from '../handlers/session.js';
import {isOutOfCharacterMessage, isCharacterRecapRequest, buildSceneDirectorContext} from '../handlers/scene-director.js';

const recovery = "Let's reboot and add this in ... die not get saved. Ray's gym was burned down, some box with a demons heart inside: a clean up crew came, saved Ray but grabbed the box. I was able to get the envelope";

test('actual recovery message bypasses fiction and preserves all supplied facts', () => {
  const action = continuityAction(recovery);
  assert.equal(action.type, 'save');
  assert.match(action.text, /gym was burned down/);
  assert.match(action.text, /saved Ray but grabbed the box/);
  assert.match(action.text, /get the envelope/);
  assert.equal(continuityAction('I reboot the terminal.'), null);
});

test('plain OOC is recognized and out-of-character is not itself a character recap', () => {
  for (const message of ['This OOC for you', 'This is out of character to catch the game back up', 'OOC', '(OOC) please pause']) {
    assert.equal(isOutOfCharacterMessage(message), true, message);
    assert.equal(isCharacterRecapRequest(message), false, message);
  }
  assert.equal(isCharacterRecapRequest('OOC: remind me about my character'), true);
  assert.equal(isOutOfCharacterMessage('I tell Roz this is out of character for him.'), false);
});

test('correction survives storage, clears stale pending action, and pauses until resume', async () => {
  const session = {player: {id:'test'},messages:[],pendingRoll:{move:'Mislead'},pendingManualRoll:{rawTotal:8}};
  let doc = null;
  const save = async correction => {doc=appendContinuityCorrection(doc,correction);};
  const reply=await handleContinuityAction(session,recovery,{save,id:'message_1',recordedAt:'2026-09-14'});
  assert.match(reply,/Saved your continuity correction/);
  assert.equal(session.continuityRepair,true);
  assert.equal(session.pendingRoll,null);
  assert.equal(session.pendingManualRoll,null);
  assert.match(formatContinuityContext(JSON.parse(JSON.stringify(doc))),/saved Ray/);
  assert.match(session.messages[0].content,/not new actions or dialogue/);
  await handleContinuityAction(session,'The envelope is in my SUV.',{save,id:'message_2',recordedAt:'2026-09-14'});
  assert.equal(doc.corrections.length,2);
  const clarification=await handleContinuityAction(session,'This OOC for you',{save});
  assert.match(clarification,/scene is paused/);
  assert.equal(doc.corrections.length,2);
  await handleContinuityAction(session,'resume',{save});
  assert.equal(session.continuityRepair,false);
});

test('failed saves do not claim success or discard pending mechanics', async () => {
  const session={player:{id:'test'},messages:[],pendingRoll:{move:'test'}};
  const reply=await handleContinuityAction(session,'/correct Ray survived.',{save:async()=>{throw new Error('offline');}});
  assert.match(reply,/could not save/);
  assert.equal(session.continuityRepair,true);
  assert.equal(session.messages.length,0);
  assert.equal(session.pendingRoll.move,'test');
});

test('corrections are idempotent and ordinary questions are not stored as events', () => {
  const correction={id:'one',text:'Ray survived.',recordedAt:'today'};
  const once=appendContinuityCorrection(null,correction);
  const twice=appendContinuityCorrection(once,correction);
  assert.equal(twice.corrections.length,1);
  assert.equal(once.corrections.length,1);
  assert.equal(continuityAction('What did you save?',{active:true}).type,'question');
  assert.equal(continuityAction('My safety limits have changed',{active:true}).type,'question');
  assert.equal(continuityAction('/correct Ray survived.').type,'save');
  assert.equal(continuityAction('Correct the record: Ray survived.').type,'save');
  assert.equal(continuityAction('/correct').type,'prompt');
  assert.equal(continuityAction('/correct '+ 'x'.repeat(2001)).type,'too_long');
});

test('repair mode forces table talk even for a declarative question or preference', () => {
  const context=buildSceneDirectorContext({playerText:'My safety limits changed.',forceOoc:true});
  assert.match(context,/OUT-OF-CHARACTER PAUSE/);
  assert.doesNotMatch(context,/Current mode:/);
});

const fixReply = `(MC check: I put the hooded thing back on the dock without cause. You are right that it left.) Corrected: the dock is empty; you still hold the key.
<continuity_fix>The hooded thing on the Rocketts dock left after asking for the key; it did not return.</continuity_fix>`;

test('MC continuity fixes are parsed, bounded, and stripped from the visible reply', () => {
  assert.deepEqual(parseContinuityFixes(fixReply), ['The hooded thing on the Rocketts dock left after asking for the key; it did not return.']);
  assert.doesNotMatch(stripContinuityFixes(fixReply), /continuity_fix|did not return/);
  assert.match(stripContinuityFixes(fixReply), /^\(MC check:/);
  assert.deepEqual(parseContinuityFixes('<continuity_fix>  </continuity_fix>'), []);
  assert.equal(parseContinuityFixes(`<continuity_fix>${'x'.repeat(2500)}</continuity_fix>`)[0].length, 2000);
  assert.equal(sanitizePlayerFacingText('Fine.\n<continuity_fix>half').cleaned.trim(), 'Fine.');
});

test('OOC pause admits unsupported past details instead of defending them', () => {
  const context=buildSceneDirectorContext({playerText:'OOC: who was that thing on the dock?'});
  assert.match(context,/MC check:/);
  assert.match(context,/cannot point to where/i);
  assert.match(context,/never invent a justification/i);
  assert.match(context,/player'?s account/i);
});

test('MC instructions carry the continuity check rule', () => {
  const doc=readFileSync(new URL('../../mc-reference/mc-instructions.md',import.meta.url),'utf8');
  assert.match(doc,/## Continuity Check/);
  for (const rule of [/MC check:/,/<continuity_fix>/,/<scene_entities>/,/Entities in play/]) assert.match(doc,rule);
});
