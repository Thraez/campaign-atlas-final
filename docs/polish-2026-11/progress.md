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

| Item | State | PR |
| --- | --- | --- |
| P-01 Overlays stop piling up | merged | #151 |
| P-02 Ocean fit margin (R-37) | merged | #150 |
| P-03 Phone top bar (R-38) | merged | #153 |
| P-04 Handoff always fires (R-40) | merged | #152 |
| P-05 Soft handoff | merged | #154 |
| P-06 Zoom and crumb feel | merged | #156 |
| P-07 Frames and pictures respond | merged | #157 |
| P-08 First load and fonts | merged | #155 |

## 2026-11-19

- Round 1 is done: all eight items merged and published. Each went through the full local gate and
  an Opus review; fixes from the reviews are in the item notes under `items/` and, for P-02 and P-03, in the
  R-37 and R-38 tickets.
- What Isak should look at, the open questions and three new round-2 candidates are in `State.md`
  ("Polish round 1").
- Not checked on real hardware: P-06's wheel speed on a retina trackpad, Windows scaling, Safari and
  Firefox; P-07's glow in Safari and Firefox and the pressed state on a real phone.
