# Atlas redesign / rebuild: progress

Orchestrator session started 2026-11-07. Branch `rebuild-plan-2026-11`, worktree
`.claude/worktrees/rebuild`. Planning only: nothing gets built until Isak says yes to the plan.

## Stages

| Stage | Output | State |
|---|---|---|
| A. Audit | `audit.md` (+ `audit/`) | done |
| B. Draft goals | `GOALS-proposed.md` (later replaces `docs/GOALS.md`) | done |
| Round 1 questions to Isak | `questions-round-1.md` | answered |
| C. Editor and player UX | `ux-flows.md`, `wireframes/*.html` | done (browser-checked) |
| D. Plan | `plan.md` | revising after two reviews |
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
- Stage D first draft: `plan.md` (Opus). Recommends option B: rebuild editor + map model in this
  repo behind `__INCLUDE_EDITOR__`, keep pipeline/scans/Sync/tests; ~45–55 ticket sessions. PRs:
  merge #109, #110 first; #99, #103, #105, #107 moot.
- Isak follow-up (2026-11-07, this chat): public is only for testing; later the site moves to
  Cloudflare and the repo goes private, so the DM folder needn't be gitignored and raw map images
  are fine; map compression undecided (he zooms a lot); campaigns start out separated by visibility,
  later possibly by maps. This reverses round-1 Q4 and the plan's "campaigns differ only in fog".
  Plan agent revising plan.md, GOALS-proposed.md, ux-flows.md. Wireframes still running.
- Checked: Thraez/Dungeons-and-Dragons-Campaign-Repository is private; campaign-atlas-final public.
- Wireframes (`wireframes/editor.html`, `player.html`): playwright check found D1–D5, fixed,
  rechecked pass. Committed b0608e4 (plan aa6e24e, goals/flows 818d43e).
- Plan reviewed by two Opus agents (goals/cost, safety/sequencing): both "needs changes". Main
  points: quick-wins phase first; cutover only at editor parity; tiles off the critical path;
  migration writes per-campaign visibility so new campaigns start hidden; `notes:` overrides never
  widen a vault dm; scans per campaign from one resolver before per-campaign outputs land; Access
  live before first deploy, direct upload only; merge all 12 PRs since the old editor lives months.
- HIGH, open on main today: `tidemarrow/issues/01-first-sync.md` is ready-for-agent and would commit
  real vault notes to the public repo. Orchestrator session warned; plan's first ticket blocks
  tidemarrow/01–03 and adds a `hosting: public` guard. Main not edited from here.
- Combined fixes sent to the plan agent; round 2 questions follow.
