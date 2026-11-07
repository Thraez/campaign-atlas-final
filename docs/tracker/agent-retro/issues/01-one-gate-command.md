# One local gate command

Status: done
Area: dev scripts

A PR merges on the full local gate (`docs/agents/workflow.md`). The repo has no command for it.
`npm run verify` runs typecheck, lint and tests, but the gate also needs `format:check`,
`atlas:publish` (snapshot, player build, build, the 13 scans), and `atlas:check-secrets` and
`atlas:check-derived` on `dist`. Then `public/atlas/` has to be restored, because the gate rebuilds
it. On 2026-10-28 this lived in a session scratch script that wrote its step logs under the wrong
name.

Done when `npm run gate` runs every step in order, stops at the first failure, names the failing
step, and restores `public/atlas/` whether it passed or failed. `workflow.md` and `AGENTS.md` name it.
A failed Vitest shard is rerun once (the existing retry rule in `scripts/dev/shardOutcome.ts`),
since load from parallel sessions causes worker timeouts.

## Comments

2026-11-07: `npm run gate` (`scripts/dev/run-gate.ts`, pure part in `scripts/dev/gatePlan.ts` with
tests in `gatePlan.test.ts`). Steps run in workflow order; the first non-zero exit stops the gate and
is named with its exit code or signal; each step logs to `.gate-logs/<n>-<step>.log` (gitignored),
and the console gets one line per step plus the tail of the failing log. Restore runs after pass,
fail or Ctrl-C: `git checkout -- public/atlas`, `git clean -fd -- public/atlas` (files the build
added), and the ignored `.last-published.json` put back as it was. The gate never retries; the
shard retry stays inside `test:ci`. `--only a,b` and `--dry-run` for partial runs.

Provisional calls: the gate refuses to start if `public/atlas/` already has uncommitted changes,
since the restore would discard them; it restores `.last-published.json` too, because
`atlas:snapshot` rewrites the editor's diff baseline; it warns if `git status` differs from before
the run, so stray build output elsewhere shows up.

Review fixes: SIGTERM and SIGHUP stop and restore like Ctrl-C (exit 128+n); a step that never ran
has no log and is reported without one; the `dist` scans fail when `dist/` is missing (they would
skip with exit 0), which matters for `--only` runs without `atlas:publish`.
