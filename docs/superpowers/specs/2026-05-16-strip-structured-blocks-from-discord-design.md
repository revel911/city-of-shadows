# Strip Structured Blocks From Discord — Design

## Problem

A character was created during a session and the MC's `<save_onboarding>` block leaked into Discord as a JSON dump visible to the player. The leaked text included an orphan `</sheet>` closing tag, a full `<state_patch>` JSON object, and a `<npc_patch>` array truncated mid-NPC.

Root cause: the MC's response hit the model's output cap mid-`<npc_patch>` before `</save_onboarding>` was emitted. The bot's strip regex at `bot/handlers/session.js:270` requires both `<save_onboarding>` and `</save_onboarding>` to be present (`/<save_onboarding>([\s\S]*?)<\/save_onboarding>/`). With no closing tag in the response, the regex doesn't match, nothing is stripped, and the raw structured payload is posted verbatim to the player's thread.

This is a two-sided failure: the bot has no defensive layer for malformed blocks, and the MC contract permits the save block to live anywhere in the response — including positions that are vulnerable to tail-truncation.

## Goals

- Structured data (save/close blocks, bare patches, sheet fragments) must never reach a player-facing Discord thread, regardless of how the MC malforms its output.
- When a leak is detected, the save itself is presumed lost (the closing tag was never emitted, so the bot cannot know what the MC meant). The bot must signal the MC on the next turn to re-emit a complete block.
- Reduce the likelihood of the leak occurring in the first place by changing the position rule for `<save_onboarding>` so truncation falls on recoverable narrative instead of irrecoverable structured data.

## Non-goals

- Recovering partial save data from a malformed block. The block is by definition incomplete; there is no safe way to persist half a sheet.
- Changing the schema or fields of `<save_onboarding>` / `<close_session>`.
- Changing `<close_session>`'s trailing-only position rule (correct as-is for close, where post-block narrative is meaningless).

## Design

Two coordinated changes, one on each side of the bot/MC boundary, plus a small recovery-coordination addition that reuses the existing retry pattern.

### 1. Bot-side: defensive sanitizer

New exported helper in `bot/handlers/session.js`:

```js
export function sanitizePlayerFacingText(text) {
  // returns { cleaned, leakDetected }
}
```

Called from every send-path that posts MC narrative to a Discord thread, immediately after the existing `stripSaveOnboardingBlock` / `stripCloseBlock` extraction passes and immediately before `thread.send(...)`. Find call sites by grepping `session.js` for those two strip-function names — both already converge to a small set of send-paths.

Internal order of operations:

**Step 1 — unterminated `<save_onboarding>`.**
Regex: `/<save_onboarding>(?![\s\S]*<\/save_onboarding>)[\s\S]*$/`
A match means the opening tag is present but no closing tag appears anywhere after it. Strip from the open tag to end-of-string. Set `leakDetected = true`.

**Step 2 — unterminated `<close_session>`.**
Same shape as step 1, substituting `close_session`. Same `leakDetected` flag.

**Step 3 — bare structured tags outside any container.**
By the time sanitize runs, all valid `<save_onboarding>...</save_onboarding>` and `<close_session>...</close_session>` blocks have been extracted by the existing strip functions. Anything still matching a structured-tag pair is by definition floating outside a container.

Iterate the tag list:
`['state_patch', 'npc_patch', 'sheet', 'handoff', 'arc_patch', 'events_append', 'interactions_patch', 'world_event']`

For each tag, regex `/<TAG>([\s\S]*?)<\/TAG>/g`. For each match, decide whether the body looks like a structured payload:
- Trim the body, then test: first non-whitespace char is `{` or `[`, **or** the body contains one of the known schema-key markers (`"id":`, `"character_name":`, `"stats":`, `"personality":`, `"faction":`).
- If structured → strip the whole `<TAG>...</TAG>` match and set `leakDetected = true`.
- If not structured → leave alone. This preserves legitimate narrative prose that happens to use one of these words inside angle brackets (e.g. in-fiction stage direction).

**Step 4 — orphan-tag cleanup.**
After step 3, all valid pairs of structured tags are gone. Any remaining standalone `<TAG>` or `</TAG>` for a tag in this explicit list is by definition orphaned:

`['save_onboarding', 'close_session', 'state_patch', 'npc_patch', 'sheet', 'handoff', 'arc_patch', 'events_append', 'interactions_patch', 'world_event', 'character_id']`

(Step 3's eight tags, plus the two container tags, plus `character_id` — which is always nested inside save/close, so a bare instance is always orphaned.) For each tag, strip standalone occurrences in a single regex pass. No body inspection — these are text fragments with no payload. Set `leakDetected = true` if any are stripped.

**Step 5 — return.**
Return `{ cleaned: cleaned.trim(), leakDetected }`. Caller posts `cleaned` to the thread; if `leakDetected`, it sets `session._lastTurnSaveLeak = true` and increments a sibling retry counter on the session.

### 2. Recovery coordination

Extend the existing retry path in `session.js:149-160` (currently used for save blocks missing required fields).

When the next MC turn fires and `session._lastTurnSaveLeak` is set:
- If the new turn opens with a valid `<save_onboarding>...</save_onboarding>` and it parses cleanly, clear the flag and proceed normally.
- Otherwise, prepend a system-message nudge to the next MC prompt:
  > `⚠ Your previous response contained an unterminated <save_onboarding> block — the save did not persist. Re-emit a complete <save_onboarding> block as the FIRST content of your next response. Retry N of <SAVE_ONBOARDING_MAX_RETRIES>.`
- Bump the retry counter. Counter shares the same `SAVE_ONBOARDING_MAX_RETRIES` cap that already gates the missing-fields path, so we do not loop forever. On exhaustion, surface the existing "still incomplete after N retries" error.

The leak flag is per-session, not per-character — clears on a clean turn or on session close.

### 3. MC-side: contract tightening

All changes land in `mc-reference/bot-output-format.md`.

**Edit 1** — replace the current "may appear anywhere in your message" sentence (around line 57) with:

> The `<save_onboarding>` block MUST be the **first content** in your response, before any narrative. The bot extracts it and posts the trailing narrative to the thread. Putting the save block first protects the structured save from being truncated when your response is long — only the narrative tail can be lost to a length cap, and the narrative can be recreated on the next turn while a partial save cannot.

**Edit 2** — Save field rules: add one bullet at the top of the rules list (around line 83):

> **Position** — emit this block as the very first content of your response. Open with `<save_onboarding>`, close with `</save_onboarding>`, then write your scene narrative. Do not interleave.

**New subsection** — insert before "When not to emit save_onboarding":

> ### Length & self-check
>
> A complete `<save_onboarding>` for a fresh character typically runs 800–1500 characters. If your sheet has grown longer (lots of gear, long notes), keep an eye on total response length: opening a scene with rich narrative *after* the save block can push your full reply past the model's output cap and truncate the trailing narrative — that's the safe failure. If the save block itself is truncated, the character does not persist.
>
> Before sending, verify three things:
> 1. The response opens with `<save_onboarding>`.
> 2. A matching `</save_onboarding>` appears before your scene narrative begins.
> 3. Every nested tag inside the block (`<character_id>`, `<sheet>`, `<state_patch>`, `<npc_patch>`) has a matching closing tag.
>
> If you find yourself wanting to write a very long opening scene on the same turn as a save, prefer to keep the scene short — the next player turn will give you space to expand.

**`<close_session>` rules:** unchanged. Trailing-only remains correct (close ends the session, so anything after the block is discarded anyway).

**`mc-reference/mc-instructions.md`:** verify at implementation time whether it duplicates the "anywhere in message" guidance. If yes, update to match the new contract. No design change there — just doc consistency.

## Testing

### Unit tests for `sanitizePlayerFacingText`

New file: `bot/test/sanitize-player-facing-text.test.js`.

| Input | Expected `cleaned` | Expected `leakDetected` |
|---|---|---|
| Pure narrative, no tags | unchanged | `false` |
| Narrative with a successfully-extracted save block already removed upstream | unchanged | `false` |
| Unterminated `<save_onboarding>` followed by `<state_patch>{...}` and a truncation point | narrative up to the open tag, tail stripped | `true` |
| Bare `<state_patch>{"foo":1}</state_patch>` floating in prose | tag and body removed | `true` |
| Bare `<npc_patch>[{"id":"npc_x"...}]</npc_patch>` floating in prose | tag and body removed | `true` |
| Bare `<sheet>` with JSON-like body | tag and body removed | `true` |
| Narrative containing literal `<sheet>` with non-JSON body (in-fiction phrase) | unchanged | `false` |
| Unterminated `<close_session>` at end of message | tail stripped from open tag | `true` |
| Orphan `</sheet>` with no opener anywhere in text | orphan tag stripped, surrounding prose preserved | `true` |
| The exact failure pattern from the incident (orphan `</sheet>` + `<state_patch>` + truncated `<npc_patch>`) | all three stripped | `true` |

### Integration tests

Extend or sibling-add to `bot/test/save-onboarding.test.js`:

- **Unterminated save → nudge fires.** Simulate an MC reply with an unterminated save block. Assert: bot posts only the cleaned prose (if any), `_lastTurnSaveLeak` is `true` on the session, the next MC system prompt contains the re-emit nudge with retry count `1`.
- **Clean re-emit clears the flag.** Simulate a successful re-emit on the next turn. Assert: leak flag clears, save persists via the normal `processSaveOnboarding` path, no further nudge in subsequent turns.
- **Retry exhaustion surfaces existing error.** Simulate `SAVE_ONBOARDING_MAX_RETRIES` consecutive malformed turns. Assert: bot stops nudging and surfaces the existing "still incomplete after N retries" thread message (same path that the missing-fields branch uses).

### Manual smoke test

Run the bot locally, drive an MC fixture that produces a deliberately-truncated save block (e.g., chop off the last 200 chars of a known-good save), and confirm: nothing structured reaches the thread, the next-turn system prompt contains the nudge, a clean re-emit succeeds.

## Edge cases considered

- **Both a clean save block AND a malformed leftover in the same response.** The clean block is parsed and removed by the existing strip pass first. Sanitize catches the leftover via step 3 or step 4. Save still persists; leak flag set defensively (harmless — next turn either re-emits cleanly and clears, or the duplicate-save guard at `processSaveOnboarding:367` no-ops).
- **MC quoting the schema in prose** (e.g. explaining `<save_onboarding>` to a confused player). Step 3's structured-payload sniff (must start with `{`/`[` or contain known schema keys) keeps schema prose safe.
- **Whitespace.** Final `.trim()` on the cleaned output prevents leading/trailing blank lines after stripping.
- **Per-session leak flag.** Stored on the in-memory session object; cleared on clean turn or session close. Not persisted, because the recovery window is the next turn or two — not across sessions.

## Files touched

- `bot/handlers/session.js` — add `sanitizePlayerFacingText`, wire it into the send paths, extend the retry nudge to handle leak detection.
- `bot/test/sanitize-player-facing-text.test.js` — new file, unit tests.
- `bot/test/save-onboarding.test.js` (or a new sibling file) — integration tests for the recovery flow.
- `mc-reference/bot-output-format.md` — contract edits per Section 3 above.
- `mc-reference/mc-instructions.md` — verify and update only if it duplicates the "anywhere in message" guidance.

## Out of scope

- Changes to `<close_session>`'s position rule.
- Changes to the save/close schemas.
- Cross-session leak-flag persistence.
- Recovering partial structured data from a malformed block.
