# State

Updated 2026-10-11. Branch `auto/continuous-dev`; last content commit is `b32a8a9b` (2026-08-29),
followed only by CLAUDE.md/settings work through `89724d4c`.

## Where it stands

- Every queued want and nice-to-have is done (checked by the routine on 2026-09-06; the last
  feature work was the excluded-count split in the DM build report, `5c0c7ca2` / `415618e9`).
- The continuous routine is idle and has handed back 18 times with nothing to build. It needs a
  refuel (a fresh dogfooding pass is the suggested next step). Project memory `handovers/ACTIVE.md`
  is the routine's log and reads as current; it is not.
- Session handover is empty (`handovers/SESSION.md`: Status NONE).

## Next

1. Restructured D&D vault: importer ignore list now covers `00_Templates`, `98_Templates`,
   `Z_Archive`, `90_Inbox`, `Z_Codex_Proposals`. Keep `03_Entities/NPCs`, `03_Entities/Gods` and
   `02_Regions/Places` names, or update `inferType.ts`.
2. Decide whether to refuel or retire the continuous routine.
3. Clean up: 38 identical `claude/*` branches, stale worktrees, 3 stashes (follow the archive-tag
   rule in AGENTS.md).

## Blocked / waiting on the user

- `stash@{2}` holds `content/astrath-deeprealm/imports/kellan-brecht.md`, in no commit. Keep or drop?
- Which vault folders are ticked in "Sync from Obsidian" (none saved yet).
- Whether `campaign-atlas-t1` worktree and the empty `*-worktrees` folders can go.
