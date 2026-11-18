# Polish round: progress

Plan: `plan.md`. Orchestrator notes, newest last.

## 2026-11-18

- ADR-0005 and ADR-0006 are on no branch and in no PR; phase 4's scope was read from
  `origin/rebuild-plan-2026-11:docs/rebuild-2026-11/plan.md` (what survives is in `plan.md`).
- Audit done: live v1 site and local v2 sites, desktop and 375 px (two playtests, one code read).
- Plan written: eight items for round 1, two tracks (canvas, chrome).
- Each item builds in `.claude/worktrees/polish-pNN`, branch `polish-pNN-<slug>`, from
  `origin/main`. Before and after screenshots go in `docs/polish-2026-11/shots/`.
- `State.md` gets one "for Isak's look" entry for the round in a closing docs PR, so parallel
  item PRs don't collide on it.

| Item                             | State  | PR  |
| -------------------------------- | ------ | --- |
| P-01 Overlays stop piling up     | queued | -   |
| P-02 Ocean fit margin (R-37)     | queued | -   |
| P-03 Phone top bar (R-38)        | queued | -   |
| P-04 Handoff always fires (R-40) | queued | -   |
| P-05 Soft handoff                | queued | -   |
| P-06 Zoom and crumb feel         | queued | -   |
| P-07 Frames and pictures respond | queued | -   |
| P-08 First load and fonts        | queued | -   |
