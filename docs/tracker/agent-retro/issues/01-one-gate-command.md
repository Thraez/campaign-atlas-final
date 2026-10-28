# One local gate command

Status: ready-for-agent
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
