# Strip Structured Blocks From Discord — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent leaked structured data (save/close blocks, bare patches, sheet fragments) from reaching player-facing Discord threads, and tighten the MC output contract so the underlying truncation failure becomes recoverable.

**Architecture:** Add a defensive `sanitizePlayerFacingText` helper in `bot/handlers/session.js` that runs after the existing strip passes and before posting to Discord. It removes unterminated save/close blocks, bare structured tags whose bodies look like JSON, and orphaned open/close tags. On detection, set a per-session leak flag that injects a re-emit nudge into the next MC turn, capped by the existing `SAVE_ONBOARDING_MAX_RETRIES`. Update the MC reference docs to require `<save_onboarding>` to be the first content of the response (so truncation falls on recoverable narrative) and add a length/self-check subsection.

**Tech Stack:** Node 20+ (ES modules), `node:test` runner, `node:assert/strict`. Tests live in `bot/test/*.test.js` and are run via `npm test`. No mocking framework.

**Spec reference:** [`docs/superpowers/specs/2026-05-16-strip-structured-blocks-from-discord-design.md`](../specs/2026-05-16-strip-structured-blocks-from-discord-design.md)

---

## Task 1: Scaffold failing unit tests for `sanitizePlayerFacingText`

Write all the unit-test cases up front so each subsequent implementation step has a target. This is intentionally one test file with many cases — they exercise the same public function.

**Files:**
- Create: `bot/test/sanitize-player-facing-text.test.js`

- [ ] **Step 1: Create the test file with all cases (initially failing)**

Path: `bot/test/sanitize-player-facing-text.test.js`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizePlayerFacingText } from '../handlers/session.js';

test('returns unchanged on pure narrative with no tags', () => {
  const input = 'Rain on Maymont Road. Jacob stands outside the gym.';
  const { cleaned, leakDetected } = sanitizePlayerFacingText(input);
  assert.equal(cleaned, input);
  assert.equal(leakDetected, false);
});

test('returns unchanged when no structured leftovers remain after upstream strip', () => {
  const input = 'opener prose\nphase 13 narrative continues';
  const { cleaned, leakDetected } = sanitizePlayerFacingText(input);
  assert.equal(cleaned, input);
  assert.equal(leakDetected, false);
});

test('strips unterminated <save_onboarding> from open tag to end of string', () => {
  const input = [
    'Some opener prose.',
    '',
    '<save_onboarding>',
    '<character_id>jacob-brooks</character_id>',
    '<sheet>',
    '... long sheet content ...',
    '</sheet>',
    '<state_patch>',
    '{ "character_name": "Jacob Brooks" }',
    '</state_patch>',
    '<npc_patch>',
    '[{ "id": "npc_darius_webb"',
  ].join('\n');
  const { cleaned, leakDetected } = sanitizePlayerFacingText(input);
  assert.equal(cleaned, 'Some opener prose.');
  assert.equal(leakDetected, true);
});

test('strips unterminated <close_session> from open tag to end of string', () => {
  const input = 'Final narrative.\n\n<close_session>\n<character_id>x</character_id>\n<handoff>partial';
  const { cleaned, leakDetected } = sanitizePlayerFacingText(input);
  assert.equal(cleaned, 'Final narrative.');
  assert.equal(leakDetected, true);
});

test('strips bare <state_patch> with JSON body floating in prose', () => {
  const input = 'before\n<state_patch>{ "character_name": "X" }</state_patch>\nafter';
  const { cleaned, leakDetected } = sanitizePlayerFacingText(input);
  assert.equal(cleaned, 'before\n\nafter');
  assert.equal(leakDetected, true);
});

test('strips bare <npc_patch> with array body floating in prose', () => {
  const input = 'before\n<npc_patch>[{ "id": "npc_x", "name": "X" }]</npc_patch>\nafter';
  const { cleaned, leakDetected } = sanitizePlayerFacingText(input);
  assert.equal(cleaned, 'before\n\nafter');
  assert.equal(leakDetected, true);
});

test('strips bare <sheet> with known-schema-key body floating in prose', () => {
  const input = 'before\n<sheet>"character_name": "X"\nstats: ...</sheet>\nafter';
  const { cleaned, leakDetected } = sanitizePlayerFacingText(input);
  assert.equal(cleaned, 'before\n\nafter');
  assert.equal(leakDetected, true);
});

test('preserves literal <sheet> with non-JSON in-fiction body', () => {
  const input = 'Marcus glanced at the <sheet>blank paper on the table</sheet>, said nothing.';
  const { cleaned, leakDetected } = sanitizePlayerFacingText(input);
  assert.equal(cleaned, input);
  assert.equal(leakDetected, false);
});

test('strips orphan </sheet> closing tag with no opener', () => {
  const input = 'narrative continues</sheet>\nmore narrative';
  const { cleaned, leakDetected } = sanitizePlayerFacingText(input);
  assert.equal(cleaned, 'narrative continues\nmore narrative');
  assert.equal(leakDetected, true);
});

test('strips orphan <character_id> open tag with no closer', () => {
  const input = 'narrative <character_id>somewhere and then more text';
  const { cleaned, leakDetected } = sanitizePlayerFacingText(input);
  assert.equal(cleaned, 'narrative somewhere and then more text');
  assert.equal(leakDetected, true);
});

test('reproduces the failure pattern from the Jacob Brooks incident', () => {
  // The real-world leak: orphan </sheet>, then a complete <state_patch>{json}</state_patch>,
  // then a <npc_patch> that was truncated mid-NPC (no closing </npc_patch>).
  const input = [
    '</sheet>',
    '',
    '<state_patch>',
    '{ "character_name": "Jacob Brooks", "harm": 0 }',
    '</state_patch>',
    '',
    '<npc_patch>',
    '[{ "id": "npc_darius_webb", "name": "Darius Webb"',
  ].join('\n');
  const { cleaned, leakDetected } = sanitizePlayerFacingText(input);
  // All three structured fragments removed; only whitespace remains, which is trimmed.
  assert.equal(cleaned, '');
  assert.equal(leakDetected, true);
});
```

- [ ] **Step 2: Run the tests to verify all fail with "sanitizePlayerFacingText is not a function"**

Run from `bot/` directory:

```
npm test -- --test-name-pattern="sanitize"
```

Expected: every test in this file fails with `SyntaxError: The requested module '../handlers/session.js' does not provide an export named 'sanitizePlayerFacingText'` (or similar). That's the failing baseline.

- [ ] **Step 3: Commit the failing test scaffolding**

```
git add bot/test/sanitize-player-facing-text.test.js
git commit -m "test(bot): scaffold failing tests for sanitizePlayerFacingText"
```

---

## Task 2: Implement step 1 — strip unterminated `<save_onboarding>`

**Files:**
- Modify: `bot/handlers/session.js` — add new export `sanitizePlayerFacingText` near the existing `stripSaveOnboardingBlock` helper (around line 285).

- [ ] **Step 1: Add the function skeleton with step 1 logic**

Insert this block in `bot/handlers/session.js`, immediately after the `stripSaveOnboardingBlock` function (which ends around line 287):

```js
// List of structured-data tags that should never appear in player-facing text
// outside their container blocks (save_onboarding / close_session). Defined at
// module scope so callers and tests share the same source of truth.
const STRUCTURED_BARE_TAGS = [
  'state_patch',
  'npc_patch',
  'sheet',
  'handoff',
  'arc_patch',
  'events_append',
  'interactions_patch',
  'world_event',
];

// Step-4 orphan cleanup considers container tags too — bare opens/closes of
// save_onboarding or close_session (no matching pair) are also leaks.
const ORPHAN_TAGS = [
  'save_onboarding',
  'close_session',
  'character_id',
  ...STRUCTURED_BARE_TAGS,
];

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
  if (typeof text !== 'string') return { cleaned: '', leakDetected: false };
  let working = text;
  let leakDetected = false;

  // Step 1: unterminated <save_onboarding>. Negative lookahead asserts there
  // is no </save_onboarding> later in the string, meaning the opening tag is
  // orphaned. Strip from the open tag to end of string.
  const unterminatedSave = /<save_onboarding>(?![\s\S]*<\/save_onboarding>)[\s\S]*$/;
  if (unterminatedSave.test(working)) {
    working = working.replace(unterminatedSave, '');
    leakDetected = true;
  }

  return { cleaned: working.trim(), leakDetected };
}
```

- [ ] **Step 2: Run the sanitize tests to confirm step-1-related tests pass**

Run from `bot/`:

```
npm test -- --test-name-pattern="sanitize"
```

Expected: the following two tests now pass:
- `returns unchanged on pure narrative with no tags`
- `strips unterminated <save_onboarding> from open tag to end of string`

The other tests still fail because steps 2-4 are not implemented yet. That's fine — we are building up incrementally.

- [ ] **Step 3: Commit**

```
git add bot/handlers/session.js
git commit -m "feat(bot): sanitizePlayerFacingText strips unterminated save_onboarding"
```

---

## Task 3: Implement step 2 — strip unterminated `<close_session>`

**Files:**
- Modify: `bot/handlers/session.js` — extend `sanitizePlayerFacingText`.

- [ ] **Step 1: Add step 2 logic just below step 1 inside `sanitizePlayerFacingText`**

Add this block immediately after the step-1 unterminatedSave handling:

```js
  // Step 2: unterminated <close_session>. Same shape — open tag present with
  // no matching close anywhere later. Strip from open tag to end of string.
  const unterminatedClose = /<close_session>(?![\s\S]*<\/close_session>)[\s\S]*$/;
  if (unterminatedClose.test(working)) {
    working = working.replace(unterminatedClose, '');
    leakDetected = true;
  }
```

- [ ] **Step 2: Run sanitize tests to confirm step-2 test passes**

```
npm test -- --test-name-pattern="sanitize"
```

Expected: `strips unterminated <close_session> from open tag to end of string` now passes in addition to the previous tests.

- [ ] **Step 3: Commit**

```
git add bot/handlers/session.js
git commit -m "feat(bot): sanitizePlayerFacingText strips unterminated close_session"
```

---

## Task 4: Implement step 3 — bare structured tags with JSON-shaped bodies

**Files:**
- Modify: `bot/handlers/session.js` — extend `sanitizePlayerFacingText`.

- [ ] **Step 1: Add step 3 logic below step 2 inside `sanitizePlayerFacingText`**

Add this block immediately after the step-2 handling:

```js
  // Step 3: bare structured tags floating outside any container. By this
  // point, all *valid* save/close blocks were already removed upstream by
  // stripSaveOnboardingBlock / stripCloseBlock. Anything still matching a
  // <TAG>...</TAG> pair from STRUCTURED_BARE_TAGS is therefore floating —
  // but we only strip if the body looks structured (JSON-shaped or contains
  // a known schema key marker), to avoid false-positives on legitimate
  // narrative prose that happens to use one of these words in angle brackets.
  const STRUCTURED_KEY_MARKERS = [
    '"id":',
    '"character_name":',
    '"stats":',
    '"personality":',
    '"faction":',
  ];
  const looksStructured = (body) => {
    const trimmed = body.trim();
    if (trimmed.length === 0) return false;
    const first = trimmed[0];
    if (first === '{' || first === '[') return true;
    return STRUCTURED_KEY_MARKERS.some((k) => trimmed.includes(k));
  };
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
```

- [ ] **Step 2: Run sanitize tests to confirm step-3 tests pass**

```
npm test -- --test-name-pattern="sanitize"
```

Expected: the following tests now pass:
- `strips bare <state_patch> with JSON body floating in prose`
- `strips bare <npc_patch> with array body floating in prose`
- `strips bare <sheet> with known-schema-key body floating in prose`
- `preserves literal <sheet> with non-JSON in-fiction body`

Orphan-tag tests still fail (those need step 4).

- [ ] **Step 3: Commit**

```
git add bot/handlers/session.js
git commit -m "feat(bot): sanitizePlayerFacingText strips bare structured tags with JSON bodies"
```

---

## Task 5: Implement step 4 — orphan-tag cleanup

**Files:**
- Modify: `bot/handlers/session.js` — extend `sanitizePlayerFacingText`.

- [ ] **Step 1: Add step 4 logic below step 3 inside `sanitizePlayerFacingText`**

Add this block immediately after the step-3 loop. Note the four-sub-case structure — "standalone" in the spec means "without a matching counterpart," not "any occurrence." A naive unconditional strip would (a) destroy balanced non-structured pairs that step 3 intentionally preserved (e.g., `<sheet>blank paper</sheet>` in in-fiction prose), and (b) leave the JSON payload after a truncated `<npc_patch>` open with no closer:

```js
  // Step 4: orphan-tag cleanup. By this point, every valid <TAG>...</TAG>
  // pair from STRUCTURED_BARE_TAGS with a structured body has been removed,
  // and unterminated containers (save_onboarding, close_session) have been
  // stripped to end-of-string by steps 1-2. Any remaining standalone <TAG>
  // or </TAG> for a tag in ORPHAN_TAGS is by definition orphaned. Three
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
    // Sub-case (d): balanced pair — no action; step 3 already decided it.
  }
```

- [ ] **Step 2: Run the full sanitize test suite**

```
npm test -- --test-name-pattern="sanitize"
```

Expected: every test in `sanitize-player-facing-text.test.js` passes, including:
- `strips orphan </sheet> closing tag with no opener`
- `strips orphan <character_id> open tag with no closer`
- `reproduces the failure pattern from the Jacob Brooks incident`

- [ ] **Step 3: Run the whole bot test suite to confirm nothing else regressed**

```
npm test
```

Expected: all existing tests still pass; the new sanitize file is all green.

- [ ] **Step 4: Commit**

```
git add bot/handlers/session.js
git commit -m "feat(bot): sanitizePlayerFacingText cleans up orphan structured tags"
```

---

## Task 6: Wire `sanitizePlayerFacingText` into `postMCResponse`

The sanitizer is now defined and tested in isolation. Hook it into the one place where MC narrative is posted to a Discord thread — the chunk-send loop in `postMCResponse` ([`bot/handlers/session.js:201-204`](../../../bot/handlers/session.js#L201-L204)).

**Files:**
- Modify: `bot/handlers/session.js:201-204` — wire in the sanitizer.

- [ ] **Step 1: Replace the chunk-send block**

Find the current block (around line 201):

```js
  const visible = close ? stripCloseBlock(response) : response;
  for (const part of chunk(visible)) {
    if (part.trim()) await thread.send(part);
  }
```

Replace it with:

```js
  const stripped = close ? stripCloseBlock(response) : response;
  const { cleaned: visible, leakDetected } = sanitizePlayerFacingText(stripped);
  if (leakDetected) {
    session._lastTurnSaveLeak = true;
    console.warn(
      `[session ${session.threadId}] sanitize stripped structured leak from MC output`
    );
  }
  for (const part of chunk(visible)) {
    if (part.trim()) await thread.send(part);
  }
```

- [ ] **Step 2: Run the full test suite to confirm no regressions**

```
npm test
```

Expected: all existing tests still pass. The new sanitize tests pass. Integration tests for the leak-recovery flow (Task 7) do not yet exist.

- [ ] **Step 3: Commit**

```
git add bot/handlers/session.js
git commit -m "feat(bot): sanitize MC output before posting to Discord"
```

---

## Task 7: Add integration tests and implement next-turn leak-recovery nudge

When `session._lastTurnSaveLeak` is set, the next MC turn must receive a re-emit nudge as part of the prompt, so the MC knows the previous structured payload did not persist. The flag clears when a clean turn fires (no leak detected and either a successful `processSaveOnboarding` ran or no save was attempted).

**Files:**
- Create: `bot/test/save-onboarding-leak-recovery.test.js`
- Modify: `bot/handlers/session.js` — add `buildSaveLeakNudge`, increment-and-clear logic in `handleMessage` (and `startSession` if needed).

- [ ] **Step 1: Write the failing integration tests**

Create `bot/test/save-onboarding-leak-recovery.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSaveLeakNudge, SAVE_ONBOARDING_MAX_RETRIES } from '../handlers/session.js';

test('buildSaveLeakNudge mentions unterminated block and asks for first-content re-emit', () => {
  const nudge = buildSaveLeakNudge(1);
  assert.match(nudge, /unterminated/i);
  assert.match(nudge, /<save_onboarding>/);
  assert.match(nudge, /first content/i);
  assert.match(nudge, /Retry 1 of/);
});

test('buildSaveLeakNudge includes the retry counter against the shared cap', () => {
  const nudge = buildSaveLeakNudge(2);
  assert.match(nudge, new RegExp(`Retry 2 of ${SAVE_ONBOARDING_MAX_RETRIES}`));
});
```

- [ ] **Step 2: Run the test file to confirm it fails on the missing export**

```
npm test -- --test-name-pattern="buildSaveLeakNudge"
```

Expected: tests fail with `does not provide an export named 'buildSaveLeakNudge'` (and/or `SAVE_ONBOARDING_MAX_RETRIES`).

- [ ] **Step 3: Implement `buildSaveLeakNudge` and export the cap**

In `bot/handlers/session.js`, change the existing line:

```js
const SAVE_ONBOARDING_MAX_RETRIES = 2;
```

to:

```js
export const SAVE_ONBOARDING_MAX_RETRIES = 2;
```

Then, immediately after the existing `buildSaveRetryPrompt` function (which is defined for the missing-fields path), add:

```js
// Nudge prepended to the next MC turn after a leak was detected and stripped.
// Reuses the SAVE_ONBOARDING_MAX_RETRIES cap so leak retries and missing-fields
// retries share the same exhaustion budget shape (separate counters though —
// see _saveLeakRetries below).
export function buildSaveLeakNudge(retryNumber) {
  return [
    `[SYSTEM] Your previous response contained an unterminated <save_onboarding> (or <close_session>) block, or bare structured tags outside any container.`,
    `The bot stripped that content before posting, and the persistence did not occur.`,
    ``,
    `Re-emit a complete <save_onboarding> block as the FIRST content of your next response, before any narrative. Confirm the closing </save_onboarding> tag is present.`,
    `Retry ${retryNumber} of ${SAVE_ONBOARDING_MAX_RETRIES}.`,
  ].join('\n');
}
```

- [ ] **Step 4: Run the nudge tests to confirm they pass**

```
npm test -- --test-name-pattern="buildSaveLeakNudge"
```

Expected: both tests pass.

- [ ] **Step 5: Wire the nudge into `handleMessage`**

In `handleMessage` (around lines 49-50), change:

```js
  await lock(session, async () => {
    session.messages.push({ role: 'user', content: message.content });
    await message.channel.sendTyping();
    const response = await generate(session);
    session.messages.push({ role: 'assistant', content: response });
    await postMCResponse(message.channel, response, session);
  });
```

to:

```js
  await lock(session, async () => {
    let userContent = message.content;
    if (session._lastTurnSaveLeak) {
      const retries = (session._saveLeakRetries || 0) + 1;
      session._saveLeakRetries = retries;
      session._lastTurnSaveLeak = false;
      if (retries <= SAVE_ONBOARDING_MAX_RETRIES) {
        userContent = `${buildSaveLeakNudge(retries)}\n\n[PLAYER MESSAGE]\n${message.content}`;
      } else {
        await message.channel.send(
          `⚠ <save_onboarding> still leaking after ${SAVE_ONBOARDING_MAX_RETRIES} retries. ` +
          `The close block will need to carry the save data.`
        );
        console.error(`[save-onboarding] leak retries exhausted for session ${session.threadId}`);
      }
    }
    session.messages.push({ role: 'user', content: userContent });
    await message.channel.sendTyping();
    const response = await generate(session);
    session.messages.push({ role: 'assistant', content: response });
    await postMCResponse(message.channel, response, session);
  });
```

- [ ] **Step 6: Clear the leak-retry counter on a clean save**

In `postMCResponse`, find the successful save branch (around line 164-168):

```js
    } else {
      await thread.send('— *saving character to GitHub…* —');
      await processSaveOnboarding(thread, session, save);
      response = stripSaveOnboardingBlock(response);
    }
```

Change it to:

```js
    } else {
      await thread.send('— *saving character to GitHub…* —');
      await processSaveOnboarding(thread, session, save);
      response = stripSaveOnboardingBlock(response);
      // Clean save fired — reset the leak retry counter so a future,
      // unrelated leak gets the full SAVE_ONBOARDING_MAX_RETRIES budget.
      session._saveLeakRetries = 0;
    }
```

- [ ] **Step 7: Add an integration test that exercises the nudge flow end-to-end**

Append to `bot/test/save-onboarding-leak-recovery.test.js`:

```js
import { sanitizePlayerFacingText } from '../handlers/session.js';

test('sanitizer-then-nudge: a leaked turn produces leakDetected=true so the next-turn nudge fires', () => {
  // This isn't a full handler integration (handleMessage requires a Discord
  // message object), but it pins down the contract: sanitize must signal a
  // leak when the MC produces an unterminated save block, and the nudge
  // builder must produce text the MC can act on.
  const leakedTurn = [
    'opener prose',
    '<save_onboarding>',
    '<character_id>jacob-brooks</character_id>',
    '<sheet>incomplete...',
  ].join('\n');
  const { cleaned, leakDetected } = sanitizePlayerFacingText(leakedTurn);
  assert.equal(cleaned, 'opener prose');
  assert.equal(leakDetected, true);

  // The nudge for retry 1 should reference the failure mode and the cap.
  const nudge = buildSaveLeakNudge(1);
  assert.match(nudge, /unterminated/i);
  assert.match(nudge, /first content/i);
});
```

- [ ] **Step 8: Run the full test suite**

```
npm test
```

Expected: all tests pass, including the new leak-recovery file.

- [ ] **Step 9: Commit**

```
git add bot/handlers/session.js bot/test/save-onboarding-leak-recovery.test.js
git commit -m "feat(bot): next-turn nudge when MC output leaks structured data"
```

---

## Task 8: Update the MC contract docs

Replace the "anywhere in your message" guidance with a first-content requirement, add a length/self-check subsection, and add a parallel position note in `mc-instructions.md`.

**Files:**
- Modify: `mc-reference/bot-output-format.md` — two edits + one new subsection.
- Modify: `mc-reference/mc-instructions.md` — add a `position` line to the `save_before_play` YAML block.

- [ ] **Step 1: Edit `mc-reference/bot-output-format.md` — replace the "anywhere in your message" sentence**

Find this line (currently around line 57):

```
The block may appear **anywhere in your message**, not just at the end. The bot strips it and posts the remaining narrative to the thread.
```

Replace it with:

```
The `<save_onboarding>` block MUST be the **first content** in your response, before any narrative. The bot extracts it and posts the trailing narrative to the thread. Putting the save block first protects the structured save from being truncated when your response is long — only the narrative tail can be lost to a length cap, and the narrative can be recreated on the next turn while a partial save cannot.
```

- [ ] **Step 2: Edit `mc-reference/bot-output-format.md` — add the position rule bullet**

Find the `### Save field rules` section (currently around line 83). It begins with a list of bullets starting `- **`<character_id>`** — required. ...`. Add this new bullet at the **top** of the list (before the existing `<character_id>` bullet):

```
- **Position** — emit this block as the very first content of your response. Open with `<save_onboarding>`, close with `</save_onboarding>`, then write your scene narrative. Do not interleave.
```

- [ ] **Step 3: Edit `mc-reference/bot-output-format.md` — add the Length & self-check subsection**

Locate the `### When not to emit save_onboarding` heading. Immediately **before** it, insert this new subsection:

```
### Length & self-check

A complete `<save_onboarding>` for a fresh character typically runs 800–1500 characters. If your sheet has grown longer (lots of gear, long notes), keep an eye on total response length: opening a scene with rich narrative *after* the save block can push your full reply past the model's output cap and truncate the trailing narrative — that's the safe failure. If the save block itself is truncated, the character does not persist.

Before sending, verify three things:
1. The response opens with `<save_onboarding>`.
2. A matching `</save_onboarding>` appears before your scene narrative begins.
3. Every nested tag inside the block (`<character_id>`, `<sheet>`, `<state_patch>`, `<npc_patch>`) has a matching closing tag.

If you find yourself wanting to write a very long opening scene on the same turn as a save, prefer to keep the scene short — the next player turn will give you space to expand.

```

- [ ] **Step 4: Edit `mc-reference/mc-instructions.md` — add a `position` line to `save_before_play`**

Find the `save_before_play:` block in `mc-reference/mc-instructions.md` (currently around line 535). The existing keys are `requirement`, `block`, `when`, `required_fields`, `encouraged_fields`. Add a new `position` key immediately after `block:`:

Locate this snippet (around lines 535-538):

```yaml
  save_before_play:
    requirement: REQUIRED
    block: <save_onboarding>
    when: >
```

Change it to:

```yaml
  save_before_play:
    requirement: REQUIRED
    block: <save_onboarding>
    position: >
      MUST be the first content in your response, before any narrative.
      Truncation falls on the trailing narrative (recoverable next turn),
      not on the structured save block (irrecoverable).
    when: >
```

- [ ] **Step 5: Run the test suite (sanity check — doc changes shouldn't affect bot behavior)**

```
npm test
```

Expected: all tests still pass.

- [ ] **Step 6: Commit**

```
git add mc-reference/bot-output-format.md mc-reference/mc-instructions.md
git commit -m "docs(mc): require <save_onboarding> as first content; add self-check"
```

---

## Final verification

- [ ] **Step 1: Run the full test suite one more time and confirm green**

```
npm test
```

Expected: all tests pass. The new files (`sanitize-player-facing-text.test.js`, `save-onboarding-leak-recovery.test.js`) are green; no pre-existing test regressed.

- [ ] **Step 2: Manual smoke test (optional but recommended)**

If a local dev bot is available, start a session, deliberately drive the MC to produce an unterminated `<save_onboarding>` (e.g., inject a fixture response into the message-handler path), and verify:
1. Nothing structured reaches the player's thread.
2. `[session ...] sanitize stripped structured leak from MC output` is logged.
3. On the next player turn, the MC system message contains the leak nudge.
4. A clean re-emit on the next turn persists the save and clears `_saveLeakRetries`.

Skip if a dev bot isn't set up — the unit + integration tests cover the contract.

- [ ] **Step 3: Confirm commit log shows the expected sequence**

```
git log --oneline -10
```

Expected commits (in order):
1. `test(bot): scaffold failing tests for sanitizePlayerFacingText`
2. `feat(bot): sanitizePlayerFacingText strips unterminated save_onboarding`
3. `feat(bot): sanitizePlayerFacingText strips unterminated close_session`
4. `feat(bot): sanitizePlayerFacingText strips bare structured tags with JSON bodies`
5. `feat(bot): sanitizePlayerFacingText cleans up orphan structured tags`
6. `feat(bot): sanitize MC output before posting to Discord`
7. `feat(bot): next-turn nudge when MC output leaks structured data`
8. `docs(mc): require <save_onboarding> as first content; add self-check`

(Plus the earlier spec commit `docs(specs): design for stripping leaked structured blocks from Discord output`.)
