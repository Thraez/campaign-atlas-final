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
2. Done 2026-10-27: 02, 05, 03, 04 and 13 merged into `main` and pushed (9394f85).
3. `eval-2026-10/17`: entity edits stuck after a save conflict. S.
4. `eval-2026-10/08`: editor Save drops world.yaml's `import:` block (Sync's folder map). S.
   Data loss; must land before Tidemarrow's first sync.
5. `eval-2026-10/09`: Publish pushes `main` from any branch. S.
6. `tidemarrow/01`-`03`: first sync, Tidemarrow map, remove the Astrath sample. M.
7. `eval-2026-10/10` player import-graph test, `12` Save refuses missing image bytes. S each.
8. `code-retro/06`-`08`: note reading module, Sync module with dry run, build core. L.
9. `eval-2026-10/11`: pin layer rebuilds on every pan, keystroke and hover. M.
10. `eval-2026-10/07`: Vite 8 with Vitest 5, after Tidemarrow. L.
11. `audit-2026-10/08` (Leaflet `NaN`). S. Parked notes: `docs/tracker/eval-2026-10/README.md`.

Grill round 2 is ticketed on provisional calls (below): `eval-2026-10/14`-`17`. 17 (entity
edits stuck after a 409) ranks ahead of code-retro 06-08.

## Merge queue

Isak's rule, 2026-10-27: sessions may merge their own PRs once checks pass and the code review is
clean, but here every merge into `main` starts the publish workflow, which counts as publishing.
So each PR below is reviewed, gated and waiting for his yes. Merged PRs are logged here.

| PR  | Ticket | What                                       | Waits on                                  |
| --- | ------ | ------------------------------------------ | ----------------------------------------- |
| #57 | 09     | Publish refuses to run off `main`          | Isak's look at the panel message; his yes |
| #58 | 08     | Editor Save keeps world.yaml's other keys  | His yes                                   |
| #59 | 16     | Delete the unreachable entity-editing tabs | His yes (provisional call Q4)             |

Local `main` is ahead of `origin/main` by the tracker commits for 14-18 (not pushed).

## Provisional calls

Isak's rule, 2026-10-27: work never stops on a question. Each open question gets the recommended
answer, logged here and built on; he reviews this list in batches, and a reversal becomes a ticket.

| Date       | Question                                                                                       | Call                                                       | Why                                                            | Ticket |
| ---------- | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | -------------------------------------------------------------- | ------ |
| 2026-10-27 | Q2: one search for palette, Browse and Timeline?                                               | Yes, the palette's syntax on all three                     | The same query finds different notes on different pages        | 14     |
| 2026-10-27 | Q3: editor draws regions and routes in the player style?                                       | Yes, one drawing module; the editor adds handles on top    | What the DM checks should be what players see                  | 15     |
| 2026-10-27 | Q4: delete the unreachable entity-editing tabs?                                                | Yes; the vault owns profiles and relationships             | ~800 lines reached only from tests; git keeps them             | 16     |
| 2026-10-27 | Q5: ticket "one client for canon" now?                                                         | Yes, starting with rebase-on-conflict, ahead of code-retro | A real bug: after a 409 every later save of that entity fails  | 17     |
| 2026-10-27 | eval-16 review: delete the test-only `profileFields.ts` and `buildEntityFrontmatterPatch` too? | Yes, with the tabs                                         | Follows Q4: the vault owns profiles; the build never read them | 16     |

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
