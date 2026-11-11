# State

Updated 2026-11-11 on the Mac. Branch `main` (= origin/main 3ea4ef44). Phase 3 tickets written.

## Rebuild queue

The atlas is being rebuilt (option B, approved 2026-11-07, ADR-0002): new editor and map model
(schema v2) in this repo behind `__INCLUDE_EDITOR__`; pipeline, scans, Sync and tests stay. Full plan,
goals and progress: `docs/rebuild-2026-11/` on branch `rebuild-plan-2026-11` (not on main). Every
ticket merges on `npm run gate` plus an Opus review; a push or merge needs Isak's yes in the chat.

### Phases (about 80-95 sessions, 7-9 months at light pace)

| Phase | Goal | Verified by | State |
|---|---|---|---|
| 0 Guard and quick wins | R-01 Sync guard, scans on real artifacts, Q-01..Q-04 | Links that work, a fitted map, the menu above the map, a region card. **Safe stop** | done |
| 1 Spine and PRs | The other PRs, R-02..R-06, ADR-0001 addendum, ADR-0002 | A publish log with every scan reading `dist`; `docs/GOALS.md` agreed | done |
| 2 Schema v2 and campaigns in the pipeline | R-10..R-20, ADR-0003, ADR-0004 | `npm run atlas:tree` on the v2 test world, per campaign; today's site unchanged | done (R-10, R-11a, R-11b, R-11c, R-11d, R-12, R-15, R-16, R-07b, R-13, R-11e, R-14, R-17, R-07, R-17b, R-18, R-19, R-20 done) |
| 3 Shared canvas | Ocean/frame/map-tree component; viewer on it; campaign links | Ocean > continent > city > back on the local test world. **Safe stop** | in progress (R-30..R-36 written 2026-11-11) |
| 4 Editor core | Router, command store, E0-E5, Place pin, E9, Draw route with distance/time; v2 test world only; ADR-0005, ADR-0006 | Add a map inside a map, pin it, draw a route, reload | - |
| 5 Story | Region card and story panel, monument strip, people and Inside lists, route labels, deep links, Browse, Timeline, Credits, Landing on v2 | Read a region, a person, a monument; follow three links | - |
| 6 Editor jobs, parity, cutover | E13, E6, E7, E8, E10 Sync, E11, E12, parity items; cutover last | Every job on the parity list in the new editor. **Safe stop** | - |
| H Private hosting | H-01..H-04, ADR-0007; Cloudflare Pages per campaign, repo Private | Each campaign site refuses a stranger; repo Private | trigger below |
| 7 Retire | Delete the old editor, the v1 path, the down-migration, arch-06 | `grep` finds no `AtlasPlacementEditor`, `worlds[0]`, `placementOverrides` | - |
| T Tiles (only if triggered) | Pyramid step; fog scan replaced in the same PR; ADR-0008 | A real map over about 8k px that was slow on a phone, now smooth | - |

Safe stops: after phase 3 (the viewer shows the ocean and map tree on the local test world; the live
v1 site is unchanged) and after phase 6 (new editor at parity, old one retired next). Phase 0 was
also a stop. Phase 3 and 4 tickets are written before phase 2 ends.

Phase H runs before the first real Sync (`tidemarrow/01`), which stays blocked by H-04 (R-01's
guard refuses a real Sync while `hosting: public`). Earliest after phase 2, blocks no other phase.
Phase T starts only on a measured problem on a real map.

### PR outcomes (all merged and published)

| What | PRs |
|---|---|
| Phase 0 | #111 R-01 Sync refuses while hosting is public, #112 Q-01 broken wikilinks are plain text, #113 Q-02 maps open fitted, #114 Q-03 editor menu above the map, #115 Q-04 region hover card |
| The 12 older PRs, in merge order | #109, #110, #99, #100, #106, #102, #103, #107, #104, #105, #108, #101 |
| Phase 1 so far | #116 R-02 a missing world.yaml visibility is dm, #117 R-03 scans fail on a missing artifact, #118 R-04 adopt the rebuild goals (ADR-0002), #119 docs follow-up, #120 R-06 player build no longer names DM-only regions and routes in warnings, #121 R-05 this queue |
| Phase 2 so far | #122 phase 2 tickets and ADRs, #123 R-10 schema v2 types (ADR-0003, ADR-0004 accepted), #124 R-12 v2 loader and v1 adapter, R-11a per-campaign resolver (this PR) |

The plan offered closing the four moot PRs (#99, #103, #105, #107) to save gate runs; Isak chose to
merge all twelve, and they are in. They are superseded when the old editor retires (phase 7).

Phase 1 is done (2026-11-08). R-06 came out of the R-02 review: world.yaml warnings and warnings
about routes the player build drops named DM-only ids in the player `atlas.json`; now a count line.
Follow-up noted in its ticket: no scan derives DM region/route ids, so none would catch this class.

### Phase 2, in order (tickets in `docs/tracker/rebuild-2026-11/`, see its `README.md`)

| Ticket | What | Blocked by |
|---|---|---|
| R-10 | Schema v2 types (done, #123) | R-04 (done); Isak accepts ADR-0003, ADR-0004 |
| R-11a | Pure per-campaign resolver (also arch-08's secret-note predicate) (done) | R-10 |
| R-11b | Build calls the resolver (also arch-02, sound areas in fog) (done) | R-11a, R-12 |
| R-11c | Old Publish Check calls the resolver (done) | R-11a, R-12 |
| R-11d | Link redaction from wikilink tokens (arch-08's other half) (done) | R-11a |
| R-11e | A hidden region hides what is inside or reaching into it (ADR-0004 rule 9) (done) | R-11a |
| R-12 | v2 loader and the one v1 adapter (v1 only with no `schemaVersion` or `1`; a mix fails) (done, #124) | R-10 |
| R-07b | Loader drops fog shapes (conceals) (done) | - |
| R-13 | Build assembles every world and the map tree (done) | R-11b, R-12 |
| R-14 | Sync targets any world (done) | R-13 |
| R-15 | Scan registry lists campaign dirs (done) | R-03 (done), R-12 |
| R-16 | Three-level test world, two campaigns (done) (`content-next/`, `npm run atlas:tree`) | R-12, R-11a |
| R-17 | One player output per campaign: visibility (done) | R-13, R-15, R-16, R-11e |
| R-17b | Structural campaign isolation scan (done) | R-17 |
| R-18 | Fog baked per campaign; fog scan source-driven (done) | R-17, R-17b |
| R-19 | Publish runs every campaign (done) | R-17, R-17b |
| R-20 | Migration script and down-migration, dry run only (done) | R-17, R-18 |

Tickets R-10..R-20 (with R-11d and R-17b) are written, with ADR-0003 (schema v2: ocean, map tree, campaign files) and
ADR-0004 (per-campaign resolver and outputs), both `proposed`. Isak accepted every
"Open for Isak" recommendation and the three fail-closed rules (2026-11-08). Next: R-10, then R-11a and R-12
side by side. Phase H tickets, for later: H-01 Cloudflare
Pages per campaign (after R-19), H-02 Access test, H-03 pre-switch safety check, H-04 the switch
(Isak's clicks; unblocks `tidemarrow/01`).

### Phase 3, in order (tickets in `docs/tracker/rebuild-2026-11/issues/`)

Written 2026-11-11 by the phase 3 coordinator from plan.md, ux-flows.md (p1, p2, p5-p7), the player
wireframe, ADR-0003 and ADR-0004. Built one ticket at a time, each in its own worktree; the
orchestrating session (local_a8dba6ed-82b1-48f6-800e-b9733658539e) opens and merges each PR. Provisional calls are in the table below
("Phase 3 tickets"). Phase 4 waits for Isak to accept ADR-0005 and ADR-0006.

| Ticket | What | Blocked by | Model | State |
|---|---|---|---|---|
| R-30 | Map tree and ocean geometry in the app (pure), `atlasGuard` checks v2 fields | - | Sonnet | done (#143) |
| R-31 | The shared canvas `AtlasCanvas`: the ocean and one map with child frames | R-30 | Opus | in review |
| R-32 | Zoom handoff: ocean > map > child > back, with hysteresis | R-30, R-31 | Opus | in review |
| R-33 | The player viewer on the canvas, breadcrumb; v1 site looks as today | R-32, R-34 | Sonnet | ready (review clean) |
| R-34 | Serve the test world's campaign sites locally, with a picker | R-30 | Opus | ready (review clean) |
| R-35 | Campaign links: `c=` and "Not found in this campaign" | R-33, R-34 | Sonnet | in review |
| R-36 | Phase 3 check: Ocean > continent > city > back (playtester) | R-35 | Sonnet | - |

### Kept notes

Cleaned 2026-11-07 (Isak: delete unless meaningful): branch `local-main-backup-2026-11-07` held two
State.md commits about PRs since merged (#83-#89); deleted, tip kept as tag
`archive/local-main-backup-2026-11-07` (pushed). `stash@{0}` is kept only for its
`.claude/settings.json` change (drops the `atlas:publish` ask rule; not applied, Isak's call); its
State.md part is the same stale notes. Drop it once Isak decides the settings change.

## Where it stands

- Reworked on 2026-10-27: Matt Pocock's skills installed (`docs/agents/`), goals agreed with Isak
  (`docs/GOALS.md`), ADR-0001 (a note with no visibility is DM-only), tickets in `docs/tracker/`.
- The atlas becomes the players' atlas for the world, Tidemarrow first, filled from the vault by
  Sync from Obsidian. Today it still shows the old Astrath sample (three events).
- Live site: https://thraez.github.io/campaign-atlas-final/. Every PR up to #119 is merged and
  published. The player build ships only allowed files (eval 40).
- Merges run on the full local gate plus an Opus review, without GitHub CI (`docs/agents/workflow.md`).
  The PR check runs only by hand (#90).
- 2026-11-07 improvement loop (retro, architecture review, simplify): no rewrite. The editor page is
  wiring around tested pure modules; extraction beats a rewrite. It built eight tickets (all merged); what's left is under "Open work".

- Main has R-11c (PR #129) and the R-07b/R-11e ticket docs with ADR-0004 rule 9 (PR #131). R-07b is
  done on its branch `rebuild-r07b-fog-conceals`, not merged yet.

## Open work

R-17b (done): `npm run atlas:check-isolation` scans v2 per-campaign outputs (exit 23 structural,
24 text, 25 assets, 20 missing) and recomputes must-not-ship from the content. It runs on real
content once R-19 wires publish to v2. R-18 (done): fog is baked into each campaign's store; `redactLayer` now zeroes colour under fog
(before, hidden pixels kept their RGB under alpha 0; no live fog was affected); `check-fog-safety` exit 27
fails colour under fog. R-19 (done): `atlas:publish` builds and scans every campaign's site in
`dist-campaigns/<id>` (isolation, fog, site identity per campaign); a failure partway leaves earlier
sites built but unscanned, so a deploy must depend on publish's exit code (see the R-19 ticket, "For H-01").
R-20 (done): `npm run atlas:migrate-v2` plans v1 -> v2 (dry run by default; `--check` compares
player, DM and round-trip output; `--out` writes a fresh copy only after the check passes, never into
the content root or an Obsidian vault). The real migration of `content/` is Isak's call.

For Isak (decide before the cutover):
- ADR-0003 addendum: v2 output emits per-map `zoom {min, max}` (R-32, provisional), and the
  rotation pivot is the centre (R-30, provisional).
- H-01: the deploy must depend on `atlas:publish`'s exit code (a failure partway leaves earlier
  campaign sites built but unscanned; R-19 ticket, "For H-01").
- Running the real migration of `content/` (and later the vault).
- Pin `label` and pin style have no v2 field: the migration refuses a shipping pin that has one
  unless `--allow-drop-pin-style`. Today's content has none. Keep them in v2, or drop them?
- A map with no scale is refused, not given one; the ocean places maps side by side; assets are
  copied in place and move at the cutover.
- Deleting the old `.atlas-campaigns/`.
Since R-17b, each `must-not-ship.json` `pinLocations` entry carries `note` (the dropped pin's
note), and the isolation scan flags only that note at that spot.

Lowest number first within each folder.

- Rebuild: phase 2 next; Isak decides when it starts (Rebuild queue above).
- Hidden map and world names in note bodies (e.g. `[[Hookhaven]]`): since R-17 a link to one is
  redacted to `…` (and fails `--strict`, exit 8); a plain-text mention fails every v2 player
  build (exit 12) and `check-derived-secrets` through the campaign's `must-not-ship.json`.
  R-17b's isolation scan reads the same file.
- An `.atlas-campaigns/` left by a build before R-17's review fixes has no `.atlas-campaigns-root`
  marker, so the player build refuses it: delete it once.
- Phase H follow-up (from R-35): campaigns sharing one origin would share localStorage, character key included.
- Sync follow-ups from R-14: (a) the map-import wizard (`mapImport.ts`, `MapImportWizard.tsx`) still
  reads `defaultWorldId`; rework it to pick a world, then widen the default-world tripwire to
  `src/atlas/import`. (b) Sync writes notes before saving the sync map; with no DM build it fails
  with `SyncMapNotSavedError` (notes saved, map not). A pre-check needs a new `VaultPort` method.
  (c) The sync-map file lock is `wx`-file based; a three-way stale-lock collision fails loudly
  (`SyncMapLockContentionError`) but can drop the moved live lock. Also, if the lock holder finishes
  inside the rename-to-link window, the put-back leaves an orphan lock that blocks saves for up to
  30 s. Local, single-DM tool: low risk.
  (d) `src/atlas/import/useMdImportFlow.ts:260-262`: a `SyncMapNotSavedError` falls into the
  generic "Import failed" toast; the modal stays open and `onImported()` isn't called, so pressing
  Import again gives an already-exists conflict. It needs its own `instanceof` branch that warns,
  closes the modal and reloads.
- `arch-2026-11/` (architecture pass): ranked tickets 02-09 in its `README.md`. The rebuild folds
  02 (sound areas inside fog ship) into R-11b and 08 into R-11a and R-11d: build them there, not here. 07 merged (#110: an invalid world.yaml visibility loads
  as `dm`).
- Next, by payoff (from the improvement loop; no ticket yet unless numbered). The Rebuild queue
  comes first; take these only if still needed. 1 and 5 are largely superseded (the editor rebuild,
  R-13 build stages):
  1. `eval-2026-10/39` (one canon client): touches the save plugin that #102 changed.
  2. Editor and player pin anchors differ by about 8px: needs Isak's look.
  3. A WebP map keeps its EXIF/XMP in the editor upload and the wizard's zip until
     `check-image-privacy` (found in 48).
  4. `sessionHasWork` counts a world settings override for any world id, the unsaved count only the
     active one (found in 47).
  5. Later, L: map-space module and markers.json converter (tidemarrow/02), a draft registry
     (reopen code-retro 09; it would absorb 44/45/47-style gaps; pin overrides and map metadata
     could move to `useUndoableState`), build-atlas stages.
- Fog editor follow-up: the editor should refuse fog shapes that become flat after integer rounding
  (the build now rejects them). A shape that runs back along itself (A,B,C,B) still passes the
  loader's checks.
- `tidemarrow/01`-`03`: first sync, Tidemarrow map, remove the Astrath sample. Blocked by H-04
  (Phase H).
- `eval-2026-10/07`: Vite 8 with Vitest 5, after Tidemarrow.
- `agent-retro/03` (no scheduled CI): Isak decides what GitHub Actions may still spend.
- Parked notes: `docs/tracker/eval-2026-10/README.md`.

## Waiting on Isak

- The world's new name (`audit-2026-10/05`): undecided; Astrath Deep Realm for now, and Isak isn't
  keen on it.
- In the vault, in Obsidian: four notes have an unclosed DM block (`%%` or `:::dm`), so the build
  refuses them after a sync: blood-moon-circle, the-sovereign-eternal, sister-peline-thrace,
  the-penitent-of-harkafell.
- Look-and-feel checks on merged work (a bad result becomes a ticket): search (#63), the editor map
  (#64, #67), the missing-bytes toast (#66), the layer path field (#68), zooming pin labels (#70),
  a reload with sound on, desktop and phone (#71), offline in a browser (#78), the Sync panel (#79),
  the Save chip and the conflict notice (#80, #81), the "Sync is off while the repo is public"
  toast on a Sync commit (R-01); the fit on open and no view jump after an editor save (Q-02); the
  editor menu above the map (Q-03); a region card on hover (Q-04); eval-30 (#92): draw on two maps,
  save once, reload, both keep their edits. After #99: delete a pin on map B, switch to map A, save,
  reload; the pin stays gone. After #104: the calm-mode button in the map toolbar (look and place).
  After #105: start a route with the ruler on; one click adds one vertex and no ruler point. After
  #103: rename the world, edit the calendar, Discard all; both go back. After #107: change one
  map's soundscape, switch maps, save; only that map changes. After R-32, zoom feel: in
  `/__canvas?c=main` (and `&rotated=1`), wheel and pinch from the ocean into Quessaly, Oskmark and
  Brindlecross and back out. Check:
  - it feels like one zoom
  - half a level of hysteresis is enough and not too much
  - the art switching from parent to child at the handoff reads well
  - a rotated map turning square as you enter it reads well
  Screenshots: `previews/r32/` in the R-32 worktree.
- Look at fog once it is switched on (today's content has none): redaction now uses a sharp mask
  (alpha = min(sharp, blurred)), so a thin dark seam can show where two reveals share an edge that
  falls off a pixel boundary; and `featherPx` is in image pixels, so on scaled layers the soft edge
  looks about 20x wider on the map than the number suggests.
- Agents were denied reads under `node_modules` (an unknown deny rule); worth a look.
- On the PC: follow `docs/PC-CLEANUP.md` (turn the old routines off first).

## Provisional calls

Isak's rule, 2026-10-27: work never stops on a question. Each open question gets the recommended
answer, logged here and built on; he reviews this list in batches, and a reversal becomes a ticket.

All calls below were kept by Isak on 2026-11-07 (batch review: "Keep all").

| Date       | Question                                                                                                                                                      | Call                                                                                                                         | Why                                                                                                                                    | Ticket |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| 2026-10-27 | Q2: one search for palette, Browse and Timeline?                                                                                                              | Yes, the palette's syntax on all three                                                                                       | The same query finds different notes on different pages                                                                                | 14     |
| 2026-10-27 | Q3: editor draws regions and routes in the player style?                                                                                                      | Yes, one drawing module; the editor adds handles on top                                                                      | What the DM checks should be what players see                                                                                          | 15     |
| 2026-10-27 | Q4: delete the unreachable entity-editing tabs?                                                                                                               | Yes; the vault owns profiles and relationships                                                                               | ~800 lines reached only from tests; git keeps them                                                                                     | 16     |
| 2026-10-27 | Q5: ticket "one client for canon" now?                                                                                                                        | Yes, starting with rebase-on-conflict, ahead of code-retro                                                                   | A real bug: after a 409 every later save of that entity fails                                                                          | 17     |
| 2026-10-27 | eval-16 review: delete the test-only `profileFields.ts` and `buildEntityFrontmatterPatch` too?                                                                | Yes, with the tabs                                                                                                           | Follows Q4: the vault owns profiles; the build never read them                                                                         | 16     |
| 2026-10-28 | eval-19 review: may a DM type a map layer path outside `assets/maps/`?                                                                                        | No; it falls back to the default under maps/                                                                                 | Maps stay lossless; a `.webp` name under images/ would convert                                                                         | 19     |
| 2026-10-28 | code-retro 06 review: may one badly formed note anywhere (`_dm/`, `_drafts/` too) stop the publish?                                                           | Yes; fail closed                                                                                                             | A note the build can't read can't be shown safe                                                                                        | c-06   |
| 2026-10-28 | Sweep 3 Q1: `maps:optimize` stays lossless (PNG to lossless WebP, JPG copied as is)?                                                                          | Yes; tidemarrow/02 reworded                                                                                                  | Lossy re-encoding smears labels and fog edges                                                                                          | 22     |
| 2026-10-28 | Sweep 3 Q2: a saved "sound on" unlocks audio on the first tap anywhere?                                                                                       | Yes; the invite shows until then                                                                                             | Browsers block audio until a user gesture                                                                                              | 21     |
| 2026-10-28 | Sweep 3 Q3: the PR check and publish both run `test:ci`; publish is gated on tests?                                                                           | Yes (about 3 min more per publish)                                                                                           | A merge in GitHub skips the hook, so publish trusts nothing                                                                            | 24     |
| 2026-10-28 | Sweep 3 Q4: calm mode becomes the one "reduce motion" switch (map, ocean, transitions)?                                                                       | Yes; moved out of sound settings, OR'd with the OS setting                                                                   | Calm mode stops the waves but not the map's flights                                                                                    | 27     |
| 2026-10-28 | Sweep 3 Q5: the offline menu claims only what is stored; install caches atlas.json and the current map?                                                       | Yes; portraits and audio stay cached on visit                                                                                | Precaching every picture makes the install too heavy                                                                                   | 25     |
| 2026-10-28 | eval-22 review: may the editor re-encode a JPG map lossy to strip its metadata?                                                                               | No; drop the metadata segments, keep the image data                                                                          | Maps stay lossless; one more q85 pass smears labels                                                                                    | 29     |
| 2026-10-28 | eval-22 review: may `maps:optimize` delete the PNG once its WebP twin is in place and repointed?                                                              | Yes, as `images:optimize` does; git keeps it                                                                                 | Otherwise every map ships twice and every run re-encodes                                                                               | 22     |
| 2026-10-28 | eval-21 review: should Dismiss on the "resume sound" invite leave sound off?                                                                                  | Yes; taps on the invite's own buttons don't count as the gesture                                                             | Dismiss has to mean no sound                                                                                                           | 21     |
| 2026-10-28 | eval-21: does a bed set up while muted or in a hidden tab ("paused") count as playing?                                                                        | Yes; the label can't show while muted anyway                                                                                 | Otherwise unmuting doesn't bring the label back until a pan                                                                            | 21     |
| 2026-10-28 | eval-22: sharp 0.34.5 has no WebP `exact`; what happens to a PNG with colour under transparent pixels?                                                        | Skipped by the script, refused by Save; nothing converts unless all 4 channels match                                         | Lossless must mean exact; a sharp bump can lift it later                                                                               | 22     |
| 2026-10-28 | eval-24 review: should the PR check keep its 4 parallel shard jobs?                                                                                           | Yes; each job calls a per-shard entry of the same runner; publish runs `test:ci`                                             | One runner and retry rule, without making every PR wait for the shards one after another                                               | 24     |
| 2026-10-28 | eval-25 review: does "installing" mean the service-worker install, or a menu click?                                                                           | The SW install: each new worker saves `atlas.json`, the search index and the current map; the menu item stays for other maps | Q5's reason ("too heavy") is about an automatic install; a new deploy also refreshes the saved map                                     | 25     |
| 2026-10-28 | eval-25 review: may "Clear offline cache" keep the app shell?                                                                                                 | Yes; the label stays and says the app itself stays                                                                           | Deleting the shell left the menu stuck until a new worker installed                                                                    | 25     |
| 2026-10-28 | code-retro 07 review: Staging now gets the sync map (match by sync map, type-conflict hold): keep it?                                                         | Yes; check it in the Sync panel                                                                                              | The editor never ran either check before; a renamed note now keeps its id                                                              | c-07   |
| 2026-10-28 | code-retro 07 safety fix: hold every vault note more secret than its player entity, including untagged notes in DM-default folders (many `03_Entities` rows)? | Yes; the DM ticks them, or tags them `player` in the vault                                                                   | A held row costs a click; a wrong tick leaks a secret                                                                                  | c-07   |
| 2026-10-28 | Sweep 4: one save writes every map's drafts (rather than blocking map switches while dirty)?                                                                  | Yes                                                                                                                          | All maps share one world.yaml; blocking switches would get in the DM's way                                                             | 30     |
| 2026-10-28 | Sweep 4: undoing an edit made on another map switches to that map first?                                                                                      | Yes                                                                                                                          | Refusing would strand the undo stack; applying it in place corrupts the other map                                                      | 30     |
| 2026-10-28 | Sweep 4: Save with only an entity edit pending points to the entity panel rather than saving it?                                                              | Yes                                                                                                                          | The entity panel owns that save and its conflict handling (ticket 17)                                                                  | 31     |
| 2026-10-28 | Sweep 5 Q1: the canon client returns a typed outcome union rather than throwing error classes?                                                                | Yes                                                                                                                          | Every caller already branches on the reason; the compiler then catches an unhandled case like the 207                                  | 39     |
| 2026-10-28 | Sweep 5 Q2: fix the rolled-back write that reads as a save now, ahead of the canon client?                                                                    | Yes                                                                                                                          | It loses drafts and sync-map entries today; 39 waits on two stacks                                                                     | 33     |
| 2026-10-28 | Sweep 5 Q3: an entity link with no center opens the URL's map if valid, else the entity's placement on the default map, else its first placement?             | Yes                                                                                                                          | Respects the link, then the default view                                                                                               | 38     |
| 2026-10-28 | Sweep 5 Q4: save protocol types and size caps live in `src/atlas/save/saveProtocol.ts`, imported by the plugin?                                               | Yes                                                                                                                          | The plugin already imports from `src/atlas/save/`; no new dependency direction                                                         | 39     |
| 2026-10-28 | Sweep 5 Q5: player-image pruning matches full asset paths, not file names?                                                                                    | Yes                                                                                                                          | Name matching keeps `elf.png` when `shelf.png` ships, and one folder's image keeps another's                                           | 34     |
| 2026-10-28 | eval-34 review: the image-privacy scan can't read `.ico`/`.bmp` metadata (sharp); check their names only and print each skipped file?                         | Yes                                                                                                                          | Otherwise the site's own `favicon.ico` fails every scan; the skip is named, not silent                                                 | 34     |
| 2026-10-28 | eval-36 review: the build reads `character-keys.yaml` through the editor's parser, so `Bob: 12345` counts as key "12345"?                                     | Yes                                                                                                                          | The editor offers Bob as a secret's target; the build skipped him until a re-save. Entries the parser rejects get the existing warning | 41     |
| 2026-10-28 | eval-40 review: the player build both prunes off-allowlist files and fails a scan on them?                                                                    | Yes                                                                                                                          | The prune keeps a normal build safe; the scan catches a build that skipped the plugin                                                  | 40     |
| 2026-10-28 | eval-40 review: drop the audio manifest from the player build?                                                                                                | Yes                                                                                                                          | Only the editor reads it, and it lists the DM's source bed names                                                                       | 40     |
| 2026-10-28 | eval-40 review: hashed audio ships only when `atlas.json` references it, any extension?                                                                       | Yes                                                                                                                          | A `.opus` bed was pruned silently; reference beats a format list                                                                       | 40     |
| 2026-10-28 | eval-40 review: images may sit anywhere under `atlas/`, and the image prune covers the same area?                                                             | Yes                                                                                                                          | A map layer outside `assets/` vanished; the prune still drops unreferenced ones                                                        | 40     |
| 2026-11-07 | eval-41: read the old `content/_dm/character-keys.yaml` as a fallback?                                                                                        | No; warned and ignored                                                                                                       | One path, the editor's; a fallback hides which file counts                                                                             | 41     |
| 2026-11-07 | eval-41 review: an invalid keys file's warning quotes the YAML error?                                                                                         | No; fixed text plus a line number                                                                                            | js-yaml's reason can quote key text, and build warnings ship in `atlas.json`                                                           | 41     |
| 2026-11-07 | eval-38: an entity link whose map is missing or invalid keeps its center?                                                                                     | No; drops it and resolves like a link with no center                                                                         | A center only means something on its own map                                                                                           | 38     |
| 2026-11-07 | eval-38: a bare center with an invalid map?                                                                                                                   | Default map, and fly there                                                                                                   | The link still lands somewhere sensible                                                                                                | 38     |
| 2026-11-07 | eval-29: keep ICC profiles when stripping JPG map metadata?                                                                                                   | Yes                                                                                                                          | Colour, not privacy; dropping it shifts colours                                                                                        | 29     |
| 2026-11-07 | eval-29: a JPG map with EXIF orientation other than 1?                                                                                                        | Refused ("rotate it in an image editor")                                                                                     | Stripping the tag would show it sideways                                                                                               | 29     |
| 2026-11-07 | eval-29: a JPG saved under a `.png`/`.webp` map name?                                                                                                         | Refused; the editor names it `.jpg`                                                                                          | The name would lie about the bytes                                                                                                     | 29     |
| 2026-11-07 | eval-30: beforeunload also warns for restored localStorage pins?                                                                                              | Yes                                                                                                                          | It reads the one dirty signal                                                                                                          | 30     |
| 2026-11-07 | eval-30: a map without a fog draft gets a default fog block on save?                                                                                          | No                                                                                                                           | Writes only what the DM drew                                                                                                           | 30     |
| 2026-11-07 | eval-30 review: drafts under a map id the project no longer has?                                                                                              | Kept, not counted, saved or cleared; one console warning                                                                     | Saving them would write a removed map back                                                                                             | 30     |
| 2026-11-07 | agent-retro/01: `npm run gate` with `public/atlas/` already changed?                                                                                          | Refuses to start                                                                                                             | It restores that folder afterwards and would wipe the change                                                                           | r-01   |
| 2026-11-07 | eval-37: does the publish check hold the build lock too?                                                                                                      | Yes; a build that never settles holds it until a server restart (logged)                                                     | Two builds into one folder is the bug                                                                                                  | 37     |
| 2026-11-07 | eval-45: a deleted-pin override for a pin canon no longer has (stale tombstone)?                                                                              | Dropped on load and whenever canon reloads                                                                                   | Saving it threw "Unknown entity" on every Save, or wrote a removal nobody asked for                                                    | 45     |
| 2026-11-07 | eval-46: a player-visible route or region naming an unknown entity?                                                                                           | Blocks Publish Check, as it blocks the strict build                                                                          | The check passed what the publish then refused                                                                                         | 46     |
| 2026-11-07 | eval-46: credits of `hidden` entities on the credits page?                                                                                                    | Hidden, like `dm`                                                                                                            | Only player and rumor ship                                                                                                             | 46     |
| 2026-11-07 | Improvement loop: delete the Map Import Wizard rather than fix its zip?                                                                                       | No (reversed while building 48); its zip now cleans each map through a dev route                                             | It is the only way to draft a new map; nothing else creates a map document                                                             | 48     |
| 2026-11-07 | eval-48: the wizard's download needs the dev server and refuses maps over 6 MB?                                                                               | Yes; a toast says so                                                                                                         | The clean runs in Node (sharp); the same cap as the editor upload                                                                      | 48     |
| 2026-11-07 | eval-47: does Save clear the calendar draft itself?                                                                                                           | No; the draft drops once it equals canon                                                                                     | Clearing at save would write the old calendar back if the rebuild failed                                                               | 47     |
| 2026-11-07 | eval-27: where does the calm-mode switch live on the player site?                                                                                             | The map toolbar, beside grid and ruler                                                                                       | There is no settings panel; Isak looks at the button                                                                                   | 27     |
| 2026-11-07 | eval-27: does calm mode still silence the soundscape?                                                                                                         | Yes; the OS setting alone leaves audio on                                                                                    | Unchanged behaviour; the button's title says so                                                                                        | 27     |
| 2026-11-07 | eval-49: ruler on while drawing a route or fog shape?                                                                                                         | The drawing owns the click; the ruler pauses and clears its points                                                           | The drawing is work in progress, as pins, regions and sound areas already did                                                          | 49     |
| 2026-11-07 | eval-49: a pending pin while drawing?                                                                                                                         | The drawing owns the click; the pin waits for the first click after                                                          | One click, one action                                                                                                                  | 49     |
| 2026-11-07 | eval-50: a player relationship to an unknown target?                                                                                                          | The blocking leak plus the existing unresolved warning                                                                       | Matches the build, which refuses it                                                                                                    | 50     |
| 2026-11-07 | eval-50: a `publish: false` note linking a DM note?                                                                                                           | Not judged                                                                                                                   | The build skips that note, so nothing leaks                                                                                            | 50     |
| 2026-11-07 | eval-44: where does the sound draft live?                                                                                                                     | In the map's own metadata override, edited through `patchMap`                                                                | One copy per map: no new session data or undo code, nothing to patch back                                                              | 44     |
| 2026-11-07 | eval-44: does Reset map settings clear sound edits?                                                                                                           | Yes                                                                                                                          | They now live in the same override                                                                                                     | 44     |
| 2026-11-10 | R-11e: does a rule-8 name collision fail a non-strict player build too? | Rule 8 collisions fail every player build, not only strict | Safer for players; matches ADR-0004 wording. Coordinator call 2026-11-10 | R-11e |
| 2026-11-10 | R-14 review: may two worlds hold notes with the same id, so one vault note feeds both?                                                                        | Note ids are global across worlds (as the build's duplicate-slug check already says); Sync holds a vault note whose id lives in another world instead of creating a second copy | Coordinator call 2026-11-10; Isak may revisit if one vault should feed two worlds                                                      | R-14   |
| 2026-11-11 | Phase 3 tickets: the pivot of a frame's or ocean placement's `rotation` (ADR-0003 leaves it open)? | The centre, in the viewer; the resolver keeps testing both pivots (fail closed) until ADR-0003 is amended | The viewer must draw one; a rotate handle turns about the centre | R-30 |
| 2026-11-11 | Phase 3 tickets: a frame whose aspect differs from its child map's? | The width ratio wins; the tree warns | The editor (E5) will keep aspects equal | R-30 |
| 2026-11-11 | Phase 3 tickets: what is a map's "minimum" for zooming back out (the output has no per-map zoom range)? | `zoom.min` from the source, now emitted per map in v2 output (`MapDocument.zoom`); the fitted zoom when absent | Needs an ADR-0003 addendum (For Isak) | R-32 |
| 2026-11-11 | Phase 3 tickets: when does the ocean, or a frame with no `enterZoom`, hand over to a map? | When the map would fill the viewport's shorter side; a click always enters | The ocean has no `enterZoom` | R-32 |
| 2026-11-11 | R-32 build: hysteresis, and an authored `enterZoom` that conflicts with the child's `zoom.min`? | A half-level margin M. The viewer leaves a map below min(`zoom.min` ?? fit, fit - M, enter landing - M). The build warns when `enterZoom` lands less than M above the child's `zoom.min`. Test-world and fixture `zoom.min` values were lowered so they load with no warning (documentation, not needed by the viewer) | Every way in lands at least M inside the new view, so a wheel step or pinch can't flip back | R-32 |
| 2026-11-11 | R-32 build: an authored `enterZoom` at or below where a zoom entry lands on the parent (the fill landing depends on screen size)? | The viewer raises the child's enter zoom to at least M above both the parent's zoom landing and its fitted zoom (a click enter); a zoom in only enters, a zoom out only leaves; enter and leave zooms are kept inside the canvas's -6..4 | Without it, a 1280x800 screen went from the ocean straight into oskmark, skipping Quessaly | R-32 |
| 2026-11-11 | R-32 build: which zooms hand off? | Only zooms the user made (wheel, pinch, double-click, keys, buttons); a fit or an explicit camera never does. Input arms a flag that the canvas's own moves (explicit camera, fit, new view) and a pan clear | Sandbox's ocean fits to its one map at nearly the fill zoom and would enter it on load | R-32 |
| 2026-11-11 | Phase 3 tickets: how is the local test site served? | One port per campaign, serving `dist-campaigns/<id>/` exactly as built, plus a picker on its own port that never lands in a campaign's site; no remembered choice | The local site is the artifact H-01 would deploy | R-34 |
| 2026-11-11 | R-34 build: which ports, and what else does the server refuse? | Picker on 4300, campaigns on 4301, 4302, ... in content order (`-- --port <n>` moves them); every port answers only a `localhost`/`127.0.0.1` `Host` (no DNS rebinding) and only GET/HEAD; it won't start if a site holds the picker or another campaign's name | Free of the editor (8080) and v1 preview (4173); cheap extra fences on a server that can see every campaign | R-34 |
| 2026-11-11 | Phase 3 tickets: what does `c=` do on a campaign site? | A check, not a switch: a wrong `c`, map or note opens the ocean with "Not found in this campaign"; v1 writes no `c`; the campaign chip links to the picker only when `location.hostname` is `localhost` or `127.0.0.1` | Each site holds one campaign (ADR-0004); no build flag can turn the link on | R-35 |

## End of the 2026-11-07 improvement loop

Built, reviewed and gated eight tickets, one PR each: 45 (#99), 46 (#100), 48 (#102), 47 (#103),
27 (#104), 49 (#105), 50 (#106, stacked on #100) and 44 (#107, stacked on #103). Wrote the retro notes
into `docs/agents/workflow.md` (review before gate, worktree lint/format, zsh quoting, State.md
after merge, queued merges) and added the `in-review` state. Stopped there: what's left is 39,
which would conflict with the queue, the pin anchor (Isak's look) and L-sized work. A second round added an architecture pass
(`docs/tracker/arch-2026-11/`) and built 01 (#109) and 04 (#108). Next session:
merge the queue, then the "Open work" list from item 1.
