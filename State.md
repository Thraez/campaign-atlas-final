# State

Updated 2026-10-27 on the Mac. Branch `main`, pushed to GitHub at `5dc85f2`.

## Where it stands

- Reworked on 2026-10-27: Matt Pocock's skills installed (`docs/agents/`), goals agreed with Isak
  (`docs/GOALS.md`), ADR-0001 (a note with no visibility is DM-only), tickets in `docs/tracker/`.
- The atlas becomes the players' atlas for the world, Tidemarrow first, filled from the vault by
  Sync from Obsidian. Today it still shows the old Astrath sample (three events).
- The continuous-dev routine is retired; its docs are in `docs/archive/`.
- Typecheck, lint and `npm run test:ci` pass on the Mac (3,228 tests). The strict player build and
  the secrets scans pass.
- Live site: https://thraez.github.io/campaign-atlas-final/, republished 2026-10-27 without
  Corven, Edric and Soreth (ADR-0001). The first deploy try hit a GitHub token timeout; the re-run passed.

## Next, in order

1. `audit-2026-10/07`: react-router v7 (last moderate audit finding).
2. `audit-2026-10/04`: COMMANDS.md rewritten; waiting on Isak: Mac `.command` launchers or npm commands only (recommended).
3. `code-retro/01`-`04`: safety-scan titles and the Sync bugs.
4. `tidemarrow/01`-`03`: first sync, Tidemarrow map, remove the Astrath sample.
5. `code-retro/06`-`08`: Note reading module, Sync module with dry run, build core.

## Waiting on Isak

- The world's new name (`audit-2026-10/05`).
- On the PC: follow `docs/PC-CLEANUP.md` (turn the old routines off first).
