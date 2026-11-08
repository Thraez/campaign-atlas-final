# R-05 Rebuild queue in State.md

Status: done
Blocked by: none

State.md still described the Morning queue (phase 0 and the old PRs, all merged). A fresh session needs to see the whole rebuild: phases, stop points, PR outcomes and what to build next. Docs only; no code.

## What was done

- `State.md`: the "Morning queue" section is replaced by "Rebuild queue":
  - phases 0, 1, 2, 3, 4, 5, 6, H, 7 and T with goal, done check ("Verified by") and state; the two safe stops (after phase 3, after phase 6) are called out;
  - PR outcomes: phase 0 (#111-#115), the 12 older PRs, phase 1 so far (#116-#119), and the four PRs the plan called moot (#99, #103, #105, #107), merged anyway;
  - phase 1 closing: R-05 and R-06 (player `buildReport.warnings` leak, high; merged #120);
  - phase 2 tickets R-10 to R-20 with their blockers, the next ones to start, and phase H's trigger (before the first real Sync, `tidemarrow/01`).
- The stash and archive-tag note is kept under "Kept notes". "Open work" now points at the queue.
- The full plan stays on branch `rebuild-plan-2026-11` (`docs/rebuild-2026-11/`); State.md names it.

## Acceptance criteria

- [x] Every phase has a goal and a done check; both safe stops are marked.
- [x] PR outcomes match the merged list (#99-#119).
- [x] Phase 2 tickets are listed in order with dependencies.
- [ ] Full gate and review (coordinator).
