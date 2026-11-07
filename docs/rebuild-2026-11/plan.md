# Stage D plan: rebuild or refactor (PROPOSED, 2026-11-07)

Built on `audit.md` (+ `audit/`), `GOALS-proposed.md`, `ux-flows.md` and Isak's answers in
`questions-round-1.md`. Nothing here is agreed until Isak says yes. Sizes: **S** = one ticket
session (one implement-review run, one gate run), **M** = 2-3 sessions, **L** = 5-8 sessions.
"Light pace" means 2-4 ticket sessions a week while Grimoire comes first, one `npm run gate` at a
time on the Mac.

## Changed after Isak's 2026-11-07 follow-up

- **Private before real content.** Public is for testing only. Before real content is published,
  hosting moves to Cloudflare Pages with access limited to his players, and the repo goes private.
  So DM data is committed like everything else; the gitignored DM folder and `world.dm.yaml` are
  dropped (section 4). This reverses round-1 Q4. Players still get only the per-campaign player
  build, and every scan still runs on it.
- **Raw map images** in the repo are no longer a concern (private repo); that question is gone.
- **Campaigns differ by visibility** (notes, zones, maps), not only by fog; later they may have
  different maps. Fail closed per campaign: unset or invalid is `dm`. This reverses old question 3.
- **Map images become tile pyramids** in the player build, lossless WebP per tile, fog baked before
  tiling (section 4, phase 4).
- **New phase 3: private hosting** (Cloudflare Pages + access, repo private), with a pre-switch
  safety check. The GitHub Pages site stays public with test content until then.

## Recommendation

**Option B: build the new editor and map model inside this repo, next to the old editor, behind the
same `__INCLUDE_EDITOR__` gate, and keep the pipeline, the scans and Sync.**

1. The safety spine (content core, 13 scans, publish, Sync, ~3,300 tests) is the part that works,
   and B never stops running it: every ticket still merges on the full gate.
2. The broken half (editor, map model) is rewritten, not patched, so the "draft per page, data per
   map" bug family ends instead of returning a seventh time.
3. The old editor keeps working on today's files until the new one can add, nest and pin maps, so
   Isak is never without an editor during the slow months.
4. The live site changes only by additive steps until the hosting move; players see the ocean only
   when it is ready.
5. About 55-65 ticket sessions in total, roughly 5-6 months at light pace; A costs more for a worse
   end state, C costs most and re-earns safety that already exists.

## 1. Options compared

| | (A) Refactor in place | (B) Rebuild editor + map model in this repo | (C) New repo from scratch |
|---|---|---|---|
| Schema v2, per-campaign visibility, migration | M | M | M |
| Build: multi-world, map tree, per-campaign output | M | M | L (rewrite stages) |
| Map tiles (pyramid, fog per campaign) | M | M | M |
| Scans, publish, hosting move to Cloudflare | M | M | L (port, re-prove, new host) |
| Sync + vault adapter | S | S | M (port, rewire) |
| Save endpoint | M (refactor, keep both save paths alive) | M (router, per-file routes) | M |
| Viewer (ocean, tree, story card) | M | M | L (rebuild reading layer) |
| Editor | XL: change the 2,876-line page one overlay at a time, each step gate-green, while the map tree and campaigns multiply every overlay | L: new shell and command store; reuse the pure helpers | L |
| Retire old code, docs | S | S | M |
| **Rough total** | **70-85 sessions, 7+ months light** | **55-65 sessions (phases 1-7), 5-6 months light** | **80-100 sessions, 8+ months light** |
| Risk | High: the structure that causes the bugs stays to the end; every step touches live code | Medium: two editors for a while; one cutover (source migration) to get right | High: four leaks were found on `main` only by the adversarial review; a fresh pipeline would have to find them again |
| Players meanwhile | Each refactor step publishes; regressions likely, as now | Nothing changes until phase 4; viewer changes are additive | Nothing until a big-bang switch |
| Safety spine | Kept, but editor work keeps re-implementing rules | Kept; new code writes through the same save endpoint (loopback gate, `baseHash`) and the same scans judge every campaign's build | Copied, then trusted again from zero |

Why not A: the editor's problem is its shape (it edits the compiled atlas, eight state homes, two
save paths; `audit/code.md` B, F), not its size. Refactoring keeps that shape through every step,
and per-campaign visibility would add one more overlay to each of them. Why not C: the half C
rebuilds for free is exactly the half that is good, and C starts without the 3,300 tests.

## 2. Keep / change / throw away

| Module | Verdict | What changes | What gets deleted |
|---|---|---|---|
| Safety scans `scripts/check-*.ts`, `publish-integrity-smoke.ts` | Keep | Run once per campaign output; shape and fog checks learn v2 and tiles; new cross-campaign sentinel: an item `dm` in A and `player` in B is absent from A's atlas, search index and tiles | Nothing |
| Publish orchestrator, `publish-push` | Keep | Loops over campaigns | Nothing |
| `publish-atlas.yml` (GitHub Pages) | Change at phase 3 | Deploys to Cloudflare Pages instead | The Pages deploy steps, after the switch |
| Sync `src/atlas/sync/` + `VaultPort` adapters | Keep | Drop `worlds[0]` (`sync.ts:110`), pick the target world; never write placements. DM notes land in `content/` as `dm`, as today | Nothing |
| Content core `src/atlas/content/` | Keep as is | Visibility read per campaign through the new resolver | Nothing |
| Search, peek, wander, visited, secrets | Keep | Search index per campaign, grouped by map | Nothing |
| Fog baking `redactFogMap.ts` | Keep | Per campaign × fogged map, on the full image, before tiling | `MapDocument.fog` (after migration) |
| Image encoding `imageEncoding.ts`, `maps:optimize` | Keep, extend | Owns tile naming and the pyramid step; maps stay lossless | Nothing |
| Loader `loadWorldConfig.ts`, `schema.ts` map types | Rewrite | v2 loader for `atlas.yaml`, `world.yaml`, campaigns; reads v1 until cutover; one visibility resolver | v1 `normalizeVis` (`loadWorldConfig.ts:486-489`); the v1 read path in phase 7 |
| `build-atlas.ts` | Refactor (M) | World assembly (715-1125) split into stages over worlds, the map tree and campaigns | `"Astrath Deeprealm"` fallback (1113), single `defaultWorld` |
| Save endpoint `vite-plugin-atlas-save.ts` | Refactor (M) | Router + one module per route; per-file routes (atlas.yaml, world.yaml item, campaign, note) | Reverse-compile save `handleSaveRequest` (482-929), DM-atlas overlay routes (1582-1600), at retire |
| Viewer `AtlasViewer.tsx`, `WrappedWorld`, `featureShapes`, `EntityPanel` | Refactor (M) | Ocean canvas (`src/atlas/ocean/` exists), tile layers, frames, zoom hand-over, breadcrumb, campaign link, region story card, plain-text dead links | Flat map `<Select>` (650-662), `worlds[0]` uses (301, 373) |
| Editor page `AtlasPlacementEditor.tsx` | Throw away at retire | Replaced by the shell E0 | The page (2,876 L), `useMapLayers.ts`, `editor/placementOverrides.ts`, `useDraftCore` + per-feature drafts, `session/` (870 L), `useUndoStack.ts`, `save/planUnifiedSave` + `canonicalPlacementSave`, `tabs/` (2,564 L), `shell/` incl. `railRegistry`, `yaml/buildFullWorldYaml.ts` |
| Pure editor helpers | Keep | Used by the new editor | `layerGeometry`, `mapClickCoord`, `pinClickIntent`, `saveGate`, `map/geometry`, `ruler/` stay |
| Map Import Wizard `import/MapImportWizard.tsx` | Throw away the UI | Replaced by Add map (E3) | The wizard; the server-side EXIF strip (#102) and import staging/merge logic stay |
| Sound editor `src/atlas/sound-editor/` (597 L) | Throw away; park the job | Sound areas stay `world.yaml` items with fail-closed visibility; runtime `src/atlas/sound/` stays | The panel, at retire |
| Categories `src/atlas/categories/` (1,223 L) | Throw away | Replaced by the note editor E8, the unplaced list and Ctrl+K | `CategoryPanel`, `EntityEditPanel`, `EntityEditorPanel`, `useEntityEditDraft` (the second save path) |
| Calendar | Keep the Timeline page | Calendar fields in the world inspector (S, later) | `calendar/CalendarPanel.tsx`, at retire |
| Tests | Keep the spine tests | Flow tests check files on disk and each campaign's player build, never response shapes | Editor-page integration tests (`placement-save-integration`, `world-override-save`, `world-yaml-conflict-recovers`, `save-entity-edit-pending`), session/undo hook tests, `useMapLayers` and override-migration tests |
| Docs | Change | `GOALS-proposed.md` becomes `docs/GOALS.md`; PRODUCT_SPEC, NON_GOALS, KNOWN_LIMITATIONS rewritten; AGENTS.md "maps stay lossless" rule gains the tile step | Old "one DM, one world" pitch |

## 3. The 12 open PRs

Each merge needs `main` merged in and a fresh gate run, so merging all twelve costs twelve
sequential gates for work mostly deleted in phase 7. Merge what protects players or carries over;
close the rest with a note (branches stay, nothing deleted).

**Merge first, safety on the live site:** #109, then #110. #109 is the real gap: the fog scan and
image-twin check look in the wrong `dist` path today, so they skip and pass.

| PR | Verdict | Reason |
|---|---|---|
| #109 arch-01 scans find real artifacts | **Merge, first** | Scans skip on `dist` today; the live publish is checked less than it claims |
| #110 arch-07 invalid visibility is dm | **Merge, second** | Fails closed now; the v2 resolver keeps the rule per campaign |
| #100 eval-46 one spoiler-leak rule | Merge then supersede | One `linkLeaksToPlayers` predicate; the v2 resolver absorbs it |
| #106 eval-50 Publish Check matches build | Merge then supersede (after #100, stacked) | The new Publish check reuses the build's rule |
| #102 eval-48 wizard zip strips EXIF | Merge then supersede | GPS EXIF could reach the still-public repo; the server-side strip stays |
| #108 arch-04 delete dead EntityReadingView | Merge | Small deletion in the viewer, which carries over |
| #104 eval-27 one reduce-motion switch | Merge then supersede (after Isak checks the button) | Viewer code carries over; low priority |
| #101 docs State.md and workflow notes | Merge then supersede, last | Carries the arch-2026-11 tickets onto `main` |
| #99 eval-45 deleted pins on any map | Moot, close | Old-editor draft bug; that model is deleted |
| #103 eval-47 Discard all clears world settings | Moot, close | Same family; one store and one discard in the new editor |
| #107 eval-44 soundscape draft per map | Moot, close (stacked on #103) | Sound editor is retired |
| #105 eval-49 ruler and drawing one click | Moot, close | One active tool by construction; note the `resolveMapClickTool` idea in ADR-0005 |

If Isak plans real editing in the old editor before cutover, merge #99 and #103 instead (they fix
silent data loss there).

## 4. Schema v2 sketch

Coordinates stay local to each map (`[x, y]`, top-left, `CODEBASE_MAP.md` invariant 3). The compiled
`atlas.json` gains fields; nothing the current viewer reads is removed until phase 4.

```yaml
# content/_atlas/atlas.yaml
schemaVersion: 2
ocean: { width: 400000, height: 300000, sea: default }
worlds: [astrath-deeprealm]
campaigns: [red-tide, sandbox]               # files in content/_atlas/campaigns/
onOcean:                                     # top-level maps
  - { map: varn, x: 0, y: 0, scale: 1, rotation: 0 }

# content/<world>/_atlas/world.yaml
schemaVersion: 2
world: { id: astrath-deeprealm, name: Astrath Deeprealm }
maps:
  - id: varn
    visibility: player                       # one value = every campaign
    layers: [{ src: images/varn.png, x: 0, y: 0, width: 16000, height: 12000 }]
    scale: { unitsPerPixel: 0.5, unit: mi }
    zoom: { min: -4, max: 2 }
  - id: saltmere
    visibility: { red-tide: player, sandbox: rumor }   # a campaign not listed = dm
    parent: varn                             # absent = on the ocean
    frame: { x: 3100, y: 2200, width: 400, height: 300, rotation: 12 }   # in varn's pixels
    enterZoom: 1
    regions: [{ id: salt-marsh, polygon: [...], visibility: dm, note: salt-marsh }]
    routes:  [{ id: coast-road, points: [...], speed: 24, visibility: { red-tide: player } }]
    pins:    [{ note: harbour-master, x: 120, y: 340, visibility: player }]
    sound:   [{ id: gulls, polygon: [...], visibility: player }]
notes:                                       # editor-set extras for read-only synced notes
  harbour-master: { visibility: { sandbox: player }, belongsTo: [saltmere] }

# content/_atlas/campaigns/<id>.yaml
id: red-tide
name: Red Tide
maps:                                        # fog and state; a map not listed = unknown
  varn: { state: fogged, reveals: [[...]], conceals: [], featherPx: 24 }
  saltmere: { state: open }
```

- **Visibility, one resolver:** a value is either one visibility (every campaign) or a map of
  campaign to visibility. Missing, invalid, or a campaign not in the map = `dm`. A map hidden in a
  campaign hides its subtree there; a pin ships to a campaign only if its map is not unknown and it
  is not under that campaign's fog. Notes take the same two forms in `atlas.visibility`.
- **No `world.dm.yaml`, no DM folder.** With the repo private their only reason (keeping hidden
  items out of public commits) is gone, and a file split by "hidden" cannot say "hidden in A,
  visible in B". One file per world, one resolver, no move-between-files on hide/unhide (one less
  save path to get wrong). The DM/player split is the projection: each campaign's player build is
  the only thing that ships, and the scans check every one. DM blocks (`%% %%`, `:::dm`) stay inline
  in notes, stripped by `dmMarkup.ts` as today.
- **Frontmatter** keeps `atlas.visibility`, `atlas.type`, title, relationships; `atlas.placements`
  moves into `world.yaml` (synced notes are read-only).
- **Map images: tile pyramids in the player build.** Source stays one lossless image per map in
  `images/`. At build, per campaign: bake fog on the full image (fogged maps only), then cut a
  pyramid of 512 px tiles, lossless WebP; open maps share one tile set per campaign output. The
  viewer loads only the tiles on screen. Compared with one lossless image per map: a 16k map is
  tens of MB that every player downloads whole and phones may refuse to decode, and an ocean of many
  maps multiplies that; tiles cost about 1.33× the base in storage, a build step (`sharp` is already
  a dependency) and scans that read tiles. Lossy WebP would blur labels at deep zoom, so lossless
  stays the default. Fog is baked before tiling, so no tile holds an unfogged pixel.
- **Migration** (`atlas:migrate-v2`, dry run first, idempotent, run once at cutover): today's map
  becomes a top-level ocean map with its six layers unchanged; its `fog` becomes `campaigns/main.yaml`;
  the 6 notes with `atlas.placements` (of 7) move their pins into `world.yaml`; every item that ships
  today gets an explicit `visibility: player`, so the fail-closed default hides nothing live.
  Checked by diffing the player atlas before and after.

## 5. Phases

Each phase ends with something Isak can look at; every ticket merges on the gate.

**Phase 1: spine closed (small; 4-6 sessions, about 2 weeks light).** Merge #109, #110, #100, #106,
#102, then #108, #104, #101; close #99, #103, #105, #107. Tickets R-01..R-04. Exit: a publish log
with the fog and image-twin scans reading `dist` (not skipping), the live site unchanged,
`docs/GOALS.md` agreed. ADRs: ADR-0001 addendum (every `world.yaml` item, every campaign),
ADR-0002 (option B).

**Phase 2: schema v2 and campaigns in the pipeline, invisible to players (13-15 sessions).** v2
types, the per-campaign resolver, v2 loader that still reads v1, build stages over
worlds/tree/campaigns, one player output per campaign (default at today's paths), scans per
campaign, the test world. Exit: `npm run atlas:tree` prints ocean > world > continent > city per
campaign, with different maps and notes per campaign; today's player atlas diffs as additive only.
ADRs: ADR-0003 (schema v2), ADR-0004 (campaigns: visibility, fog, map state; unlisted = dm/unknown).

**Phase 3: private hosting (3-4 sessions, plus Isak's clicks in Cloudflare and GitHub).** Can slip
later, but must finish before any real vault content is committed. Tickets H-01..H-04. Exit: each
campaign's site loads for an allowed player and refuses everyone else; the GitHub Pages site is off;
the repo shows Private. ADR-0007 (private hosting; DM data committed; supersedes round-1 Q4). Then
tidemarrow/01-03 (first real Sync) are unblocked.

**Phase 4: tiles and the player viewer on v2 (11-13 sessions).** Tile pyramid step with per-campaign
fog and its scans first, then ocean canvas, tile layers, frames, zoom hand-over, breadcrumb, deep
links with `c` and map, campaign links, region story card and panel, dead links as plain text.
Exit: Isak walks ocean > continent > city > back and compares two campaigns. ADR-0008 (map images as
tile pyramids; amends "maps stay lossless" with the tile step).

**Phase 5: new editor core and cutover (10-12 sessions).** Save endpoint router; command store over
source files, one undo, autosave; E0, E1, E2, Add map E3, Align E4, Nest E5, Place pin, Inspector
E9, at `/atlas/edit/next`. Cutover ticket: run the migration, disable the old editor's save, move
the new one to `/atlas/edit`. Exit: Isak adds a map inside a map, places a pin, reloads, sees it in
`world.yaml`. ADRs: ADR-0005 (editor document store), ADR-0006 (placements live in `world.yaml`).

**Phase 6: campaigns, hiding, fog, notes, preview, publish in the editor (9-11 sessions).**
Campaigns E13, per-campaign visibility in the inspector, Hide area E6, Fog E7, Note editor E8,
Preview E11 per campaign, Publish check E12 per campaign. Exit: Isak makes a zone visible in one
campaign only, reveals fog there, and previews both campaigns.

**Phase 7: retire (3 sessions).** Delete the old editor and section 2's "deleted" column, the v1
read path and arch-06's audio prune plugin; rewrite `CODEBASE_MAP.md` and the README table. Exit:
`grep` finds no `AtlasPlacementEditor`, `worlds[0]` or `placementOverrides`; gate green.

## 6. Tickets: phases 1, 2 and 3

New folder `docs/tracker/rebuild-2026-11/issues/`, same format as `tidemarrow/issues/` (Status,
Blocked by, Acceptance criteria). Merging the PRs is Isak's yes, not a ticket.

| Id | Title | Size | One line |
|---|---|---|---|
| R-01 | Missing `world.yaml` visibility loads as dm | S | Extends #110 to the missing case for regions, routes and sound areas; ADR-0001 addendum; a fixture zone with no visibility is absent from the player build |
| R-02 | check-player-files fails a site with no atlas.json | S | arch-09 as written |
| R-03 | Adopt the rebuild goals | S | `GOALS-proposed.md` to `docs/GOALS.md`, contradicting docs rewritten, ADR-0002 |
| R-04 | Rebuild queue in State.md; close the moot PRs | S | Phases and closed PRs with reasons; no branch deleted |
| R-10 | Schema v2 types | S | `atlas.yaml`, map tree, frame, campaign, per-campaign visibility types; ADR-0003, ADR-0004 |
| R-11 | One per-campaign visibility resolver | M | Maps, frames, regions, routes, pins, sound areas, notes, hidden subtree; unset/invalid/unlisted = dm; folds in arch-02 and arch-08; build, Publish Check and preview all call it |
| R-12 | v2 loader that still reads v1 | M | Reads `atlas.yaml`, `world.yaml` v2, campaigns; a v1 file loads as one world, one ocean map, campaign `main` |
| R-13 | Build assembles every world and the map tree | M | Split `build-atlas.ts:715-1125` into stages; two-world fixture builds both; `worlds[0]` grep in the gate |
| R-14 | One player output per campaign | M | Visibility and fog per campaign; default campaign at today's `public/atlas/` paths |
| R-15 | Scans read every campaign | S-M | Every scan per campaign dir; cross-campaign sentinel (dm in A, player in B); fault-injection smoke covers a second campaign |
| R-16 | Three-level test world, two campaigns | S | Fixture and sample content that differ by visibility; `npm run atlas:tree` |
| R-17 | Migration script, dry run only | S | `atlas:migrate-v2` tested on fixtures and a copy of `content/`; player atlas diff empty; not run until cutover |
| H-01 | Cloudflare Pages deploy | M | Publish workflow deploys each campaign's build to Cloudflare Pages; scans gate the deploy as today |
| H-02 | Player access per campaign | S | Access policy per campaign path [Q method]; a test fetch without login of every campaign's atlas, search index and a tile is refused |
| H-03 | Pre-switch safety check | S | Before the switch: the repo holds only test content (no real-vault `sync-map.json`, no file from vault folders in history), all scans pass per campaign; after: GitHub Pages returns 404 and the repo is Private |
| H-04 | Turn off GitHub Pages, make the repo private | S | Isak's clicks, listed step by step; README, AGENTS.md and GOALS updated with the new URL |

## 7. Risks and open questions

1. **How players get in [Q].** Recommendation: Cloudflare Access with a one-time email PIN and one
   allow list per campaign path, because campaigns now differ by visibility and a Red Tide player
   must not open Sandbox's build. No shared campaign picker on the hosted site; each campaign is
   reached by its own link.
2. **Per-campaign visibility on synced notes.** They are read-only, so a per-campaign choice can't be
   written into the note. Recommendation: the `notes:` block in `world.yaml`, read by the one
   resolver, which takes the editor's value over the vault's; the Publish check lists every note
   whose visibility the editor changed.
3. **Tile quality and file count.** Lossless tiles are large and many; Cloudflare Pages caps files
   per deployment (20,000 on the free plan when last checked; verify in H-01), and each campaign
   with fog has its own tiles. Recommendation: lossless WebP, 512 px tiles, open maps shared within
   a campaign; if the count gets close, move tiles to R2 behind the same access. Isak compares a
   high-quality lossy tile set on one real map before anything lossy is allowed per map.
4. **The cutover moment.** Migrating sources to v2 breaks the old editor's write-back.
   Recommendation: keep v1 sources and the old editor working until the new one can add, align,
   nest and pin; migrate and disable the old save in one ticket; keep the v1 reader until phase 7.
5. **CI minutes once the repo is private.** Private repos get limited Actions minutes, and they ran
   out once already (agent-retro/03). Recommendation: the local gate stays the merge bar; the
   deploy job only builds, scans and uploads (no `test:ci`), or Cloudflare builds it. One ticket in
   flight at a time also keeps the light pace safe: any phase can pause between two tickets.
