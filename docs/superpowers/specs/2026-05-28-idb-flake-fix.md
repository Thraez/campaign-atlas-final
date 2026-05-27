# Spec — Fix the two `useEditorSession` IndexedDB flakes

**Date:** 2026-05-28
**Status:** Ready for execution
**Recommended model:** Sonnet 4.6
**Depends on:** nothing
**Blocks:** strict pre-commit hook (`2026-05-28-strict-precommit-hook`)
**Estimated session:** 30–45 minutes

## What this fixes (plain language)

The editor's autosave/restore tests occasionally fail for no real reason. That single fact is the reason we can't yet turn on an automatic "check everything before you commit" gate. Fixing the flakes is the unlock for a strict pre-commit hook, which in turn means typos and broken tests stop slipping into `main`.

## The problem

`src/test/session/useEditorSession.test.tsx` has 6 tests, of which 2 have flaked since PR #36. `npm test` currently reports 949/951. The handover (`handovers/ACTIVE.md` archive 2026-05-26) explicitly notes:

> 2 pre-existing IDB flakes in `src/test/session/useEditorSession.test.tsx` — NOT introduced by this work, present since PR #36.

The likely culprits are the two tests that mix `vi.useFakeTimers()` with `fake-indexeddb` and real microtasks:

- `it("persists to IDB (debounced) and re-hydrates with a restore notice")` (line 68)
- `it("discardAll clears holders, IDB, undo, and returns to clean")` (line 87)

These two switch between fake and real timers around IDB roundtrips, which is where ordering races live.

The other four tests use only real timers and synchronous holder bumps; they should not flake.

## Success criteria

1. `npm test -- src/test/session/useEditorSession.test.tsx --repeat=50` passes 50/50.
2. `npm test` reports **951/951** passing (up from 949/951). No new skipped tests; no `it.skip` introduced.
3. No production code changes — only test code, or test-utility code under `src/test/`.

## Non-goals

- Refactoring the rest of `useEditorSession` itself.
- Replacing `fake-indexeddb` with a hand-rolled mock.
- Touching unrelated tests "while we're in there."

## Constraints

- Must keep coverage of both behaviours: debounced IDB persistence and discardAll cleanup.
- No `--retry` flag in vitest config to mask flakiness. The bar is "passes 50/50," not "passes if we retry once."
- Do not introduce arbitrary `setTimeout`/`sleep` waits to hide ordering bugs. Use `vi.runAllTimersAsync()` or `waitFor` polling assertions.

## What to read first

- `src/test/session/useEditorSession.test.tsx` (the test file)
- `src/atlas/session/useEditorSession.ts` (the hook under test — to understand what's actually being persisted/restored)
- `src/atlas/session/idbStore.ts` (the IDB wrapper — to see how reads/writes are awaited)

## Open questions for the executor

- If the root cause is fake-indexeddb microtask ordering, is the fix per-test or a shared `flushIdb()` utility? Prefer the smaller change.
- If `vi.runAllTimersAsync()` is enough, that's the cleanest path. If not, real-timers-with-`waitFor` is acceptable.
