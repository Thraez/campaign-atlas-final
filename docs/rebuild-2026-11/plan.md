# Stage D plan: rebuild or refactor (PROPOSED, 2026-11-07)

Built on `audit.md` (+ `audit/`), `GOALS-proposed.md`, `ux-flows.md` and Isak's answers in
`questions-round-1.md`. Nothing here is agreed until Isak says yes. Sizes: **S** = one ticket
session (one implement-review run, one gate run), **M** = 2-3 sessions, **L** = 5-8 sessions.
"Light pace" means 2-4 ticket sessions a week while Grimoire comes first, one `npm run gate` at a
time on the Mac.

## Changed after Isak's 2026-11-07 follow-up and two plan reviews

- **Private before real content.** Hosting moves to Cloudflare Pages with player-only access and the
  repo goes private before any real content. DM data is committed; the gitignored DM folder and
  `world.dm.yaml` are dropped (reverses round-1 Q4). Until then a mechanical guard stops a real Sync
  (R-01, the first ticket): `tidemarrow/01` is ready-for-agent today and would commit real DM notes
  to the public repo.
- **Campaigns differ by visibility**, not only fog. New campaigns start hidden: the migration writes
  `{ main: player }`, never a bare `player`. Per-campaign note visibility lives only in `world.yaml`'s
  `notes:` block and can never widen a vault `dm`.
- **Quick wins first** (phase 0): working wikilinks, a fitted camera, the menu above the map, a
  region hover card, in today's code. First visible win in week 1-2.
- **The old editor lives until parity**, so all 12 open PRs are now recommended for merging.
  Cutover is the last editor ticket, against a written parity list; before it, the new editor edits
  only the v2 test world.
- **Tiles are off the critical path**: the viewer ships on full lossless images with fog baked as
  today; a tile phase runs only when a measured problem triggers it.
- **Scans before outputs**: the one scan registry (`scripts/atlas/scanRegistry.ts`, 8 scans; earlier
  text saying "four copies" and "13 scans" was stale) learns campaign dirs before any campaign output
  lands; the fog scan becomes source-driven per campaign.
- **Honest calendar**: about 80-95 sessions, **7-9 months at light pace**, with three safe stop
  points.

## Recommendation

**Option B: build the new editor and map model inside this repo, next to the old editor, behind the
same `__INCLUDE_EDITOR__` gate, and keep the pipeline, the scans and Sync.**

1. The safety spine (content core, scan registry, publish, Sync, ~3,300 tests) is the part that
   works, and B never stops running it: every ticket still merges on the full gate.
2. The broken half (editor, map model) is rewritten, not patched, so the "draft per page, data per
   map" bug family ends instead of returning a seventh time.
3. Isak keeps the old editor, with all 12 open fixes merged, until the new one passes a parity list;
   quick wins make the current site and editor better in the first two weeks.
4. The live site changes only by additive, scanned steps, and nothing real is committed while the
   repo is public.
5. About 80-95 sessions, 7-9 months at light pace, stoppable after phase 0, after phase 3 and after
   editor parity.

## 1. Options compared

| | (A) Refactor in place | (A′) Keep the shell, store underneath | (B) Rebuild editor + map model here | (C) New repo |
|---|---|---|---|---|
| Schema v2, campaigns, build, scans | M+M+M | M+M+M | M+M+M | L+L+L |
| Viewer (ocean, tree, story) | M | M | M | L |
| Editor | XL: every overlay re-keyed per map node and campaign | L+: 4 friction fixes, then a command store slid under 14 rail panels one at a time | L: new shell and store; pure helpers reused | L |
| Hosting, Sync, retire | M | M | M | M+ |
| **Rough total** | **95-110 sessions** | **85-100 sessions** | **80-95 sessions** | **100-120 sessions** |
| Risk | High: the bug-causing shape stays to the end | Medium-high: two stores and the reverse-compile save coexist until the last panel moves | Medium: two editors coexist; one cutover | High: safety re-earned from zero |
| Players meanwhile | Regressions likely, as now | Same as B | Additive, scanned steps only | Big-bang switch |

**A′, steelmanned.** Keep the rail and shell, fix the worst friction first (menu under the map,
camera at max zoom, unclear save state: 4 S), then put one command store under the page and move the
14 rail panels onto it one at a time (`railRegistry.tsx:59-78`: six content panels, Pins, Regions,
Routes, Fog, Sound, Publish, Player keys, Sync), about 1-2 sessions each (20-25), plus map-tree and
campaign awareness in each panel (about 10). Model, build, scans and viewer cost the same as B
(about 35-40), and the spine, PRs, hosting and retire as in B (about 15-20). That gives 85-100:
close to B. B still wins on `audit/code.md` §B and §F: until the
last panel moves, A′ runs the page-as-store and the reverse-compile save of the compiled atlas next
to the new store, which is exactly where the bug family lives; and it ends tool-first (14 panels),
so the task-first shell would still be a second rewrite. B takes A′'s cheap part: the friction fixes
are phase 0.

## 2. Keep / change / throw away

| Module | Verdict | What changes | What gets deleted |
|---|---|---|---|
| Scan registry `scripts/atlas/scanRegistry.ts` (8 scans), `check-*.ts`, `publish-integrity-smoke.ts` | Keep, extend | `artifactDirs` lists one dir per campaign from `atlas.yaml`; a missing listed dir fails every scan in publish mode; each campaign's must-not-ship set comes from the resolver; fog scan source-driven per campaign | Nothing |
| Publish orchestrator, `publish-push` | Keep | Loops over campaigns | Nothing |
| `publish-atlas.yml` (GitHub Pages) | Change at the hosting phase | Direct upload to Cloudflare Pages from the scanned job | The Pages deploy steps |
| Sync `src/atlas/sync/` + `VaultPort` adapters | Keep | Any target world (`sync.ts:110`); refuses a real run while `hosting: public`; strips `atlas.placements` after cutover | Nothing |
| Content core `src/atlas/content/` | Keep as is | Frontmatter visibility stays scalar | Nothing |
| Search, peek, wander, visited, secrets | Keep | Index per campaign, grouped by map | Nothing |
| Fog baking `redactFogMap.ts` | Keep | Per campaign × fogged map, on the full image | `MapDocument.fog` (after cutover) |
| Image encoding `imageEncoding.ts`, `maps:optimize` | Keep as is | Tile step only in the triggered tile phase | Nothing |
| Loader `loadWorldConfig.ts`, `schema.ts` map types | Rewrite | v2 loader; v1 only for a file with no `schemaVersion` or `1`; a mix of v1 and v2 files fails the build | v1 `normalizeVis` (486-489); the v1 path at retire |
| `build-atlas.ts` | Refactor (M) | World assembly (715-1125) split into stages over worlds, the map tree and campaigns | `"Astrath Deeprealm"` fallback (1113), single `defaultWorld` |
| Save endpoint `vite-plugin-atlas-save.ts` | Refactor (M) | Router + one module per route; per-file routes | `handleSaveRequest` reverse-compile save (482-929), DM-atlas overlay routes (1582-1600), at retire |
| Shared canvas (new) | New (M) | One ocean/frame/map-tree canvas component for the viewer and editor E1, on `src/atlas/ocean/` | Nothing |
| Viewer `AtlasViewer.tsx`, `WrappedWorld`, `featureShapes`, `EntityPanel`; Browse, Timeline, Credits, Landing | Refactor (M) | On the shared canvas; breadcrumb, campaign links, region card, story panel with monument strip, people and Inside lists, route labels, deep links | Flat map `<Select>` (650-662), `worlds[0]` uses (301, 373) |
| Editor page `AtlasPlacementEditor.tsx` | Throw away at retire | Lives, with all fixes merged, until cutover | The page (2,876 L), `useMapLayers.ts`, `editor/placementOverrides.ts`, `useDraftCore` + per-feature drafts, `session/` (870 L), `useUndoStack.ts`, `save/planUnifiedSave` + `canonicalPlacementSave`, `tabs/` (2,564 L), `shell/` incl. `railRegistry`, `yaml/buildFullWorldYaml.ts` |
| Pure editor helpers | Keep | Used by the new editor | `layerGeometry`, `mapClickCoord`, `pinClickIntent`, `saveGate`, `map/geometry`, `ruler/` stay |
| Map Import Wizard | Throw away the UI at retire | Replaced by Add map (E3) | The wizard; the server-side EXIF strip (#102) and staging/merge logic stay |
| Sound editor `sound-editor/` (597 L) | Port or park per the parity list | Sound areas are `world.yaml` items with fail-closed visibility; runtime `sound/` stays | The old panel, at retire |
| Categories `categories/` (1,223 L) | Throw away at retire | Replaced by E8, the unplaced list and Ctrl+K | `CategoryPanel`, `EntityEditPanel`, `EntityEditorPanel`, `useEntityEditDraft` |
| Calendar | Keep Timeline | Calendar fields in the world inspector (parity list) | `calendar/CalendarPanel.tsx`, at retire |
| Tests | Keep the spine tests | Flow tests check files on disk and each campaign's output | Editor-page integration tests (`placement-save-integration`, `world-override-save`, `world-yaml-conflict-recovers`, `save-entity-edit-pending`), session/undo hook tests, `useMapLayers` and override-migration tests, at retire |

## 3. The 12 open PRs

**Recommendation: merge all 12**, in the State.md order (99, 100, 106, 102, 103, 107, 104, 105, 109,
108, 110, 101), except **#109 and #110 first**: they fix the live site's checks now and touch only
scans and the loader. All twelve are built, gated and reviewed, and the old editor now lives for
months (including `tidemarrow/02` fog drawing), so its fixes matter. Alternative: close the four
moot ones (#99, #103, #105, #107) and save four gate runs.

| PR | Verdict | Reason |
|---|---|---|
| #109 arch-01 scans find real artifacts | Merge first | The fog and image-twin scans skip on `dist` today |
| #110 arch-07 invalid visibility is dm | Merge second; superseded by R-11a | Fails closed now |
| #99 eval-45 deleted pins on any map | Merge; superseded at retire | Safety effect once there are several maps: a deleted pin must really go |
| #100 eval-46 one spoiler-leak rule | Merge; superseded by R-11a/c | One `linkLeaksToPlayers` predicate |
| #106 eval-50 Publish Check matches build | Merge (stacked on #100); superseded by R-11c | Publish Check stops saying "no leakage" for a failing atlas |
| #102 eval-48 wizard zip strips EXIF | Merge; wizard UI superseded at retire | GPS EXIF can reach the still-public repo |
| #103 eval-47 Discard all clears world settings | Merge; superseded at retire | Prevents lost or phantom edits |
| #107 eval-44 soundscape draft per map | Merge (stacked on #103); superseded at retire | Prevents edits landing on the wrong map |
| #104 eval-27 one reduce-motion switch | Merge after Isak checks the button | Viewer code carries over |
| #105 eval-49 ruler and drawing one click | Merge; superseded at retire | Safety effect with fog: a click meant for the ruler must not draw a reveal |
| #108 arch-04 delete dead EntityReadingView | Merge | Small viewer deletion |
| #101 docs State.md and workflow notes | Merge last; State.md superseded by R-05 | Carries the arch-2026-11 tickets onto `main` |

## 4. Schema v2 sketch

Coordinates stay local to each map (`[x, y]`, top-left, `CODEBASE_MAP.md` invariant 3).

```yaml
# content/_atlas/atlas.yaml
schemaVersion: 2
ocean: { width: 400000, height: 300000, sea: default }
worlds: [astrath-deeprealm]
campaigns: [main, sandbox]                   # files in content/_atlas/campaigns/
onOcean: [{ map: varn, x: 0, y: 0, scale: 1, rotation: 0 }]

# content/<world>/_atlas/world.yaml
schemaVersion: 2
world: { id: astrath-deeprealm, name: Astrath Deeprealm }
maps:
  - id: varn
    visibility: { main: player, sandbox: rumor }       # a campaign not named = dm
    layers: [{ src: images/varn.png, x: 0, y: 0, width: 16000, height: 12000 }]
    scale: { unitsPerPixel: 0.5, unit: mi }
    zoom: { min: -4, max: 2 }
  - id: saltmere
    visibility: { main: player }
    parent: varn                                       # absent = on the ocean
    frame: { x: 3100, y: 2200, width: 400, height: 300, rotation: 12 }   # in varn's pixels
    enterZoom: 1
    regions: [{ id: salt-marsh, polygon: [...], visibility: dm, note: salt-marsh }]
    routes:  [{ id: coast-road, points: [...], speed: 24, visibility: { main: player } }]
    pins:    [{ note: harbour-master, x: 120, y: 340, visibility: { main: player } }]
    sound:   [{ id: gulls, polygon: [...], visibility: { main: player } }]
notes:                                       # the only place for per-campaign note visibility
  harbour-master: { visibility: { main: player, sandbox: dm }, basedOn: player, belongsTo: [saltmere] }

# content/_atlas/campaigns/<id>.yaml
id: main
name: Main campaign
maps:                                        # fog and state; a map not listed = unknown
  varn: { state: fogged, reveals: [[...]], conceals: [], featherPx: 24 }
  saltmere: { state: open }
```

- **One resolver, fail closed.** Missing, invalid, or a campaign not named = `dm`. A bare value is
  allowed (every campaign), but the migration and the editor write the per-campaign form, so a new
  campaign starts hidden. A map hidden in a campaign hides its subtree there; a pin ships only if its
  map is not unknown and it is not under that campaign's fog. The scans take each campaign's
  must-not-ship set from the same resolver.
- **Notes.** Frontmatter `atlas.visibility` stays scalar. The `notes:` block can only narrow: an
  override never widens a vault `dm`. `basedOn` records the vault value it was set against; if the
  vault value changes, the override falls back to `dm` and the Publish check flags it.
- **No `world.dm.yaml`, no DM folder.** The repo is private before real content, and a file split by
  "hidden" can't say "hidden in A, shown in B". The split is the build: only each campaign's player
  build ships, in its own dir, sharing no asset dir with another campaign, and its `atlas.json`
  names only its own campaign. DM blocks stay inline, stripped by `dmMarkup.ts`.
- **Placements** move from frontmatter into `world.yaml`. After cutover a v2 world where any note
  still has `atlas.placements` fails the build, and Sync strips them.
- **Images.** One lossless image per map, fog baked per campaign as today. Tile pyramids (lossless
  WebP, fog baked before tiling) wait for the triggered tile phase.
- **Migration** (`atlas:migrate-v2`, dry run first, idempotent, run in the cutover ticket): today's
  map becomes a top-level ocean map, six layers unchanged; its `fog` becomes `campaigns/main.yaml`;
  the 6 notes with `atlas.placements` (of 7) move pins into `world.yaml`; every map and item that
  ships today gets `{ main: player }`. Checked by a before/after diff of every campaign output. A
  v2-to-v1 down-migration is kept until retire; the rollback window ends at the first new-editor
  save on real content.

## 5. Phases

Every ticket merges on the gate. Phase 3 and 4 tickets are written before phase 2 ends.

| Phase | What | Sessions | Weeks (light) | Isak looks at |
|---|---|---|---|---|
| 0 Guard and quick wins | R-01 guard first, #109, #110, Q-01..Q-04 | 6-7 | 2-3 | Links that work, a fitted map, the menu, a region card. **Safe stop** |
| 1 Spine and PRs | Other 10 PRs, R-02..R-05, ADR-0001 addendum, ADR-0002 | 8-10 | 3-4 | A publish log with every scan reading `dist`; `docs/GOALS.md` agreed |
| 2 Schema v2 and campaigns in the pipeline | R-10..R-20; ADR-0003, ADR-0004 | 17-20 | 6-8 | `npm run atlas:tree` on the v2 test world, per campaign; today's site unchanged |
| 3 Shared canvas (4a) | Ocean/frame/map-tree component; viewer on it; campaign links | 6-8 | 3-4 | Ocean > continent > city > back on the local test world. **Safe stop** |
| 4 Editor core | Router, command store, E0-E5, Place pin, E9, Draw route with distance/time; v2 test world only; ADR-0005, ADR-0006 | 12-14 | 5-6 | Add a map inside a map, pin it, draw a route, reload |
| 5 Story (4b) | Region card and story panel, monument strip, people and Inside lists, route labels, deep links, Browse, Timeline, Credits, Landing on v2 | 8-10 | 3-4 | Read a region, a person, a monument; follow three links |
| 6 Editor jobs, parity, cutover | E13 (start hidden / copy visibility from X), E6, E7, E8, E10 Sync, E11, E12, parity items; **cutover last** | 14-16 | 6-7 | Every job on the parity list in the new editor. **Safe stop** |
| H Private hosting | H-01..H-04, ADR-0007; earliest after phase 2, default just before the first real Sync (`tidemarrow/01`), blocks no other phase | 4-5 | 2 | Each campaign site refuses a stranger; repo Private |
| 7 Retire | Delete section 2's "deleted" column, v1 path, down-migration, arch-06 | 3 | 1-2 | `grep` finds no `AtlasPlacementEditor`, `worlds[0]`, `placementOverrides` |
| T Tiles (only if triggered) | Pyramid step; fog scan replaced in the same PR; ADR-0008 | 5-6 | 2-3 | A real map > ~8k px that was slow on a phone, now smooth |

Total without T: about 78-93 sessions plus slack, 31-40 weeks: **7-9 months at light pace**.

**Parity list (cutover blocks on every line Isak uses):** place and move pins; add map images and
layers (wizard, upload); regions; routes; fog drawing; sound areas; entity/note editing for the six
content types; world settings and calendar; player keys (character secrets); Sync; Publish check;
paste markdown. Isak crosses out what he never uses at the start of phase 6.

**Cutover ticket:** run the migration, check the every-campaign diff, disable the old editor's
save, move the new editor to `/atlas/edit`, Sync strips placements.

**Tile trigger and rule:** a measured problem on a real map (over about 8k px, slow or refused on a
phone), or the ocean's total image weight. The tile ticket replaces the fog scan's check in the same
PR: tile pixels against each campaign's mask, no unfogged twin, no other campaign's tiles.

## 6. Tickets: phases 0, 1, 2 and H

New folder `docs/tracker/rebuild-2026-11/issues/`, same format as `tidemarrow/issues/`.

| Id | Title | Size | Blocked by | One line |
|---|---|---|---|---|
| R-01 | Real Sync refuses while hosting is public | S | - | `hosting: public` in `atlas.config.json`; a non-dry-run Sync refuses; the gate fails if `content/` holds files from vault folders (in `sync-map.json` or carrying Sync's source marker); `tidemarrow/01-03` set Blocked by H-04 |
| Q-01 | Wikilinks open; unpublished links are plain text | S | - | No dead "Planned link" in the player view; a test checks every player wikilink resolves or renders as text |
| Q-02 | Maps open fitted to the screen | S | - | Player view and editor fit the map on open, not max zoom |
| Q-03 | Menu renders above the map | S | - | The hamburger menu's z-index sits over Leaflet panes |
| Q-04 | Region hover card in today's viewer | S | - | Hover shows name, summary and picture, built on `src/atlas/peek/` |
| R-02 | Missing `world.yaml` visibility loads as dm | S | #110 | Regions, routes, sound areas; ADR-0001 addendum |
| R-03 | Scans fail on a missing artifact | S | #109 | arch-09, widened: in publish mode a missing listed dir fails every scan |
| R-04 | Adopt the rebuild goals | S | - | `docs/GOALS.md`, contradicting docs rewritten, ADR-0002 |
| R-05 | Rebuild queue in State.md | S | #101 | Phases, stop points, PR outcomes |
| R-10 | Schema v2 types | S | R-04 | Map tree, frame, campaign, per-campaign visibility, `notes:` block |
| R-11a | Pure per-campaign resolver | S-M | R-10 | Every item and note, hidden subtree, narrow-only `notes:`, `basedOn` fallback; returns each campaign's must-not-ship set; folds arch-08 |
| R-11b | Build calls the resolver | S | R-11a | Includes arch-02 (sound areas in fog) |
| R-11c | Old Publish Check calls the resolver | S | R-11a | Same verdict as the build; preview wiring comes in phase 6 |
| R-12 | v2 loader | M | R-10 | v1 only with no `schemaVersion` or `1`; a v1/v2 mix fails; v1 loads as one world, campaign `main` |
| R-13 | Build assembles every world and the map tree | M | R-11b, R-12 | Split `build-atlas.ts:715-1125`; a `worlds[0]` grep over `scripts/` in the gate, with a shrinking allowlist |
| R-14 | Sync targets any world | S-M | R-13 | Drop `sync.ts:110`'s `worlds[0]`; two-world memory-port test |
| R-15 | Scan registry lists campaign dirs | S | R-03, R-12 | `artifactDirs` reads campaigns from `atlas.yaml` inside the one registry; lands before any campaign output |
| R-16 | Three-level test world, two campaigns | S | R-12 | Own content root, differs by visibility and fog; `npm run atlas:tree` |
| R-17 | One player output per campaign: visibility | M | R-15, R-16 | Own dir per campaign, no shared asset dir; `atlas.json` names only its campaign; unknown/dm maps and their frames absent; sentinel fixtures (item hidden only via `notes:`, item hidden in one campaign only) over every file: images, audio, search index |
| R-18 | Fog baked per campaign; fog scan source-driven | M | R-17 | Every map fogged in C's source is fogged in C's output; missing source fog fails |
| R-19 | Publish runs every campaign | S | R-17 | Orchestrator and integrity smoke cover a second campaign |
| R-20 | Migration script and down-migration, dry run only | S-M | R-17, R-18 | `{ main: player }` form; before/after diff of every campaign output on a copy of `content/` is empty |
| H-01 | Cloudflare Pages, one project per campaign | M | R-19 | Access on production and preview deployments before the first real deploy (canary only until then); direct upload from the scanned job only; Cloudflare Git builds and previews off |
| H-02 | Access test | S | H-01 | Without login and with an A-only login, B's atlas, search index, an image and an audio file are refused |
| H-03 | Pre-switch safety check | S | H-02 | Repo holds only test content (R-01's check, history included); all scans pass per campaign |
| H-04 | Switch | S | H-03 | Isak's clicks: GitHub Pages off, repo Private, `hosting: private`; docs get the new URLs; unblocks `tidemarrow/01` |

## 7. Risks and open questions

1. **How players get in [Q].** Recommendation: Cloudflare Access with a one-time email PIN, one
   Pages project and hostname per campaign, each with its own allow list; no shared picker on the
   hosted site.
2. **What is on the parity list.** Cutover waits on every line, so an unused line costs weeks.
   Recommendation: Isak crosses out lines at the start of phase 6; until then all stay. Sound areas
   and paste markdown are the likeliest to go.
3. **Where the v2 test world lives before cutover.** A v1/v2 mix fails the build, so it can't sit in
   `content/`. Recommendation: its own content root (`content-next/`), built by its own command,
   local only; not published until cutover.
4. **When tiles are worth it.** Recommendation: measure once Tidemarrow's real map is in: open it on
   Isak's phone; start phase T only if it is slow or refused, or the ocean's images pass a size
   budget set then. Lossless stays the rule either way.
5. **CI minutes once the repo is private.** Private repos get limited Actions minutes, and they ran
   out once (agent-retro/03). Recommendation: the local gate stays the merge bar; the deploy job only
   builds, scans and uploads directly to Cloudflare, without `test:ci`.
