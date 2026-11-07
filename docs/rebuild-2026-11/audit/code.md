# Code audit: redesign or rebuild? (2026-11-07)

Read-only audit of `main` (tip `983b5d0`) against the owner's five goals. Paths are relative to the
repo root. "L" counts are `wc -l`. Nothing was run beyond `wc`/`grep`/`git log`.

## Size at a glance

| Piece | Lines | Notes |
| --- | --- | --- |
| `src/` non-test | ~37.7k | 35 domain folders under `src/atlas/` |
| `scripts/` | ~12.4k | `build-atlas.ts` 1,516; `vite-plugin-atlas-save.ts` 1,956; 40 files in `scripts/atlas/` |
| Tests | 344 files, ~51k lines, ~3,300 `it/test` cases | 104 files flat in `src/test/`, rest in 35 subfolders |
| `src/pages/AtlasPlacementEditor.tsx` | 2,876 | one component `AtlasPlacementEditorInner` spans 234-2427 |
| `src/pages/AtlasViewer.tsx` | 1,045 | 58 hook calls |
| Churn | 198 commits touch the editor page, 112 the viewer, of 2,214 total | |

## A. Data model

**Shape** (`src/atlas/content/schema.ts`): `AtlasProject { worlds[], maps[], entities[], placements[],
assets[], calendar? }` (8-25). `MapDocument` (73-89) owns `layers[]`, `regions?`, `routes?`, one
`fog?`, `scale?`, `grid?`, `soundscape?`, `wrapX`. `MapLayer` (189-200) is just an image rect
(`x,y,width,height,opacity,zIndex,rotation?,tileSrc?`) in the map's pixel space. `Region` (168-178) is a
simple polygon (no holes) with optional `entityId` and `visibility`. `Route` (149-164) has waypoints as
coords or `{entityId}`, `mode`, `speed`, resolved at build. `FogOverlay` (180-187) is one per map:
`reveals[][]` minus `conceals[][]`, `featherPx`. `MapPlacement` (276-289) = entity on map at x/y, own
`visibility`, `pin` style, `secretId`. Entities and placements are separate objects (header comment 1-3),
which is the right call and worth keeping.

**Where it is authored.**
- Maps/layers/regions/routes/fog/sound: one `content/<world>/_atlas/world.yaml`, parsed by
  `scripts/atlas/loadWorldConfig.ts` (520 L). Today's file (129 L) has **one** map,
  `astrath-deeprealm-overview`, 200,000 x 150,000 px, with six AI-generated images laid side by side as
  layers, all `zIndex: 20` (`world.yaml:14-115`). That is the current "nested maps": separate images
  parked on one giant canvas.
- Placements: entity frontmatter `atlas.placements[]` (`scripts/atlas/parseFrontmatter.ts:49-50,105,
  172-225`). Moving a pin rewrites the note.
- Visibility for notes: `src/atlas/content/readNote.ts` + `visibility.ts`, missing/invalid -> `dm`
  (ADR-0001).

**Multiple worlds: schema yes, pipeline no.**
- `worlds[]` and `MapDocument.worldId` exist, but the build emits exactly one world:
  `const worldId = cfg.defaultWorld` (`scripts/build-atlas.ts:725`) and `worlds: [{ id: worldId, ... }]`
  (1110-1121), with a hard-coded fallback name `"Astrath Deeprealm"` (1113). `atlas.config.json` has a
  single `defaultWorld`. `loadWorldConfig(contentRoot, worldId)` reads one file
  (`loadWorldConfig.ts:160-163`).
- Consumers assume `worlds[0]`: `AtlasViewer.tsx:301,373`, `sync.ts:110`, editor `baseWorld` fallback
  (`AtlasPlacementEditor.tsx` ~389). 33 `worlds[0]`/`defaultWorld` hits outside tests.

**Nested maps: not modelled at all.** No parent/child map, portal, sub-map or "drill into" concept exists
anywhere in `src/` or `scripts/` (grep for `parentMap|childMap|submap|portal|drillDown|linkedMap` hits
only shadcn `Portal` components). Map switching is a flat `<Select>` shown when `maps.length > 1`
(`AtlasViewer.tsx:650-662`), or a jump via search/deep link (`463, 910, 960, 1030`). A layer has no own
scale, no min/max zoom, no level-of-detail; `tileSrc` is parsed and round-tripped but no renderer uses it,
and fog refuses tiled layers (`build-atlas.ts:1341-1343`). Viewer zoom is a fixed `minZoom -6 / maxZoom 4`
(`AtlasViewer.tsx:756-757`).

**Gaps against goals 1-2.**
- Hidden zones: regions carry `visibility`, but `world.yaml` items default to **player** on missing or
  invalid values (`loadWorldConfig.ts:486-489`), deliberately out of scope of ADR-0001
  (`docs/adr/0001-missing-visibility-is-dm.md`, "world.yaml items ... are out of scope"). Goal 5's spine
  ("missing/invalid counts as dm") does not hold for zones, routes or sound areas today.
- Fog: one static overlay per map, no per-session/progressive reveal history, baked into layer PNGs at
  build (`scripts/atlas/redactFogMap.ts`, 125 L). Solid for "players never see fogged pixels", but a
  nested-map atlas needs fog per map node and probably reveal state that the DM advances.
- Travel: routes + `MapScale.unitsPerPixel` give distance and travel time (`src/atlas/map/geometry.ts`,
  `routeTooltipLines` in `featureStyle.ts:61`); a ruler exists (`src/atlas/ruler/`). Routes are
  per-map only; nothing crosses maps.
- Notes on every place: entity bodies + player-local notes (`src/atlas/notes/playerNotes.ts`,
  `EntityPanel.tsx:94`). A region links to at most one entity (`Region.entityId`).

**What would have to change (model).** Introduce a map tree: `MapNode { id, worldId, parentId?,
frameInParent (polygon or rect in parent coords), image layers, own scale, zoomRange }`, a top
"multiverse" root above worlds, and per-node regions/routes/fog/placements. Coordinates stay local per
node (today's `[x,y]` top-left convention, `CODEBASE_MAP.md` invariant 3, is fine). Build must loop
over worlds (one `world.yaml` per world, or a split per map) and resolve cross-map links. Every
`world.yaml` item gets fail-closed visibility. This touches `schema.ts`, `loadWorldConfig.ts`,
`build-atlas.ts` assembly (~715-1125), `projectMapForPlayer.ts` (49 L), `check-fog-safety.ts`,
`check-artifact-shape.ts`, `buildFullWorldYaml.ts`, and the schema-version migration
(`scripts/atlas/schemaVersion.ts`). It is a schema v2, not a tweak.

## B. Editor architecture: why it is hard to work with

**One god component.** `AtlasPlacementEditorInner` runs from line 234 to 2427: ~950 lines of state and
handlers (234-1182) then a single ~1,240-line JSX `return` (1183-2426). The file has 103 imports,
34 `useState`, 12 `useEffect` (+`useLayoutEffect`), 19 `useMemo`, 7 `useCallback`, 10 `useRef`, and 27
`xRef.current = ...` latest-value assignments, the usual sign of handlers fighting stale closures
(e.g. `onSaveClickRef` 1117, `planSaveRef` ~939, `switchToMapRef` 372).

**Surface area (modes and tools).** 14 rail panels (`src/atlas/shell/railRegistry.tsx:58-77`: six
content categories, Pins, Regions, Routes, Fog, Sound, Publish, Player keys, Sync), plus a Layers /
Settings tab pair (`AtlasPlacementEditor.tsx:1883-1917`), Map settings / World details / Assets
dialogs (1147-1149), a command palette, Paste markdown, Map Import Wizard, Import Staging, Diff preview,
Discard, Save help, and cross-cutting toggles: DM/Player view mode (194-230), ruler, `editGeometry`,
`lockAspectRatio`, `chainPlaceMode` (582), `pendingId` click-to-place (239), show layers/regions/fog
preview. Many are independent booleans in the same component, so modes can combine in ways nobody
designed (ruler + chain-place + geometry edit).

**State lives in at least eight places**, each with its own persistence and undo rules:
1. `project`: the **built DM atlas.json** loaded at runtime (235), i.e. the editor edits a compiled
   artifact and reverse-maps changes onto sources.
2. Pin `overrides` in localStorage, keyed `${mapId}:${entityId}`, v1->v3 migration
   (`src/atlas/editor/placementOverrides.ts:80-135`).
3. Local layers in a second localStorage key (`src/atlas/useMapLayers.ts:92,196,391`, 429 L).
4. `mapOverride` / `worldOverride` React state (324, 329).
5. Region/route drafts as `{edits, added, deleted}` overlays (`useDraftCore.ts`, 95 L),
   fog draft (`useFogDraft`), soundscape draft, calendar draft (560).
6. Entity edit draft, saved from **its own panel**, not by the unified Save (`openPendingEntityEdit`,
   ~808-819: "Your entity edit saves from its own panel").
7. IndexedDB session snapshot of all of the above per map (`src/atlas/session/sessionSnapshot.ts:25-40`,
   `useEditorSession.ts` 401 L).
8. In-memory undo stack of full snapshots, map-aware (`useUndoStack.ts` 131 L, wired at 374-376).

**Saving.** `onSaveClick` (867) -> `planUnifiedSave` (`src/atlas/save/planUnifiedSave.ts`, 133 L) ->
diff modal -> `POST /__atlas/save`. The plan rewrites entity frontmatter for every dirty placement
(`canonicalPlacementSave.ts`) and **re-serializes the whole `world.yaml`** from the in-memory
`MapDocument` (`buildWorldYamlContent`, `src/atlas/yaml/buildFullWorldYaml.ts`). Conflicts use `baseHash`
(sha256 at load); a world.yaml conflict triggers a re-read, rebuild of the batch and a notice
(`onSaveConflict`, ~944-967, `worldYamlConflict.ts` 141 L). Server side `handleSaveRequest` is ~450 lines
(`vite-plugin-atlas-save.ts:482-929`) and then runs a full rebuild in-process (`runAtlasBuild` 956).
After save, drafts are reconciled against the new build (`session/mapDraftsAfterSave.ts`).

**Diagnosis.** The previous review was right that the pure pieces are good (`placementOverrides`,
`layerGeometry`, `saveGate`, `pinClickIntent`, `planUnifiedSave`, `applyCollectionDraft`, drafts with
undo). It was wrong that "extract" fixes the problem. The difficulty is structural, not size:
- The editing model is "overlay drafts on a compiled artifact, then reverse-compile". Each feature
  added its own overlay type and its own merge-after-save rule. A map tree (goal 1) multiplies every
  overlay by node and adds parent/child geometry, which this model cannot absorb cleanly.
- There is no single document/store with commands; the page is the store. Extracting JSX into
  components would still leave 8 state homes and ~27 ref bridges threaded through props.
- Two save paths (unified Save vs entity panel) and two persistence layers (localStorage keys plus IDB
  snapshot) for the same drafts.

## C. Player viewer vs goal 3 (story engine)

**What exists (good, mostly player-safe, tested):**
- Hover peek cards on pins and wikilinks (`src/atlas/peek/`: `usePeekController.ts` 108 L with open
  delay/close grace/cooling, `HoverPeekCard.tsx`, wired at `AtlasViewer.tsx:390-519`); tap-peek on touch.
- Entity panel (`src/atlas/entity/EntityPanel.tsx`, 717 L): rendered body, player profile block (533),
  image gallery + lightbox (535-560, 439), relationships as "connections" (325-342), backlinks (591),
  encrypted per-player secrets unlocked in-browser (386-392, `src/atlas/secrets/`), player notes (577),
  print handout (482). Desktop aside / mobile sheet split.
- Cmd-K search palette + one shared search module (`src/atlas/search/search.ts`), Browse page
  (361 L), Timeline page with world calendar (279 L), deep links with one resolver
  (`resolveDeepLink.ts` 80 L), visited places, "Wander" discovery prompts (`src/atlas/wander/`),
  soundscapes per area (`src/atlas/sound/`), minimap, credits page, PWA/offline.

**Gaps:**
- Regions are not story surfaces: hover shows only a name `Tooltip` (`featureShapes.tsx:57-60`); click
  opens the linked entity and a Popup with name + summary (`WrappedWorld.tsx:78-86`). No peek card for
  regions, no hover-highlight, no "what is in here" list.
- No zoom-driven storytelling: nothing changes with zoom except pin labels
  (`src/atlas/pins/labelVisibility.ts`); no transition into a child map (none exist, see A).
- No curated narrative objects: no tours/chapters, "examples and monuments" are just entities of some
  type; people are entities with a profile, discoverable only via search, links or Browse.
Distance to goal 3: **medium**. The reading layer (panel, peek, search, links, secrets) is a solid base;
the missing pieces are region-as-content, map-tree navigation and curated paths.

## D. Pipeline

**Solid, reusable as-is (clear boundaries, tested):**
- Note reading and safety vocabulary: `src/atlas/content/readNote.ts`, `visibility.ts`, `dmMarkup.ts`,
  `slugify.ts`, `parseWikilinks`, `markdownCore`, `renderEntityMarkdown`, `projectEntityForPlayer.ts`
  (shared by build and editor preview), `scanContentFolder.ts`. Parity tests lock the `scripts/atlas/`
  shims (`src/test/content/*-parity.test.ts`).
- Safety scans: `scripts/check-*.ts` (secrets 161 L, derived 324, player-secrets 155, image privacy
  204, fog 344, artifact shape 303) + `scripts/atlas/publish-orchestrator.ts` + fault-injection smoke
  (`publish-integrity-smoke.ts`). They read output dirs only, so they survive any frontend rewrite;
  shape/fog checks need updating for a v2 model.
- Sync from Obsidian: `src/atlas/sync/sync.ts` (349 L) talks only to a `VaultPort`
  (`vaultPort.ts:1-19`) with three adapters (dev endpoint, memory for tests, Node fs for
  `npm run atlas:sync`). Good ports-and-adapters design. One coupling: it needs the DM-built
  `AtlasProject` to know existing entities (`DmBuildRequiredError`, `assertDmBuildLoaded`,
  `syncWorldFromProject` 94-134) and assumes `worlds[0]` (110).
- Publish: `.github/workflows/publish-atlas.yml` runs typecheck/lint/format, `test:ci`, player build,
  `vite build`, `atlas:scan`, then Pages (51-120). Reusable unchanged.
- Fog baking (`redactFogMap.ts`) and asset encoding (`src/atlas/assets/imageEncoding.ts`,
  `mapLayerTarget.ts`).

**Tangled or needing rework:**
- `scripts/build-atlas.ts` (1,516 L) is a long orchestrator: parse -> filter -> resolve links -> world
  assembly -> fog -> assets. Its I/O seam is good (`buildAtlas` is pure-ish, `writeBuildOutput` writes,
  nothing written on failure), but world assembly is single-world and lives inline (715-1125). Needs a
  split into stages for multi-world/map-tree; the stages themselves are reusable.
- `scripts/vite-plugin-atlas-save.ts` (1,956 L) bundles the loopback gate (`rejectNonLoopback` 1509,
  `isAllowedDevRequest` 274), save (482-929), in-process rebuild (956-1014), image upload/delete,
  vault scan/folders/image copy (1139-1435), local writes, DM-atlas overlay routes (1582-1600) and
  `publish-push` (git commit+push, `scripts/atlas/runPublishPush.ts`). The security core and the
  `baseHash` write contract are worth keeping; the file should become a router plus one module per
  route.
- `world.yaml` write-back re-serializes the whole file from the compiled `MapDocument`; anything the
  loader drops or normalizes (defaults, unknown keys) is at risk on round-trip. `buildFullWorldYaml.ts`
  and its tests are the guard today.

## E. Tests

~3,300 cases. Heaviest areas: `content/` 25 files, `editor/` 24, `secrets/` 20, `import/` 19, `sound/`
18, `atlas/` 16, `wayfinding/` 14 (peek, wander, visited), plus ~25 integration tests that run
`buildAtlas`/`runBuild` against fixture vaults (`src/test/fixtures/{atlas-build,sentinel-vault}`).
17 test files render or reference `AtlasPlacementEditor`, 8 the viewer.

**Keep in any rebuild (they encode the safety spine, not the UI):** content/parity/dmMarkup tests,
`frontmatter-fail-closed`, `atlas-build`, `build-atlas-programmatic`, `build-failure-writes-nothing`,
`build-lock-until-settled`, `derived-secret-scan`, `sentinel-scan`, `check-image-privacy`,
`atlas-routes-fog`, `fog-effective-lit`, `artifact-shape`, `atlas-save-plugin`,
`atlas-dev-request-guard`, `local-fs-save`, `atlas-dm-tools-gate`, `browser-safe-globals`, secrets,
sync (memory port), search, peek/wander pure tests, `layerGeometry`/resize tests.
**Would be rewritten:** editor page integration tests (`placement-save-integration`,
`world-override-save`, `world-yaml-conflict-recovers`, `save-entity-edit-pending`, session/undo hook
tests) because they pin today's overlay/draft model, and `useMapLayers`/override migration tests.

## F. Verdict

Rebuild the **editor** and the **map model**; keep the **pipeline core and safety spine**; refactor
the viewer onto the new model. Not a full rewrite: roughly 40-50% of `src/` + `scripts/` carries over.

| Verdict | Module(s) | Why | Size |
| --- | --- | --- | --- |
| Keep | `src/atlas/content/` (readNote, visibility, dmMarkup, slugify, wikilinks, markdown, projectEntityForPlayer, scanContentFolder, atlasGuard) | Single owners of the safety vocabulary, parity-tested, used by build + scans + preview | - |
| Keep | `scripts/check-*.ts`, `publish-orchestrator`, integrity smoke, `publish-atlas.yml` | Output-dir scans, independent of UI | S (update shape/fog checks for v2) |
| Keep | `src/atlas/sync/` + `VaultPort` adapters, `src/atlas/import/` staging/merge logic | Clean port boundary, memory-port tests | S (drop `worlds[0]`, multi-world target) |
| Keep | `src/atlas/secrets/`, `profiles/profileBuild`, `search/`, `peek/`, `wander/`, `visited/`, `sound/` runtime, `assets/imageEncoding`, `redactFogMap`, `map/geometry`, `layerGeometry`, `mapClickCoord` | Pure, tested, model-agnostic | - |
| Keep (security core) | loopback gate, `baseHash` write contract, `sourcePathAllowlist`, `localFsSave` client | Proven access control and conflict model | - |
| Refactor | `scripts/build-atlas.ts` | Good I/O seam; split world assembly into stages and loop over worlds / map tree | M |
| Refactor | `scripts/vite-plugin-atlas-save.ts` | Router + one module per route; keep security tests | M |
| Refactor | `AtlasViewer.tsx`, `WrappedWorld`, `featureShapes`, `EntityPanel` | Reading layer is good; add map-tree navigation, zoom transitions, region peek/highlight, curated paths | M |
| Rewrite | Map model: `schema.ts` map/layer/region/fog types, `loadWorldConfig.ts`, `buildFullWorldYaml.ts`, schema v2 + migration of today's `world.yaml` | No nesting, single world, zones default to `player` | M |
| Rewrite | Editor: `AtlasPlacementEditor.tsx` (2,876), `useMapLayers`, `placementOverrides`, `useDraftCore` + per-feature drafts, `session/`, `useUndoStack`, `planUnifiedSave`/`canonicalPlacementSave`, `tabs/*`, `shell/*` (~10-12k L total) | One document store with commands (one undo, one persistence, one save path) over **source** data, not overlays on the compiled atlas; explicit tool modes; per-map-node editing. Reuse the pure geometry/intent helpers and dialogs where they fit | L |

**Why not "extract only" (re-checking the earlier review).** Extraction would shrink the file but keep
the eight state homes, the reverse-compile save and the flat map list. Goal 1 (map tree with zoom
transitions) and goal 4 (an editor that is easy to use) both land exactly on those three things, so the
editor's core has to change shape anyway. The pure modules the earlier review praised survive as
helpers inside the new editor.

**Order that keeps the spine intact:** (1) schema v2 + fail-closed visibility for every `world.yaml`
item + migration, with the build and scans updated and green; (2) viewer on v2 (map tree, region peek);
(3) new editor on a command store, behind the same `__INCLUDE_EDITOR__` gate and save endpoint; (4)
retire the old editor and its overlay tests.

Not checked: runtime behaviour (nothing was run), `src/atlas/categories/` and `sound-editor/` internals,
coverage numbers, and how many vault notes already carry `atlas.placements`.
