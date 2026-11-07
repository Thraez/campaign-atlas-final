Ticket: `docs/tracker/agent-retro/issues/01-one-gate-command.md`

`npm run gate` runs the full local merge gate from `docs/agents/workflow.md` ("Done"):
typecheck:all, lint, format:check, test:ci, atlas:publish, atlas:check-secrets dist,
atlas:check-derived dist.

- Stops at the first failing step and names it with its exit code or signal; prints the failing
  log's tail. Each step logs to `.gate-logs/<n>-<step>.log` (gitignored).
- Restores `public/atlas/` (checkout + clean, and `.last-published.json` byte for byte) after a pass,
  a fail, a throw, Ctrl-C, SIGTERM or SIGHUP. Refuses to start if `public/atlas/` already has changes.
- No retry of its own; test:ci keeps its one shard retry.
- `--only a,b` and `--dry-run`. The dist scans fail if `dist/` is missing instead of skipping.
- `scripts/dev/gatePlan.ts` (tested with an injected runner, 18 tests), `scripts/dev/run-gate.ts`;
  `workflow.md` and `AGENTS.md` name the command.

Review (Opus, medium): steps, order, restore and `-- dist` passing verified; its findings (SIGTERM/
SIGHUP, missing log after a signal, scans without dist) fixed in 9f01675.

## Local gate (run with this branch's own `npm run gate`)

```
[1/7] typecheck:all ok · [2/7] lint ok in 9s · [3/7] format:check ok in 3s
[4/7] test:ci ok in 1m20s (shards 1-4: 87+1 skipped / 88 / 88 / 87 files passed, all shards green)
[5/7] atlas:publish ok in 6s · [6/7] atlas:check-secrets ok (27 text files in dist) · [7/7] atlas:check-derived ok
public/atlas/ restored.
gate passed: 7 step(s) in 1m44s   (2026-11-07, branch at 9f01675, on origin/main 2f4e7e6)
```

🤖 Generated with [Claude Code](https://claude.com/claude-code)
