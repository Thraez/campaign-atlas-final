# State

Updated 2026-10-27 on the Mac. Branch `main`.

## Where it stands

- Reworked on 2026-10-27: Matt Pocock's skills installed (`docs/agents/`), goals agreed with Isak
  (`docs/GOALS.md`), ADR-0001 (a note with no visibility is DM-only), tickets in `docs/tracker/`.
- The atlas becomes the players' atlas for the world, Tidemarrow first, filled from the vault by
  Sync from Obsidian. Today it still shows the old Astrath sample (three events).
- The continuous-dev routine is retired; its docs are in `docs/archive/`.
- react-router 7 is on `main` (audit-07). Mac launchers: npm commands only (audit-04).
- Live site: https://thraez.github.io/campaign-atlas-final/. The player build now ships only
  images a player note shows (the Corven and Edric portraits leaked until 2026-10-27).
- code-retro 01-04 are on `main`: scan titles, Sync title and type, Sync order, Staging.
- The GitHub repo is public, so the DM notes in `content/` are readable there. Decided
  2026-10-27: Isak makes it private and takes GitHub Pro so Pages keeps working.

## Next, ranked (evaluation 2026-10-27)

Size S/M/L; risk is what breaks if it goes wrong.

1. Repo private plus GitHub Pro: Isak, in GitHub's settings. S.
2. One safety-scan registry: the editor's Publish check skips `check-player-secrets` and the
   integrity smoke has no variant for it; add an orchestrator test. M. Risk: the editor blocks
   more (the same as CI).
3. One module for DM markup: `check-artifact-shape` looks for `%%` but not `:::dm`. S. Risk: low.
4. `tidemarrow/01`-`03`: first sync, Tidemarrow map, remove the Astrath sample. M.
5. Dev save endpoint as one route table: the loopback gate applied once; `EDITOR_CODE_FINGERPRINTS`
   misses four routes. M. Risk: a gating slip exposes the vault on the LAN.
6. Safety tests: a `10_DmNotesAndSecrets` note end to end; strict exit 3; `archive`,
   `deprecated`, `04_Factions` defaults; CI deploy needs the scan. S each.
7. `code-retro/06`-`08`: note reading module, Sync module with dry run, build core. L.
8. Dependencies: in-range bumps and drop unused `date-fns` (S); Vite 8 with Vitest 5 (L);
   React 19 with react-leaflet 5, Tailwind 4, ESLint 10 (L each). List in the session notes.
9. Smaller: vault image copy follows symlinks and overwrites files; viewer deep links differ on
   Back; save status may stay dirty for other maps; `audit-2026-10/08` (Leaflet `NaN`). S each.

## Waiting on Isak

- The world's new name (`audit-2026-10/05`).
- On the PC: follow `docs/PC-CLEANUP.md` (turn the old routines off first).
