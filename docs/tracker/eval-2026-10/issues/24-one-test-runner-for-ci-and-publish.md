# One test runner for the PR check, publish and the hook

Status: in-review (review pending)
Area: CI, tests

Found by the third sweep (2026-10-28). The PR check runs plain `npx vitest --shard`
(`atlas-pr-check.yml` ~80) without the one-retry rule, so GOALS' "a lone shard's worker timeout
doesn't fail the run" doesn't hold in CI. The shard flags live in three places (the workflow,
`run-sharded-tests.ts` ~22, `vitest.config.ts` ~27-33), and the timeout rule lives in two with
different patterns (`pre-commit.sh` ~46,63 and `shardOutcome.ts` ~15-16). `publish-atlas.yml`
runs no tests and trusts the hook, which never runs for a merge done in GitHub.

Provisional call (State.md): the PR check and publish both run `npm run test:ci`, publish is
gated on tests, and one module owns the shard flags and the retry rule. This adds about 3 minutes
to a publish.

## Acceptance criteria

- `atlas-pr-check.yml` and `publish-atlas.yml` run the same runner (`test:ci`, or a per-shard
  entry point of it). Publish fails if the tests fail.
- The shard flags and the worker-timeout rule are each defined once; `pre-commit.sh` calls the
  same code.
- A test covers the retry rule with sample shard output.
- Check whether Vitest 4 (eval-07) drops `poolOptions`. If so, note it on eval-07.

## Comments

2026-10-28, branch `eval-24-one-test-runner`: `scripts/dev/shardOutcome.ts` now owns
`SHARD_COUNT`, the vitest arguments (`vitestArgs`: a shard, or `"changed"`) and the retry rule
(`classifyShard`). The CLI no longer passes `--pool`/`--poolOptions`; `vitest.config.ts` alone
sets the pool and worker cap. `run-sharded-tests.ts` gained `--changed` (`npm run test:changed`),
and `pre-commit.sh` calls it instead of its own grep rules: same fail-closed behaviour, but the
worker timeout now gets one re-run instead of being waved through. Both workflows run
`npm run test:ci` in one `test` job (30 min timeout); the PR check's 4-job shard matrix is gone,
so PR runs are slower but can't drift from the runner. `publish-atlas.yml`'s `build` now
`needs: [verify, test]`; triggers, permissions and publish steps unchanged. 13 tests in
`shardOutcome.test.ts`. Workflows parse with js-yaml; Actions not run. Vitest 4 drops
`poolOptions`: noted on eval-07. Gate: typecheck, lint, format, `test:ci` (3,339 passed),
snapshot, player build, build, `atlas:scan` (12 clean), integrity smoke pass.

2026-10-28, review fixes: the PR check keeps its 4 parallel shard jobs (20 min), each running
`npm run test:shard -- N`, a per-shard entry of the same runner; publish keeps one
`npm run test:ci` job, now with job-level `permissions: contents: read`. `classifyShard` is
now `classifyRun(status, output, target)` with `target` required, returning `RunOutcome`
(adds `"no-tests"`, so the hook prints "no tests relate to these changes" again).
`runWithRetry` and `parseRunnerArgs` moved into `shardOutcome.ts` and are tested with a fake
vitest (at most one re-run, the second result decides, a second timeout fails); a shard number
outside 1..`SHARD_COUNT` is refused, so a stale matrix fails loudly. `pre-commit.sh` runs
`npm run lint` instead of `npx eslint .`. 23 tests in `shardOutcome.test.ts`.
