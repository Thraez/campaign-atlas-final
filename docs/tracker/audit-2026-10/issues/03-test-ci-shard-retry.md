# test:ci tolerates a lone shard's worker timeout

Status: done

A shard can exit 1 on vitest's "Timeout calling onTaskUpdate" with every test green (seen on the PC; `docs/CODEBASE_MAP.md` invariant 7). `scripts/pre-commit.sh` already tolerates that signature; `scripts/dev/run-sharded-tests.mjs` doesn't, so `npm run test:ci` and `npm run verify` fail on noise. Retro ticket `code-retro/08` removes the root cause; this is the cheap guard until then.

## Acceptance criteria

- When a shard exits non-zero with no failed test and the worker-timeout signature, `test:ci` re-runs that shard once and passes if the re-run passes.
- A real test failure still fails `test:ci` straight away, without a re-run.
- `npm test` (the unsharded run that runs out of memory) points at `test:ci` instead, or is removed from `package.json`.
- The runner calls the local `vitest` binary rather than `npx`.

## Comments

2026-10-27: `scripts/dev/run-sharded-tests.ts` (was `.mjs`, now run with `tsx`) calls `node_modules/.bin/vitest` directly, streams each shard's output and keeps a copy. `scripts/dev/shardOutcome.ts` decides per shard: exit 0 passes; any "N failed" fails straight away; a non-zero exit with the worker-timeout signature and a "Tests N passed" summary gets one re-run; anything else fails. Seven tests in `scripts/dev/shardOutcome.test.ts`. `npm test` now runs `test:ci`. Gate: typecheck, lint, `npm test` 3,235 passed. A run against a mismatched `node_modules` (failed test files, tests passing) failed every shard without a re-run, as it should. The retry path itself is only covered by the unit tests; the timeout didn't occur on the Mac.
