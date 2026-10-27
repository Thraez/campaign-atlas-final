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

## Morning queue

Isak is away until the morning of 2026-10-28. His rule: commit locally and he pushes `main` in the
morning. Overnight there are no pushes to `main` and no `atlas:publish` (the gate runs its local
parts as separate calls: `atlas:snapshot`, `atlas:build:player`, `build`, `atlas:scan`; the script
itself publishes nothing, but it is on the ask list). Any new PR whose merge would publish stays
open and is listed here. Anything refused is logged here with its command and reason.

Prompts Isak got overnight, and what replaced them: `npm run atlas:publish` (its parts, above);
`git reset --hard` (`git -C <path> checkout -- .`, or remove and re-add the worktree); long chained
commands with shell variables (one plain command per call, absolute paths).

- `main` was pushed once (f65c854..0c1d92a, docs only, on his yes) before this rule arrived.
- PRs waiting for his yes to merge (each merge publishes), in stack order: #62 → #66 → #68;
  #64 → #67 → #69; #63; #65. See "Merge queue" for what each needs him to look at.
- Local `main` commits since 0c1d92a: push them in the morning.
- Code-retro 06 needs a real `npm run atlas:publish` run before it is done (the ticket asks for
  it; overnight only its parts ran).
- Filed overnight: ticket 20 (pin labels keep their first mode across zoom, from the eval-11
  build) and 21-28 from the third sweep. 21-25 and 27 rest on provisional calls below.

## Merge queue

Isak's rule, 2026-10-27: sessions may merge their own PRs once checks pass and the code review is
clean, but here every merge into `main` starts the publish workflow, which counts as publishing.
So each PR below is reviewed, gated and waiting for his yes. Merged PRs are logged here.

| PR  | Ticket | What                                           | Waits on                                       |
| --- | ------ | ---------------------------------------------- | ---------------------------------------------- |
| #62 | 18     | Remove the entity-frontmatter save stream      | His yes                                        |
| #63 | 14     | One search for palette, Browse and Timeline    | Isak tries search (Q2); his yes                |
| #64 | 15     | One drawing module for regions and routes      | Isak's look at the editor map (Q3); yes        |
| #65 | 10     | A test walks the player entry's imports        | His yes                                        |
| #66 | 12     | Save refuses when an image's bytes are missing | #62 (stacked); Isak sees the toast; yes        |
| #67 | 11     | Pin layer stops rebuilding on every change     | #64 (stacked); Isak checks the map by eye; yes |
| #68 | 19     | Map layer uploads always get a real path       | #66 (stacked); Isak tries the path field; yes  |
| #69 | a-08   | The map waits for a size before flying         | #67 (stacked); his yes                         |

In flight (2026-10-28, overnight):

- `code-retro-06-read-note`: three reviews done (Standards, Spec, player safety). The safety
  review found one leak (a `---x` line inside frontmatter now parsed as a key, so a note could
  ship as player) and one place where the build no longer redacts on its own. Fixes are with the
  builder; no PR until they land and the side-by-side check against main shows nothing looser.
- `eval-20-label-mode-zoom`: building, stacked on `audit-08-flyto-zero-size`.
- Code-retro 07 and 08 wait on 06.
  Merged 2026-10-27 on Isak's relayed yes ("Atlas may merge #61 first, then #57, #58, #59 and #60 in
  order, each after its CI re-run is green; the publishes are fine"). Each PR's branch was updated
  from `main`, its CI re-run went green, then it merged and its publish run succeeded:

| PR  | Ticket | Merge commit | Publish run |
| --- | ------ | ------------ | ----------- |
| #61 | -      | 835b1d1      | 40597133351 |
| #57 | 09     | ea4531a      | 40597439999 |
| #58 | 08     | 2cce474      | 40597664295 |
| #59 | 16     | 3573f0c      | 40597942586 |
| #60 | 17     | f65c854      | 40598204511 |

## Provisional calls

Isak's rule, 2026-10-27: work never stops on a question. Each open question gets the recommended
answer, logged here and built on; he reviews this list in batches, and a reversal becomes a ticket.

| Date       | Question                                                                                                | Call                                                       | Why                                                            | Ticket |
| ---------- | ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | -------------------------------------------------------------- | ------ |
| 2026-10-27 | Q2: one search for palette, Browse and Timeline?                                                        | Yes, the palette's syntax on all three                     | The same query finds different notes on different pages        | 14     |
| 2026-10-27 | Q3: editor draws regions and routes in the player style?                                                | Yes, one drawing module; the editor adds handles on top    | What the DM checks should be what players see                  | 15     |
| 2026-10-27 | Q4: delete the unreachable entity-editing tabs?                                                         | Yes; the vault owns profiles and relationships             | ~800 lines reached only from tests; git keeps them             | 16     |
| 2026-10-27 | Q5: ticket "one client for canon" now?                                                                  | Yes, starting with rebase-on-conflict, ahead of code-retro | A real bug: after a 409 every later save of that entity fails  | 17     |
| 2026-10-27 | eval-16 review: delete the test-only `profileFields.ts` and `buildEntityFrontmatterPatch` too?          | Yes, with the tabs                                         | Follows Q4: the vault owns profiles; the build never read them | 16     |
| 2026-10-28 | eval-19 review: may a DM type a map layer path outside `assets/maps/`?                                  | No; it falls back to the default under maps/               | Maps stay lossless; a `.webp` name under images/ would convert | 19     |
| 2026-10-28 | code-retro 06 review: may one badly formed note anywhere (`_dm/`, `_drafts/` too) stop the publish?     | Yes; fail closed                                           | A note the build can't read can't be shown safe                | c-06   |
| 2026-10-28 | Sweep 3 Q1: `maps:optimize` stays lossless (PNG to lossless WebP, JPG copied as is)?                    | Yes; tidemarrow/02 reworded                                | Lossy re-encoding smears labels and fog edges                  | 22     |
| 2026-10-28 | Sweep 3 Q2: a saved "sound on" unlocks audio on the first tap anywhere?                                 | Yes; the invite shows until then                           | Browsers block audio until a user gesture                      | 21     |
| 2026-10-28 | Sweep 3 Q3: the PR check and publish both run `test:ci`; publish is gated on tests?                     | Yes (about 3 min more per publish)                         | A merge in GitHub skips the hook, so publish trusts nothing    | 24     |
| 2026-10-28 | Sweep 3 Q4: calm mode becomes the one "reduce motion" switch (map, ocean, transitions)?                 | Yes; moved out of sound settings, OR'd with the OS setting | Calm mode stops the waves but not the map's flights            | 27     |
| 2026-10-28 | Sweep 3 Q5: the offline menu claims only what is stored; install caches atlas.json and the current map? | Yes; portraits and audio stay cached on visit              | Precaching every picture makes the install too heavy           | 25     |

## Retro, 2026-10-28 (overnight)

- Merged and published: #61, #57, #58, #59, #60, each after a fresh CI run on top of the one
  before. Opened overnight: #63-#69, all reviewed and gated; each waits on Isak because a merge
  publishes.
- The adversarial player-safety review (a third lens, run side by side against main's logic) found
  a leak the Standards and Spec reviews both missed. Keep it for anything that touches
  visibility, parsing or the scans.
- Builders marked tickets done before review three times. The brief now says "review pending",
  and the status is set after review.
- Stacking branches that touch the same file (AtlasViewer, buildSaveBatch) kept the work
  conflict-free, but merge order now matters: see the Morning queue.
- Friction: permission prompts from `atlas:publish`, `git reset --hard` and chained commands with
  shell variables. All three are replaced (Morning queue).
- Third sweep: 5 verified bugs (sound after reload, lossy `maps:optimize`, crossfade race, offline
  menu, timeline year 0) were found in areas no earlier sweep looked at. Areas not yet swept:
  none left from the list; next is a second pass on the editor page itself (110 KB).

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
