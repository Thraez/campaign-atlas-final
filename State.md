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
- PRs #62-#82 wait for his yes to merge (each merge publishes). The order is under "Merge order"
  below.
- Local `main` commits since 0c1d92a: push them in the morning.

### Merge order for #62-#82 (one yes covers the list)

Push local `main` first: every overnight branch carries its docs commits, so each diff shrinks to
its own work. The repo merges with merge commits, and the publish workflow cancels a run still in
progress when a newer one starts (`cancel-in-progress`). So a run of merges ends in one
publish of the last state. For each PR: retarget it to `main` once its parent has merged, bring
`main` in, wait for the PR check, then merge. **Stop at the first conflict or red check** and
leave the rest for Isak (AGENTS.md: never resolve a merge conflict unattended).

1. **#75**: one test runner, and publish runs the tests. First, so every later merge's publish
   runs the suite.
2. **#82's safety fix, early:** #74 → #76 → #82. Before #74 merges, Isak runs `npm run
   atlas:publish` once on the #74 branch, as its ticket asks.
3. **#79** (sync safety), stacked on #74. It conflicts with #82 in `src/test/sync-safety.test.ts`;
   #82 changed a few lines there and #79 rewrote the file. Resolve on #79's branch by keeping
   #79's version with #82's in-process `buildPlayer` helper and node pragma. That conflict is the
   one place this list needs Isak.
4. Save stack: **#62 → #66 → #68 → #80 → #81**.
5. Drawing stack: **#64 → #67 → #69 → #70**. It touches `AtlasPlacementEditor.tsx`, as the save
   stack does, in different hunks; a conflict here means stop.
6. Independent: **#65** (player import graph), **#72** (maps lossless), **#63** (one search),
   **#78** (offline menu).
7. Sound stack: **#71 → #73 → #77**.

Needs Isak's eyes before or after the merge (each is in "Merge queue"):
- #63: search;
- #64 and #67: the editor map;
- #66: the toast;
- #68: the path field;
- #70: zooming pin labels;
- #71: a reload with sound on, on desktop and phone;
- #78: offline in a browser;
- #79: the Sync panel;
- #80 and #81: the chip and the conflict notice.

None of these blocks a merge: each is a look-and-feel check, and a bad result becomes a ticket.
Once the stacks are in, tickets 27, 29 and 30 are unblocked; build 30 first (it fixes data loss).
- **In the vault, for Isak in Obsidian:** four notes have an unclosed DM block (`%%` or `:::dm`),
  so the DM build refuses them after a sync: blood-moon-circle, the-sovereign-eternal,
  sister-peline-thrace, the-penitent-of-harkafell. Found by the code-retro 07 sync-twice run (read
  only; nothing in the vault was changed).
- **Safety, already on `main`** (found in the code-retro 07 review, fixed in PR #79):
  until it merges, a vault note marked `visibility: dm` whose title matches a player entity syncs
  as a ticked update with no warning, and the written file stays `player` with the secret body.
  Untick such rows in the Sync panel by hand. Also on `main`: a crafted `atlas.id` can make the
  image copy write outside `public/` (only someone who can write the vault can do this).
- **Safety, already on `main`** (found in the code-retro 08 review, fixed in PR #82): a
  build that fails a check (e.g. an unclosed `%%` in a player note) still writes `atlas.json` and
  `search-index.json` first, with the leaked text. The editor's player rebuild writes into
  `public/atlas/`, which is committed. Before committing `public/atlas/` after a failed build, run
  `git checkout -- public/atlas`. The committed copy scanned clean at 04:50.
- Code-retro 06 needs a real `npm run atlas:publish` run before it is done (the ticket asks for
  it; overnight only its parts ran).
- Filed overnight: ticket 20 (pin labels keep their first mode across zoom, from the eval-11
  build) and 21-28 from the third sweep. 21-25 and 27 rest on provisional calls below.
- Overnight branches (#71 onward) are cut from local `main`, because tickets 20-29 exist only
  there. Their PRs show the unpushed docs commits too; once `main` is pushed, each PR's diff
  shrinks to its own commits.

## Merge queue

Isak's rule, 2026-10-27: sessions may merge their own PRs once checks pass and the code review is
clean, but here every merge into `main` starts the publish workflow, which counts as publishing.
So each PR below is reviewed, gated and waiting for his yes. Merged PRs are logged here.

| PR  | Ticket | What                                                     | Waits on                                         |
| --- | ------ | -------------------------------------------------------- | ------------------------------------------------ |
| #62 | 18     | Remove the entity-frontmatter save stream                | His yes                                          |
| #63 | 14     | One search for palette, Browse and Timeline              | Isak tries search (Q2); his yes                  |
| #64 | 15     | One drawing module for regions and routes                | Isak's look at the editor map (Q3); yes          |
| #65 | 10     | A test walks the player entry's imports                  | His yes                                          |
| #66 | 12     | Save refuses when an image's bytes are missing           | #62 (stacked); Isak sees the toast; yes          |
| #67 | 11     | Pin layer stops rebuilding on every change               | #64 (stacked); Isak checks the map by eye; yes   |
| #68 | 19     | Map layer uploads always get a real path                 | #66 (stacked); Isak tries the path field; yes    |
| #69 | a-08   | The map waits for a size before flying                   | #67 (stacked); his yes                           |
| #70 | 20     | Pin labels switch mode when the zoom changes             | #69 (stacked); Isak zooms and looks; yes         |
| #71 | 21     | Sound comes back after a reload                          | Isak reloads with sound on (desktop, phone); yes |
| #72 | 22     | `maps:optimize` keeps maps lossless                      | His yes                                          |
| #73 | 23     | The newest soundscape request always wins                | #71 (stacked); his yes                           |
| #74 | c-06   | One module reads a note; bad frontmatter stops the build | A real `atlas:publish` run first; his yes        |
| #75 | 24     | One test runner for the PR check, publish and the hook   | His yes (publish gains a `test` job, ~3 min)     |
| #76 | 26     | Timeline: undated events get their own last group        | #74 (stacked); his yes                           |
| #77 | 28     | Sound URLs follow the image asset rule (`/atlas/` fix)   | #73 (stacked); his yes                           |
| #78 | 25     | The offline menu says what is actually saved             | Isak tries it offline in a browser; his yes      |
| #79 | c-07   | Sync behind a vault port + dry run; sync can't leak a DM note | #74 (stacked); Isak tries the Sync panel; yes |
| #82 | c-08   | Build returns the atlas; one projection; failed build writes nothing | #76 (stacked); conflicts with #79 in sync-safety.test.ts; yes |
| #80 | 31     | The Save chip names an unsaved entity edit               | #68 (stacked); Isak checks the chip; yes         |
| #81 | 32     | A world.yaml conflict recovers and names what changed    | #80 (stacked); Isak reads the notice; yes        |

In flight (2026-10-28, overnight):

- Code-retro 06 is PR #74. Two safety reviews each found a leak (a `---x` key; front matter the
  new parser dropped, so a secret's name went unredacted). Both are fixed and the second repro
  now stops the build on the file.
- Ticket 25 is PR #78: all 12 review fixes passed a re-review; one more fix (a failed layer
  no longer re-triggers the auto-save on every load).
- #75's own CI run passed (scan and all 4 `test:shard` jobs), so the new shard entry works on
  GitHub.
- Ticket 26 is PR #76, stacked on #74. `code-retro-07-sync-module` is building, also on #74.
  Code-retro 08 builds next, stacked on #76.
- Ticket 28 reproduced (sound broke at `/atlas/`, the editor manifest lost the base path) and is
  PR #77, stacked on #73.
- Code-retro 07 is PR #79 (e6805a5). The safety review found two pre-existing sync bugs, and its
  re-check found a third route (`publish: false`). All are fixed, with a 144-case secrecy test.
- Fourth sweep (editor page, second pass) filed 30-32. 30 is the worst find tonight: saving on one
  map silently drops region, route and fog drafts on other maps, and undo after a map switch edits
  the wrong map. Until it ships, save before switching maps. 30 waits for the editor stacks
  (#62→#66→#68 and #64→…→#70). 31 and 32 are PRs #80 and #81, stacked on #68.
- Stacked PRs get no CI until they're retargeted to `main` (the PR check runs only on PRs into
  `main`); each passed the local gate.
- Ticket 27 (one reduce-motion switch, shared filter chips) waits until the open stacks merge: it
  touches sound (#71, #73), the viewer (#67-#70, 25) and Timeline/Browse/search (#63, 26).
- A local-only branch `eval-24-test-runner` (932edc8) sits in an agent worktree, never pushed;
  it can be deleted.
- Code-retro 08 (build core) waits on 26 (both change `build-atlas.ts`).
- Ticket 29 waits on #68 and #72 (both touch the save pipeline's map path).
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

| 2026-10-28 | eval-22 review: may the editor re-encode a JPG map lossy to strip its metadata? | No; drop the metadata segments, keep the image data | Maps stay lossless; one more q85 pass smears labels | 29 |
| 2026-10-28 | eval-22 review: may `maps:optimize` delete the PNG once its WebP twin is in place and repointed? | Yes, as `images:optimize` does; git keeps it | Otherwise every map ships twice and every run re-encodes | 22 |
| 2026-10-28 | eval-21 review: should Dismiss on the "resume sound" invite leave sound off? | Yes; taps on the invite's own buttons don't count as the gesture | Dismiss has to mean no sound | 21 |
| 2026-10-28 | eval-21: does a bed set up while muted or in a hidden tab ("paused") count as playing? | Yes; the label can't show while muted anyway | Otherwise unmuting doesn't bring the label back until a pan | 21 |
| 2026-10-28 | eval-22: sharp 0.34.5 has no WebP `exact`; what happens to a PNG with colour under transparent pixels? | Skipped by the script, refused by Save; nothing converts unless all 4 channels match | Lossless must mean exact; a sharp bump can lift it later | 22 |
| 2026-10-28 | eval-24 review: should the PR check keep its 4 parallel shard jobs? | Yes; each job calls a per-shard entry of the same runner; publish runs `test:ci` | One runner and retry rule, without making every PR wait for the shards one after another | 24 |
| 2026-10-28 | eval-25 review: does "installing" mean the service-worker install, or a menu click? | The SW install: each new worker saves `atlas.json`, the search index and the current map; the menu item stays for other maps | Q5's reason ("too heavy") is about an automatic install; a new deploy also refreshes the saved map | 25 |
| 2026-10-28 | eval-25 review: may "Clear offline cache" keep the app shell? | Yes; the label stays and says the app itself stays | Deleting the shell left the menu stuck until a new worker installed | 25 |
| 2026-10-28 | code-retro 07 review: Staging now gets the sync map (match by sync map, type-conflict hold): keep it? | Yes; check it in the Sync panel | The editor never ran either check before; a renamed note now keeps its id | c-07 |
| 2026-10-28 | code-retro 07 safety fix: hold every vault note more secret than its player entity, including untagged notes in DM-default folders (many `03_Entities` rows)? | Yes; the DM ticks them, or tags them `player` in the vault | A held row costs a click; a wrong tick leaks a secret | c-07 |
| 2026-10-28 | Sweep 4: one save writes every map's drafts (rather than blocking map switches while dirty)? | Yes | All maps share one world.yaml; blocking switches would get in the DM's way | 30 |
| 2026-10-28 | Sweep 4: undoing an edit made on another map switches to that map first? | Yes | Refusing would strand the undo stack; applying it in place corrupts the other map | 30 |
| 2026-10-28 | Sweep 4: Save with only an entity edit pending points to the entity panel rather than saving it? | Yes | The entity panel owns that save and its conflict handling (ticket 17) | 31 |

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
- Later in the night: PRs #70-#82 opened, none merged. The safety lens found four player-safety
  bugs that were already live on `main`. Three were in sync: a dm note overwriting a player
  entity, an image path escaping its folder, and a `publish: false` bypass. The fourth: a failed
  build still wrote the player atlas. All four are fixed on branches (#79, #82) with workarounds
  in the Morning queue. The Standards and Spec reviews caught none of them.
- The `publish: false` bypass got past a case-by-case fix and fell to a 144-case invariant test
  (write, read back, never more visible than the source). For anything that touches visibility,
  brief the builder for the invariant test from the start.
- Re-run the safety lens on its own fixes: two of three re-checks found something.
- Stacked PRs get no CI (the PR check runs only on PRs into `main`); the local gate is all they
  have until they're retargeted.
- A usage limit stopped four agents at once around 03:00. Each resumed from where it stopped once
  the limit reset.
- Sweep 4 (editor page) found a data-loss bug, ticket 30, that waits on the editor stacks. Every
  area has now been swept once, the editor twice. With 27, 29 and 30 blocked, the next work is
  merging the stacks.

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
