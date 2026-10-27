# Plan — Fix the two `useEditorSession` IDB flakes

**Spec:** `docs/superpowers/specs/2026-05-28-idb-flake-fix.md`
**Branch suggestion:** `fix/idb-flakes`

## Steps

1. **Confirm which tests flake.** Run a repeat sweep to lock in the culprits:
   ```
   npm test -- src/test/session/useEditorSession.test.tsx --repeat=20
   ```
   Expected: the two suspected tests appear in the failure list. If a different test flakes instead, update the spec's "likely culprits" before continuing.

2. **Read the suspect tests and the hook under test.** Confirm the order of operations:
   - holder `set`/`bump` (synchronous)
   - React effect that calls `idbStore.set` (async, debounced 500 ms)
   - `vi.advanceTimersByTime(500)` advances the debounce timer
   - `await Promise.resolve()` flushes one microtask layer
   - assertion reads from IDB via `idbGet`

   The race: `fake-indexeddb` resolves its writes on its own microtask queue, and one `await Promise.resolve()` is not always enough to settle that queue + React's batched effect cleanup in the same tick.

3. **Apply the smallest-possible fix.** Prefer in this order:
   - **A. Use `await vi.runAllTimersAsync()`** in place of `vi.advanceTimersByTime(500); await Promise.resolve()`. `runAllTimersAsync` drains both timer and microtask queues.
   - **B. Wrap the IDB write in a real-timers window:** call `vi.useRealTimers()` before the assertion, `await waitFor(() => expect(...).not.toBeNull())`, then resume fake timers if subsequent assertions need them.
   - **C. Extract a `flushIdb()` test helper** that wraps `await new Promise(r => setTimeout(r, 0))` + a microtask flush, then call it consistently. Only do this if A and B both fail.

4. **Verify 50/50.** Run:
   ```
   npm test -- src/test/session/useEditorSession.test.tsx --repeat=50
   ```
   Must pass 50/50. If not, escalate to Opus — there is a real race, not a test-config issue.

5. **Verify full suite.** Run `npm test`. Must report 951/951.

6. **Lint + typecheck.** `npm run lint && npx tsc --noEmit`.

7. **Commit.** Suggested message:
   ```
   test(session): stabilize useEditorSession IDB tests
   ```
   No `Co-Authored-By` unless the user asks.

8. **Open PR.** Title: `test(session): stabilize useEditorSession IDB tests`. Body should include the 50/50 verification output as evidence.

## Verification before claiming done

- 50/50 repeat run output saved in PR description
- `npm test` → 951/951
- No production source (`src/atlas/**`) touched

## Rollback

Pure test-code change — `git revert` is safe.
