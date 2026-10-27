# Spec — Strict pre-commit hook (typecheck + lint + tests)

**Date:** 2026-05-28
**Status:** Blocked on `2026-05-28-idb-flake-fix`
**Recommended model:** Sonnet 4.6
**Depends on:** IDB flake fix must be merged to `main` first
**Estimated session:** 15–20 minutes

## What this fixes (plain language)

Every now and then a typo, a broken test, or a TypeScript error sneaks into a commit. With a pre-commit hook, the commit refuses to land if any of those three checks fail. It's a one-time setup that saves a slow trickle of "oh, that broke" moments forever.

## Why this is gated on the flake fix

The current `Do NOT` from the prior handover is explicit:

> Do NOT add `npx tsc --noEmit && npx eslint . && npx vitest run` as a pre-commit hook without first resolving the 2 pre-existing failures in `useEditorSession.test.tsx`.

Adding the hook before the flakes are gone means roughly 1 in 50 commits would be rejected by a test that has nothing to do with the change. That's worse than no hook at all.

## Success criteria

1. `git commit` runs, in order: `tsc --noEmit` → `eslint .` → `vitest run`. Any non-zero exit blocks the commit.
2. A planted broken test (revert in a temp branch) causes the hook to reject the commit.
3. A clean commit succeeds in under ~60 seconds on this machine.
4. The setup is documented in one place (README or a short `docs/dev-setup.md`).
5. Hook is portable — new clones can run one command to install it. (Hooks under `.git/hooks/` are not committed by git; we need a real installer.)

## Approach

Use **`simple-git-hooks`** (zero runtime cost, no husky bloat). It writes a small shim into `.git/hooks/pre-commit` from a `package.json` field.

Why not husky:
- Heavier dependency footprint
- Maintains a `.husky/` directory in the repo, more moving parts
- This project values minimalism; simple-git-hooks fits the codebase's spirit

Why not a hand-rolled `.git/hooks/pre-commit`:
- Not portable; not committed; every new clone would need a manual copy step

## Non-goals

- Adding **pre-push** hooks. Pre-commit is enough; pre-push is friction without a clear win for a solo project.
- Adding **commit-msg** hooks (e.g., Conventional Commits enforcement). Out of scope.
- Adding **lint-staged**. Running the whole `vitest run` and `eslint .` is fine until duration becomes a problem.

## Constraints

- The hook must NOT be bypassable by accident. `--no-verify` is fine as an intentional escape hatch (per project policy, only used when explicitly authorized).
- Total hook time should stay under ~90 seconds on this machine. If `vitest run` ever exceeds that, switch to `vitest run --changed` and re-evaluate.

## What to read first

- `package.json` — current scripts section
- `eslint.config.js` (or `.eslintrc`) — confirm `eslint .` finishes cleanly today
- `tsconfig.json` — confirm `tsc --noEmit` finishes cleanly today

## Open questions for the executor

- Does `npm test` (which is `vitest run`) already exist? Yes — `package.json` line 14.
- Should the hook also run `atlas:check-shape` against the current `public/atlas/atlas.json`? **No** — that's a publish-time scan, not a commit-time one.
