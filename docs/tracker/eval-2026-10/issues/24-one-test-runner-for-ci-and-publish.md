# One test runner for the PR check, publish and the hook

Status: ready-for-agent
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
