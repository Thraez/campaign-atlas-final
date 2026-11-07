# Atlas redesign / rebuild: progress

Orchestrator session started 2026-11-07. Branch `rebuild-plan-2026-11`, worktree
`.claude/worktrees/rebuild`. Planning only: nothing gets built until Isak says yes to the plan.

## Stages

| Stage | Output | State |
|---|---|---|
| A. Audit | `audit.md` (+ `audit/`) | done |
| B. Draft goals | `GOALS-proposed.md` (later replaces `docs/GOALS.md`) | running |
| Round 1 questions to Isak | `questions-round-1.md` | waiting |
| C. Editor and player UX | `ux-flows.md`, `wireframes/*.html` | waiting |
| D. Plan | `plan.md` | waiting |
| Round 2 questions to Isak | `questions-round-2.md` | waiting |

## Inputs

- Isak's goals, 2026-11-07: one huge atlas connecting all his worlds and maps; hidden zones,
  travel, fog, notes on every place; story engine as well as exploration (hover regions, examples,
  monuments, people); browser editor stays and must stop being messy; repo public on purpose,
  content is test material; world name undecided.
- Prior verdict (session c1083d66, 2026-11-07): "no rewrite, extract instead". To be re-checked
  against the new goals, not taken as given.
- 12 open PRs #99–#110, merge order in State.md on #101. Not to be merged here.

## Log

- 2026-11-07: worktree made; dev server `atlas-editor` on :8080 from the main checkout. Stage A
  started with three subagents: code/editor audit (Opus), docs and tracker digest (Sonnet),
  running-app walkthrough (Sonnet, playwright-cli).
- Stage A done: `audit.md`. Verdict: keep the pipeline and safety spine, rewrite the editor (one
  document store over source data) and the map model (map tree, schema v2), refactor build and viewer.
- Orchestrator asked for a round-1 question on `world.yaml` entries with no visibility (player or
  dm); drafted in `questions-round-1.md` (today 0 regions/routes, so dm hides nothing).
- Blocked: the commit's pre-commit hook needs `node_modules` in this worktree (it held only `.tmp`,
  so `test:changed` failed silently). Replacing it with a symlink to the main checkout's (as t45 etc.
  have) was refused by auto mode. Work sits uncommitted in the worktree; `.gitignore` gained
  `docs/rebuild-2026-11/audit/shots/` (13 MB of PNGs, local only).
- Commit unblocked: `npm ci` in the worktree (own node_modules), hook passed; 2802f22.
- Round 1 answered by Isak (see `questions-round-1.md`): seamless ocean canvas at world level with
  nested child maps below; one baked fog per campaign; Sync + editor-only notes; DM-only text in a
  gitignored local folder; missing world.yaml visibility = dm.
- Stage C started: flows + GOALS update (Opus, medium); wireframes next.
