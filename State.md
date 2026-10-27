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

## Next, ranked (evaluation 2026-10-27, second sweep)

Size S/M/L; risk is what breaks if it goes wrong. Branches are pushed but not on `main`; merging
needs Isak's yes.

1. Repo private plus GitHub Pro: Isak, in GitHub's settings. S.
2. Merge the finished branches, in order: `eval-02-dm-markup`, `eval-05-vault-image-copy`, then
   `eval-03-route-table` (built on 05) and `eval-04-safety-tests` once reviewed.
3. `eval-2026-10/13`: Sync's vault scan fails in every real browser (`ok` missing from the
   reply, since June), and default Sync imports DM folders into `content/`. S. Blocks Tidemarrow.
4. `eval-2026-10/08`: editor Save drops world.yaml's `import:` block (Sync's folder map). S.
   Data loss; must land before Tidemarrow's first sync.
5. `eval-2026-10/09`: Publish pushes `main` from any branch. S.
6. `tidemarrow/01`-`03`: first sync, Tidemarrow map, remove the Astrath sample. M.
7. `eval-2026-10/10` player import-graph test, `12` Save refuses missing image bytes. S each.
8. `code-retro/06`-`08`: note reading module, Sync module with dry run, build core. L.
9. `eval-2026-10/11`: pin layer rebuilds on every pan, keystroke and hover. M.
10. `eval-2026-10/07`: Vite 8 with Vitest 5, after Tidemarrow. L.
11. `audit-2026-10/08` (Leaflet `NaN`). S. Parked notes: `docs/tracker/eval-2026-10/README.md`.

Waiting on a decision (grill round 2): one search module for palette, Browse and Timeline;
the editor drawing regions in the player style; deleting the unreachable entity-editing tabs
(~800 lines plus `validatePatch.ts`); promoting the "one client for canon" note (entity edits
get stuck after a 409) to a ticket ahead of code-retro 06-08.

## Retro, 2026-10-27

- Shipped to `main`: the portrait leak fix (live, verified 404), react-router 7, npm audit fix,
  the scan registry (01) and dependency updates (06). On branches: 02, 05; 03 and 04 in progress.
- The two-axis review paid for itself each time: it found a lone `%%` that could ship, three
  hand-written DM regexes the refactor missed, and image encode settings outside
  `imageEncoding.ts`.
- Reviewer and sweep claims need a spot check: one "case-sensitive search" bug was false (the
  index body is lowercased on load), the world.yaml and Publish findings were real.
- Friction: a main-wide reformat caused a merge conflict; stale `node_modules` broke the commit
  hook until `npm ci`. Run `npm ci` after a dependency merge.

## Waiting on Isak

- The world's new name (`audit-2026-10/05`).
- On the PC: follow `docs/PC-CLEANUP.md` (turn the old routines off first).
