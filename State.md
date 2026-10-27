# State

Updated 2026-10-27 on the Mac. Branch `main`, pushed to GitHub at `a0b5188`.

## Where it stands

- Reworked on 2026-10-27: Matt Pocock's skills installed (`docs/agents/`), goals agreed with Isak
  (`docs/GOALS.md`), ADR-0001 (a note with no visibility is DM-only), tickets in `docs/tracker/`.
- The atlas becomes the players' atlas for the world, Tidemarrow first, filled from the vault by
  Sync from Obsidian. Today it still shows the old Astrath sample (three events).
- The continuous-dev routine is retired; its docs are in `docs/archive/`.
- react-router 7 is on `main` (audit-07). Mac launchers: npm commands only (audit-04).
- Live site: https://thraez.github.io/campaign-atlas-final/. It still serves the portraits
  `Corven.webp` and `Edric.webp` (dm-only NPCs): Vite copies all of `public/` into `dist/`.
- The GitHub repo is public, so the DM notes in `content/` are readable there.

## Branches waiting on Isak (not pushed)

- `fix-dm-image-leak` (from `main`): the player build drops every image under
  `dist/atlas/assets` that the player JSON doesn't name; the image-privacy scan checks the source
  store only for images players see. Gated green on its first base; after the move onto `main`
  it still needs `npm ci` and the full gate.
- `code-retro-fixes`: code-retro 01-04 done (scan titles, Sync title and type, Sync order,
  Staging shows what it writes). Merges into `main` cleanly.

## Next, ranked (evaluation 2026-10-27)

Size S/M/L; risk is what breaks if it goes wrong.

1. Repo visibility: DM content in a public repo. Isak's call. S-M. Risk: hosting change.
2. Merge both branches above and publish. S. Risk: low, all scans green.
3. One safety-scan registry: the editor's Publish check skips `check-player-secrets` and the
   integrity smoke has no variant for it; add an orchestrator test. M. Risk: the editor blocks
   more (the same as CI).
4. One module for DM markup: `check-artifact-shape` looks for `%%` but not `:::dm`. S. Risk: low.
5. `tidemarrow/01`-`03`: first sync, Tidemarrow map, remove the Astrath sample. M.
6. Dev save endpoint as one route table: the loopback gate applied once; `EDITOR_CODE_FINGERPRINTS`
   misses four routes. M. Risk: a gating slip exposes the vault on the LAN.
7. Safety tests: a `10_DmNotesAndSecrets` note end to end; strict exit 3; `archive`,
   `deprecated`, `04_Factions` defaults; CI deploy needs the scan. S each.
8. `code-retro/06`-`08`: note reading module, Sync module with dry run, build core. L.
9. Dependencies: in-range bumps and drop unused `date-fns` (S); Vite 8 with Vitest 5 (L);
   React 19 with react-leaflet 5, Tailwind 4, ESLint 10 (L each). List in the session notes.
10. Smaller: vault image copy follows symlinks and overwrites files; viewer deep links differ on
    Back; save status may stay dirty for other maps; `audit-2026-10/08` (Leaflet `NaN`). S each.

## Waiting on Isak

- The world's new name (`audit-2026-10/05`).
- On the PC: follow `docs/PC-CLEANUP.md` (turn the old routines off first).
