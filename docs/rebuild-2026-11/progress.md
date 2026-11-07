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
| D. Plan | `plan.md` | done, approved by Isak |
| Round 2 questions to Isak | `questions-round-2.md` | answered |

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
- Round 2 answered: B approved; merge all 12 PRs in State.md order; Access email PIN per campaign; content-next/ local. Planning done (2627dbd + this commit), nothing pushed.

## Phase 0 build (started 2026-11-07, orchestrator's go after Isak approved B)

One worktree and local branch per ticket, cut from origin/main; nothing pushed or merged (AGENTS.md:
pushes and merges need Isak's yes in this chat). Builders don't run the gate; the coordinator runs
`npm run gate` one at a time, then an Opus review per ticket.

| Ticket | Branch | Builder | State |
|---|---|---|---|
| R-01 Sync guard + tidemarrow/01-03 blocked by H-04 | rebuild-r01-sync-guard (e5e15c5) | Opus | gate pass, review + safety review clean; not pushed |
| Q-01 wikilinks plain text in player | rebuild-q01-wikilinks-plain-text (4a77fd1) | Sonnet | gate pass (one load flake rerun), review clean; not pushed |
| Q-02 fit map on open | rebuild-q02-fit-map-on-open (7937ee3) | Sonnet | gate pass at 7937ee3, review clean, browser re-check pass; not pushed |
| Q-03 menu above map | rebuild-q03-menu-above-map (7310908) | Sonnet | gate pass, review clean, browser pass; not pushed |
| Q-04 region hover card | rebuild-q04-region-hover-card (c1f97ed) | Sonnet | gate pass, review clean, browser pass; not pushed |

PR bodies: `pr-bodies/`. Push and PR need Isak's yes in the coordinator chat; merge order R-01,
Q-01, Q-02, Q-03, Q-04. For Isak to look at: R-01's toast on a vault-note save; Q-02's fit on
open and no view jump after an editor save. R-01 accepted gaps (documented in IMPORT_EXPORT.md):
copied vault notes are caught only at gate time on a machine with the vault path set; a stale
sync map blocks saves of the notes it lists.

### Next (hand-off 2026-11-07, coordinator compacted 3x)

1. Pushed and PRs open (Isak's yes, 2026-11-07): R-01 #111, Q-01 #112, Q-02 #113, Q-03 #114,
   Q-04 #115. Not merged; each merge needs Isak's yes in the chat that merges. Order #111..#115.
2. After push: add the State.md Morning queue entry (on R-01's branch or a docs branch).
3. Fix later: `WORKFLOWS.md:22` still says "3 scanners" (now 14 scans after R-01).
4. Q-01's first gate failed in test:ci with "entity y: unstripped {{secret:}}" (a test fixture,
   under load); the rerun passed. Gate it once more after any rebase.
5. Report Phase 0 to the orchestrator session local_a8dba6ed-82b1-48f6-800e-b9733658539e.
6. p0check worktree (`scratch-phase0-check`) is throwaway: never push; leave its edits.

Q-01 root cause: the sample notes link to places with no note (Thornhold, Sunhaven, ...); the player
variant still drew a dotted "link" span. Not a resolver bug.
