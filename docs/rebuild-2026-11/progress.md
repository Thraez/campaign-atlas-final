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

## Coordinator 2 (session ccb29df9, 2026-11-07 evening)

- Isak's yes in this chat: merge #111..#115 in order (gate each after main moves), and merge the
  12 older PRs here in plan order (#109, #110 first, #101 last), each gated.
- #111 R-01 merged (d28b833); publish run started.
- Q-01 gate on main+branch running. Gate script: scratchpad `gate-branch.sh <worktree>` (waits on
  any running gate, merges origin/main, runs `npm run gate`).
- Docs follow-up worktree `p0docs` (branch `docs-2026-11-07-phase0-followup`): State.md Morning
  queue for the rebuild, WORKFLOWS.md "3 scanners" -> "14 scans". Uncommitted until Phase 0 merges.
- R-04 (adopt goals, ADR-0002) builder: Sonnet, worktree `r04`, branch `rebuild-r04-adopt-goals`.
- Phase 0 merged: #111 d28b833, #112 ec481a5, #113 5b9f694, #114 b1fb6c3, #115 9ca0e30, each gated
  on main+branch first. Q-04's first gate flaked (`world-yaml-conflict-recovers`, passes alone);
  rerun passed. `gh pr merge` right after a push can say "not mergeable" while GitHub recomputes:
  check `mergeStateStatus` is CLEAN first.
- R-04 built (811c7bf + review fixes 457c991), Opus review fixes applied; gate after the old PRs.
- Old PRs: dry-run vs main shows conflicts in #102 (vite-plugin-atlas-save.ts vs R-01), #104
  (AtlasViewer.tsx vs Q-02/Q-04), #101 (State.md). Docs follow-up patch saved in the coordinator's
  notes folder (`p0docs-state-workflows.patch`), lands after #101 (both edit State.md); it also
  marks the provisional calls kept by Isak 2026-11-07 (relayed by the four-apps orchestrator).
- Old-PR merges started: #109 gating.
- Merged so far (gated each): #109 a2c4839, #110 884135f, #99 b011a19, #100 7ef5d34, #106 c9d47b1.
  #102 conflict in vite-plugin-atlas-save.ts (both sides added a function; kept both, 6f066d9),
  Opus review CLEAN, gate pass; chain 102 -> 103 -> 107 running (scratchpad `chain.sh`).
- Remaining old PRs in order: #104 (conflict in AtlasViewer.tsx vs Q-02/Q-04), #105, #108, #101
  (conflict in State.md; then apply `p0docs-state-workflows.patch` from the coordinator notes folder).
- Builders running (Opus, medium): R-02 worktree `r02` (absent world.yaml visibility = dm, editor
  must write explicit visibility, ADR-0001 addendum); R-03 worktree `r03` (publish mode fails every
  scan on a missing artifact, folds arch-09). R-04 waits for a gate. R-05 after #101.
- Push of this branch (rebuild-plan-2026-11) needs Isak's yes; not pushed.
- 22:15 Merged #104 (0c54b4f), #105 (3c185b4, resolved AtlasPlacementEditor.tsx: kept eval-44 soundscape patch seam + mapClickTool), #108 (8f16f09). #101 gating.
- R-02 Opus review CLEAN; ADR nit fixed (52ec3ab). Pre-existing leak confirmed, needs its own high-priority ticket: player `buildReport.warnings` carries world.yaml warnings naming dm region/route ids (build-atlas.ts:737, :1158; loadWorldConfig.ts warnings). Fix ~15 lines: in player builds replace world.yaml warnings with a count line.
- 23:40 #101 merged (d9c3400): all 17 approved PRs merged. R-02 (merged main, conflicts in SoundscapeTab.tsx and buildFullWorldYaml.ts resolved keeping both), R-03, R-04 and docs follow-up (a24f765, State.md + WORKFLOWS 14 scans) all gate-green. Waiting on Isak's yes to push, open PRs and merge them. Then R-05 and the buildReport warnings leak ticket.
- 2026-11-08 01:32 On Isak's yes ("Yes, push and merge"): merged #116 R-02 (b97cdda), #117 R-03 (6f62e26), #118 R-04 (c97db8c), #119 docs follow-up (5c75317; WORKFLOWS conflict kept R-03's "9 safety scans"). main = 5c75317.
- Next: R-05 (rebuild queue in State.md), a ticket for the player buildReport.warnings leak (high; see R-02 review entry), ADR-0002 is in via R-04. Then Phase 2 per plan.md.

## Coordinator 3 (session b6741b63, 2026-11-08)

- Took over Phase 1. Worktrees from origin/main 5c75317: `r05` (branch `rebuild-r05-rebuild-queue`,
  builder Sonnet) and `r06` (branch `rebuild-r06-player-report-leak`, builder Opus). The leak is
  ticket R-06 (`docs/tracker/rebuild-2026-11/issues/R-06-player-build-report-leak.md`): player
  `buildReport.warnings` drops world.yaml warnings for a count line; test that a DM-only region id
  never reaches player atlas.json. Gate helper copied to this session's scratchpad.
- R-05 built (Sonnet, 33d0b57), Opus review: 7 findings (stale open-work lines in State.md,
  tidemarrow blocked by H-04, arch-02/08 folded into R-11a/b, "write R-10..R-20 tickets first"),
  fixed b9c979a; gate pass.
- R-06 built (Opus, ac25b16); adversarial review found the same leak via fog (a player-visible
  route dropped after warning shipped its id); fixed ec9821d with a `hiddenFromPlayer` filter on
  the player buildReport (console keeps every warning, strict counters unchanged); re-check CLEAN;
  gate pass on main 5c75317. Known, accepted: CI console logs still print full world.yaml warnings
  (world.yaml itself is in the public repo; moot once the repo goes private in phase H).
- Waiting on Isak's yes to push, open PRs and merge: R-06 first, then R-05 (mark R-06 merged in
  its State.md, re-gate).
- 2026-11-08 On Isak's yes ("Yes, push and merge"): merged #120 R-06 (0ff1503), then #121 R-05
  (954ac27; State.md updated for R-06 and re-gated on 0ff1503 first). **Phase 1 done.** main = 954ac27.
- Next: Phase 2 when Isak says go. First step: write the R-10..R-20 tickets and ADR-0003/0004 from
  plan.md section 6 into `docs/tracker/rebuild-2026-11/issues/`, then R-10, then R-12 alongside R-11a.
  Open follow-up (R-06 ticket): no scan derives DM region/route ids from world.yaml.

## Phase 2 (Isak's go in coordinator 3's chat, 2026-11-08)

- Tickets R-10..R-20 (+ new R-11d link redaction, R-17b structural isolation scan), tracker README,
  ADR-0003 (schema v2, map tree, campaign files) and ADR-0004 (per-campaign resolver, must-not-ship,
  one output per campaign), both proposed: branch `rebuild-p2-tickets` (worktree `p2tickets`),
  Opus writer 8107895 + three Opus review rounds (fog hides a frame's subtree; a world ships only
  if a map ships, and its notes go with it; name collision fails the build, exempt only the shipped
  note's own title/aliases; v1 adapter owned by R-12 in src/atlas/content/). Final dbfc039, gate pass.
- Isak, 2026-11-08, "Yes to all": accepted every ADR recommendation (Q1-Q9) and the 3 fail-closed
  rules; yes to push/merge. ADRs carry an "Answered" note; R-10 folds the answers in and sets them
  `accepted`. R-10 is ready-for-agent. #122 merged (tickets, ADRs, State.md), gate pass on 0611e4a.
- Isak asked why zooming into a city shouldn't open its map, or clicking a city open the city view:
  the plan already does both (ux-flows p2: zoom past a frame's "enter at zoom" or click it to enter
  the child map; E5 sets "enter at zoom"). Lands in phase 3 (shared canvas) on phase 2's map tree.
- Next: R-10 (Opus, medium), in a fresh coordinator session (this one is past 180k context).
- The orchestrator relayed a "merge on clean gates" answer; not acted on: AGENTS.md requires Isak's yes
  in the merging chat itself.

## Coordinator 4 (session ba314e3c, 2026-11-08)

- Took over Phase 2. R-10: worktree `r10`, branch `rebuild-r10-schema-v2-types` from origin/main
  2902a72, builder Opus (medium). Then: gate, one Opus review, fix, then Isak's push/merge yes.
- R-10 built (Opus, f35e394). Opus review NOT CLEAN: MapV2 dropped the map's name/width/height/
  grid/oceanColor/wrapX/soundscape (blocker); unknown keys dropped silently; prototype keys in
  records; empty ids; plus nits. Fixed d72f5e4 (unknown keys are errors, null-prototype records,
  real-content round-trip test). Re-check CLEAN; nits fixed 1279e6e (test guard, parent error,
  R-20 ticket lists the v1 inputs v2 rejects). Gate pass on 1279e6e (main 2902a72).
- Waiting on Isak's yes to push `rebuild-r10-schema-v2-types`, open the PR and merge. Then R-11a
  and R-12 side by side.
