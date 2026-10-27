# test:ci tolerates a lone shard's worker timeout

Status: ready-for-agent

A shard can exit 1 on vitest's "Timeout calling onTaskUpdate" with every test green (seen on the PC; `docs/CODEBASE_MAP.md` invariant 7). `scripts/pre-commit.sh` already tolerates that signature; `scripts/dev/run-sharded-tests.mjs` doesn't, so `npm run test:ci` and `npm run verify` fail on noise. Retro ticket `code-retro/08` removes the root cause; this is the cheap guard until then.

## Acceptance criteria

- When a shard exits non-zero with no failed test and the worker-timeout signature, `test:ci` re-runs that shard once and passes if the re-run passes.
- A real test failure still fails `test:ci` straight away, without a re-run.
- `npm test` (the unsharded run that runs out of memory) points at `test:ci` instead, or is removed from `package.json`.
- The runner calls the local `vitest` binary rather than `npx`.
