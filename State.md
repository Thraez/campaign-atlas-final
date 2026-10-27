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
- `eval-2026-10/01` and `06` are on `main`: one list of safety scans (`scanRegistry.ts`) for CI,
  the editor's Publish check and the smoke; in-range dependency updates, `date-fns` gone.
- The GitHub repo is public, so the DM notes in `content/` are readable there. Decided
  2026-10-27: Isak makes it private and takes GitHub Pro so Pages keeps working.

## Next, ranked (evaluation 2026-10-27)

Size S/M/L; risk is what breaks if it goes wrong.

1. Repo private plus GitHub Pro: Isak, in GitHub's settings. S.
2. `eval-2026-10/02`: one module for DM markup (the shape scan misses `:::dm`). S.
3. `tidemarrow/01`-`03`: first sync, Tidemarrow map, remove the Astrath sample. M.
4. `eval-2026-10/03`: dev save endpoint as one route table. M. Risk: a gating slip exposes the
   vault on the LAN.
5. `eval-2026-10/04` safety tests, `05` vault image copy. S each.
6. `code-retro/06`-`08`: note reading module, Sync module with dry run, build core. L.
7. `eval-2026-10/07`: Vite 8 with Vitest 5, after Tidemarrow. L. React 19, Tailwind 4 and
   ESLint 10 are parked.
8. `audit-2026-10/08` (Leaflet `NaN`). S. Parked notes: `docs/tracker/eval-2026-10/README.md`.

## Waiting on Isak

- The world's new name (`audit-2026-10/05`).
- On the PC: follow `docs/PC-CLEANUP.md` (turn the old routines off first).
