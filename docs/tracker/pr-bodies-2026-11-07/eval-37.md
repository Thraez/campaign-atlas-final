Ticket: `docs/tracker/eval-2026-10/issues/37-build-lock-held-until-build-ends.md`

The build lock is now held until a timed-out build settles. A save whose rebuild passes 60 s still
answers the DM (207, saved, not yet rebuilt), but a publish-check can no longer start a player build
alongside the one still running.

- `buildLock.ts`: `holdBuildLockUntilSettled(promise)`; `buildLockHolder()` so a 423 says "a
  previous build is still running"; one warning line when a build outlives its request; a test-only
  reset.
- `vite-plugin-atlas-save.ts` (`runAtlasBuild`) and `runPublishCheck.ts` hold the lock on their build.
- Tests: the save route and publish-check with a slow build under fake timers (success and failure),
  and lock unit tests.

Review (Opus, medium): lock logic clean; its three findings (publish-check test, log line, test reset)
are fixed in ffb9f5c.

Known trade-off: a build promise that never settles holds the lock until the dev server restarts
(the ticket's choice); the warning line makes that visible.

## Local gate (2026-11-07, branch at ffb9f5c, on origin/main 2f4e7e6)

```
typecheck:all exit 0 · lint exit 0 · format:check exit 0
test:ci: shard 1/4 992 passed | 1 skipped · 2/4 771 · 3/4 1000 · 4/4 1026 — all shards green
atlas:publish exit 0 · atlas:check-secrets dist exit 0 · atlas:check-derived dist exit 0
GATE PASSED
```

🤖 Generated with [Claude Code](https://claude.com/claude-code)
