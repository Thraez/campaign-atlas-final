# Codebase Map — campaign-atlas-final

> **Purpose:** a navigation aid for humans and AI agents. It answers "where does X
> live and what must I not break?" so you can jump straight to the right file
> instead of re-deriving the architecture every session.
>
> **How to use it:** skim [Cross-cutting invariants](#cross-cutting-invariants)
> first — those are the rules that, if broken anywhere, break the whole product.
> Then jump to the subsystem you're touching. Each subsystem lists its key files
> (with the important exports), where execution enters, the traps, and the tests
> that cover it.
>
> **This is a map, not the source of truth.** Code wins on conflict. If a path or
> export here is wrong, fix the code first, then fix this line. Design rationale
> lives in [`README.md`](../README.md); build contracts live in the `scripts/`
> scan scripts.
>
> _Last verified: 2026-07-09 against branch `fix/audit-cleanup` (tip `020261b8`)._

---

## 30-second orientation

A D&D world atlas. The DM writes lore as **Obsidian markdown** (YAML frontmatter +
body) plus a `world.yaml` describing maps/regions/routes/fog. A **build pipeline**
compiles that vault into two JSON artifacts (`atlas.json` + `search-index.json`),
which a **React + react-leaflet** app renders. The app ships in **two modes** from
one codebase:

- **Player build** — safety-gated static site. DM-only content is stripped, fog is
  baked into images, the editor is tree-shaken out. This is what gets published.
- **DM build / dev** — full content plus the visual **placement editor**, backed by
  a **dev-only local save endpoint** that writes edits back to the vault on disk.

```
content/<world>/**/*.md  ─┐
content/<world>/_atlas/world.yaml ─┤
                          ├─▶ scripts/build-atlas.ts ─▶ public/atlas/atlas.json
                          │        (parse → filter by       + search-index.json
                          │         visibility → strip DM →        │
                          │         resolve links → redact fog)    ▼
                          │                              src/ React app (viewer + editor)
                          └────────── editor writes back via /__atlas/save (dev only)
```

The whole product is one promise: **players never see DM secrets.** Almost every
invariant below exists to keep that promise.

---

## Cross-cutting invariants

Read these before editing anything. They span subsystems and are enforced by tests.

| # | Invariant | Where it's anchored |
|---|-----------|---------------------|
| 1 | **Visibility has one vocabulary.** `EntityVisibility = player \| dm \| hidden \| rumor`. `player`+`rumor` ship; `dm`+`hidden` don't. Every gate imports from one file — never hardcode the strings. | [`src/atlas/content/visibility.ts`](../src/atlas/content/visibility.ts); `scripts/atlas/visibility.ts` is a re-export shim, never a redefinition |
| 2 | **Generated artifacts are never hand-edited.** `public/atlas/atlas.json`, `search-index.json`, `.local-atlas/`, `dist/`, `dist-ssr/`, `*.fog.png` are build outputs. Edit source + rebuild. A pre-tool hook enforces this. | build pipeline output |
| 3 | **Coordinate flip at the Leaflet boundary.** Atlas space is `[x, y]` top-left origin. Leaflet `CRS.Simple` is lat-up. Conversion is always `lat = mapHeight − y`, `lng = x`. Miss it in one place and pins/clicks land wrong. | `src/atlas/map/`, viewer + every editor layer, `mapClickToAtlasCoord` |
| 4 | **The editor is build-time gated.** `__INCLUDE_EDITOR__` (a Vite `define`) is `false` in player builds, so `lazy(() => import(...Editor))` becomes dead code and tree-shakes out. Never import editor modules from a player entry point. | [`vite.config.ts`](../vite.config.ts), [`src/App.tsx`](../src/App.tsx) |
| 5 | **The save endpoint is loopback-only and dev-only.** `apply: "serve"` keeps `/__atlas/*` out of prod bundles; `rejectNonLoopback` 403s any non-loopback request; writes additionally require a present, loopback `Origin`. | [`scripts/vite-plugin-atlas-save.ts`](../scripts/vite-plugin-atlas-save.ts) |
| 6 | **Build-time and runtime share byte-identical core logic via shims.** `slugify`, `stripDmBlocks`, wikilink parsing, and the visibility vocab live in `src/` and are re-exported by `scripts/atlas/` shims. Parity tests lock them. Change one → mirror the other. | `scripts/atlas/*.ts` shims + `src/test/content/*-parity.test.ts` |
| 7 | **The test suite must be sharded.** A single `vitest run` OOMs the coordinator (~4 GB) on ~151 files. Always run `--shard=N/4 --poolOptions.forks.maxForks=3` for all four shards and require all green. A lone shard can exit non-zero on a worker↔coordinator RPC timeout under load even with every test passing — re-run that shard alone to disambiguate. | `vitest.config.ts`, `docs/automation/code-quality-routine.md` |
| 8 | **Player builds must be scanned before they ship.** `npm run atlas:publish` chains the build with secret/derived/image/fog/shape scans. CI (`.github/workflows/atlas-pr-check.yml`) re-runs the player build + scans on every PR. | `scripts/check-*.ts`, `scripts/atlas/publish-orchestrator.ts` |

---

## Directory geography

| Path | What lives here |
|------|-----------------|
| `content/<world>/` | The Obsidian vault: entity `.md` files + `_atlas/world.yaml`. **Source of truth for content.** |
| `scripts/build-atlas.ts` | Build orchestrator (`runBuild` / `runBuildCore`). |
| `scripts/atlas/` | Build helpers (frontmatter, world config, fog redaction, asset validation) + `src/` re-export shims + publish/backup/audit tooling. |
| `scripts/check-*.ts` | Post-build safety scans (secrets, derived secrets, image privacy, fog safety, artifact shape). |
| `scripts/vite-plugin-atlas-save.ts` | Dev-only save endpoint (`/__atlas/*`). |
| `src/atlas/content/` | The data model + load boundary + content transforms (schema, loader, guards, markdown, wikilinks, DM-strip, projection). |
| `src/atlas/{search,map,pins,entity,categories,profiles}/` | Viewer-side domains. |
| `src/atlas/{editor,fog,regions,routes}/`, `useMapLayers.ts`, `layerGeometry.ts`, `useUndoStack.ts` | Editor-side domains. |
| `src/atlas/save/` | Save client + path allowlist (shared client/server). |
| `src/pages/` | Route-level screens (`AtlasViewer`, `AtlasPlacementEditor`, `AtlasBrowse`, `AtlasTimeline`). |
| `src/components/ui/` | shadcn/Radix wrappers (styling only, no business logic). |
| `src/hooks/`, `src/lib/` | Cross-cutting hooks + the logger seam. |
| `src/test/` | ~151 test files, subdivided to mirror feature areas; `fixtures/` holds test vaults. |

---

## Subsystems

### 1. Build pipeline — `scripts/build-atlas.ts`

Turns the vault into `atlas.json` + `search-index.json`. Two-pass: **PASS 1** parses
every file (incl. DM) to build a cross-reference index for spoiler-leak detection;
**PASS 2** builds entities and filters by visibility.

| File | Role | Key exports |
|------|------|-------------|
| `scripts/build-atlas.ts` | Orchestrator; parse → filter → strip DM → resolve links → redact fog → write | `runBuild`, `runBuildCore`, `BuildError`, `BuildResult`, `BuildFlags`, `enforceBuildGates`, `buildSearchIndex`, `redactMapsForPlayer` |
| `scripts/atlas/parseFrontmatter.ts` | YAML frontmatter + body via gray-matter | `parseFrontmatter`, `AtlasFrontmatter`, `ParsedFile` |
| `scripts/atlas/loadWorldConfig.ts` | Parse `world.yaml` (maps/regions/routes/fog/calendar), migrate, validate | `loadWorldConfig`, `WorldConfig`, `WorldConfigError` |
| `scripts/atlas/validateAsset.ts` | Path/extension/existence/size-budget checks for images | `validateAsset`, `isExternalAssetUrl`, `ASSET_SIZE_BUDGET_BYTES` |
| `scripts/atlas/redactFogMap.ts` | Bake feathered fog alpha mask into layer PNGs (sharp) | `redactLayer`, `FogRedactionError` |
| `scripts/atlas/schemaVersion.ts` | Detect/validate/migrate `world.yaml` schema version | `resolveAndMigrate`, `CURRENT_ATLAS_SCHEMA_VERSION` |
| `scripts/atlas/calendarDate.ts` | `YYYY-MM-DD` → sortable int via world calendar | `parseAtlasDate` |
| `src/atlas/profiles/profileBuild.ts` | Strip `profile.dm`, filter relationships by visibility + detect leaks | `stripDmProfile`, `filterRelationshipsForPlayer`, `compactProfile` |

**Entry:** `runBuild(flags)` (programmatic, used by the save endpoint — never calls
`process.exit`, throws `BuildError`); CLI via `npm run atlas:build` (+`--player --strict`).

**Traps:** wikilink *display text* is the main leak vector — a public note linking a
secret entity is redacted to `…`; unbalanced `%%`/`:::dm` delimiters are a hard build
error; invalid `visibility` values coerce to `dm` (fail-safe); player mode writes to
`public/atlas/` (DM builds go to gitignored `.local-atlas/`).

**Tests:** `src/test/atlas-build.test.ts`, `build-atlas-programmatic.test.ts`,
`build-full-world-yaml.test.ts`, `atlas-parser*.test.ts`, `atlas-region-route-strict.test.ts`,
`src/test/content/*-parity.test.ts`.

---

### 2. Safety scans — `scripts/check-*.ts` + `scripts/atlas/publish-*`

The gate between "built" and "shipped." Five scans + an asset audit, run in parallel
by the orchestrator; a fault-injection smoke test proves each scan still catches its
target fault.

| File | Role | Exit codes |
|------|------|-----------|
| `scripts/check-no-secrets.ts` | Sentinel-string + editor-fingerprint leak scan of artifacts | 8 / 9 / 10 |
| `scripts/check-derived-secrets.ts` | Derives secret names from DM/hidden vault entities, scans artifacts for them | 12 |
| `scripts/check-image-privacy.ts` | EXIF/IPTC/XMP metadata + secret-name-in-filename scan (sharp) | 13 |
| `scripts/check-fog-safety.ts` | Re-verifies player fog vs source geometry; refuses to certify when source unverifiable | 13–16, **17 = unverifiable** |
| `scripts/check-artifact-shape.ts` | Structural gate on `atlas.json` (no `sourcePath`/`profile.dm`/unstripped `%%`) | 11 |
| `scripts/atlas/publish-orchestrator.ts` | Runs all scans in parallel; fails if any non-zero | 0 / 1 |
| `scripts/atlas/publish-integrity-smoke.ts` | Clean/dirty variant pairs prove each scan still rejects faults | 0 / 1 |
| `scripts/atlas/snapshot-baseline.ts` | Copies `atlas.json` → `.last-published.json` for the editor's "since last publish" diff | never fails |
| `scripts/atlas/audit-assets.ts` | Size/orphan/broken-ref asset inventory | 13 on size errors |
| `scripts/atlas/backup.ts` | Portable vault snapshot zip | — |

**Entry:** `npm run atlas:publish` (snapshot → player build → vite build → orchestrator).
Individual scans take a build-output dir arg.

**Traps:** exit codes encode fault class (code `1` is reserved for bad invocation);
scans are read-only so parallel reads are safe, but the vite build must be fully
complete first; the smoke test pins to committed fixtures, so removing fixture secrets
breaks it by design.

**Tests:** `src/test/sentinel-scan.test.ts`, `derived-secret-scan.test.ts`,
`scanner-unreadable-skips.test.ts`, plus the smoke harness itself.

---

### 3. Dev save endpoint + editor gating — `scripts/vite-plugin-atlas-save.ts`

Persists editor changes to disk in dev, with access control, conflict detection,
atomic writes, backups, and optional in-process rebuild.

| File | Role | Key exports |
|------|------|-------------|
| `scripts/vite-plugin-atlas-save.ts` | The plugin: `POST /__atlas/save`, `GET /__atlas/read`, image list/delete, DM-atlas overlay | `atlasSavePlugin`, `handleSaveRequest`, `isAllowedDevRequest`, `rejectNonLoopback`, `serveLocalAtlas` |
| `src/atlas/save/sourcePathAllowlist.ts` | Single source of truth for writable paths (shared client+server) | `isWritableSourcePath`, `isWritableAssetPath` |
| `src/atlas/save/localFsSave.ts` | Browser client: validate → POST → typed errors | `saveAtlasPatchToLocalFs`, `ConflictError`, `SaveBusyError`, `hashContent` |
| `vite.config.ts` | Defines `__INCLUDE_EDITOR__`; registers the plugin `apply: "serve"` | — |
| `src/App.tsx` | Conditionally lazy-mounts the editor route behind `__INCLUDE_EDITOR__` + `isDmToolsEnabled()` | — |
| `src/atlas/dmTools.ts` | Runtime DM-tools gate (`VITE_ENABLE_DM_TOOLS`, defaults ON in dev) | `isDmToolsEnabled` |

**Access control (defense in depth):** `rejectNonLoopback` 403s any request whose
`Host` isn't loopback; writes additionally require a present loopback `Origin`.
`serveLocalAtlas` deliberately does *not* 403 — a LAN player can *read* the player
atlas but never *write*.

**Conflict model:** `baseHash` = `sha256:` of content-at-load. `null` = create-only,
`sha256:…` = update-only-if-match. It prevents silent overwrites but is not a lock
(a single `saveInFlight` boolean serializes saves; overlapping → 423).

**Traps:** `runBuild()` runs in the dev server's event loop (timeout via `Promise.race`,
doesn't abort); `__INCLUDE_EDITOR__` checks must be static for tree-shaking; asset
create-only skips 409 when bytes are identical (survives the localStorage replay loop).

**Tests:** `src/test/atlas-save-plugin.test.ts`, `atlas-dev-request-guard.test.ts`,
`local-fs-save.test.ts`, `atlas-dm-tools-gate.test.tsx`.

---

### 4. Viewer (player-facing) — `src/pages/AtlasViewer.tsx`

Leaflet map + searchable entities + detail panels + deep-linkable viewport.

| File | Role | Key exports |
|------|------|-------------|
| `src/pages/AtlasViewer.tsx` | Orchestrates map, markers, search, panels, URL sync | `AtlasViewer`, `MapController`, `ViewSyncController`, `WrappedWorld`, `PlacementMarkers` |
| `src/atlas/search/SearchPalette.tsx` | Cmd/Ctrl-K modal search (filters, ranking, keyboard nav) — **no Leaflet dep, unit-tested in isolation** | `SearchPalette`, `useRecentlyRevealedIds` |
| `src/atlas/search/parseSearchQuery.ts` | Pure query parser (quoted phrases vs terms) | `parseSearchQuery`, `matchesPhrases` |
| `src/atlas/search/snippet.ts` | Pure 140-char match snippet with `<mark>` | `snippet` |
| `src/atlas/map/geometry.ts` | Pure map-space geometry (route distance, travel time, grid lines) — type-only Leaflet import | `routeDistancePx`, `formatTravelTime`, `gridLines` |
| `src/atlas/entity/EntityPanel.tsx` | Entity detail (desktop aside / mobile sheet), notes, handout export | `EntityPanel`, `NotesPanel` |
| `src/atlas/pins/presets.ts` | Entity-type → pin visual preset registry | `PIN_PRESETS`, `PinPreset` |
| `src/atlas/pins/labelVisibility.ts` | Zoom-dependent label thresholding | `shouldShowLabel` |

**Entry:** page load fetches `atlas.json` + `search-index.json`, parses the deep-link
URL; `MapContainer` (react-leaflet) with flat CRS; Cmd/Ctrl-K opens search.

**Traps:** the `lat = mapHeight − y` flip is everywhere a coordinate crosses into
Leaflet; `PlacementMarkers` recomputes label collision on every zoom (screen-space, so
not memoizable); `SearchPalette` is controlled (query state lives in the page) and
`useRecentlyRevealedIds` silently no-ops if `.last-published.json` is absent.

**Tests:** `src/test/search/SearchPalette.test.tsx`, `phrase-search.test.ts`,
`atlas-viewer-snippet.test.ts`, `atlas/map-geometry.test.ts`, `entity/EntityPanel.test.tsx`.

---

### 5. Editor (DM-facing) — `src/pages/AtlasPlacementEditor.tsx`

Place entities on maps; author regions/routes/fog/layers; undo everything. The page is
large (~2.7k lines) but delegates to focused, testable modules.

| File | Role | Key exports |
|------|------|-------------|
| `src/pages/AtlasPlacementEditor.tsx` | Orchestrator: overrides, draft hooks, layer editor, save gate, tab render | `AtlasPlacementEditor` |
| `src/atlas/editor/placementOverrides.ts` | Pure localStorage override store (v1→v3 migration), key `${mapId}:${entityId}` | `loadOverrides`, `persistOverrides`, `finishLegacyMigration`, `overrideKey` |
| `src/atlas/useMapLayers.ts` | Layer CRUD hook + **durable per-layer lock** (`stripLockedGeometry`) | `useMapLayers`, `LocalLayer` |
| `src/atlas/layerGeometry.ts` | Pure corner-resize math (default / center-anchored / aspect-locked) | `resizeFromCornerDrag`, `clampLayerToCanvas` |
| `src/atlas/MapLayerEditableOverlay.tsx` | Draggable/resizable image overlay (body drag, corner handles, Esc cancel) | `MapLayerEditableOverlay` |
| `src/atlas/fog/useFogDraft.ts` | Fog draft state (reveals/conceals as polygons) | `useFogDraft`, `FogDraftAPI` |
| `src/atlas/regions/useRegionDraft.ts` | Region draft state (canon + edits merged) | `useRegionDraft`, `RegionDraftAPI` |
| `src/atlas/routes/useRouteDraft.ts` | Route draft state + waypoint resolution (coords or entity refs) | `useRouteDraft`, `RouteDraftAPI` |
| `src/atlas/{fog,regions,routes}/*Layer.tsx` | react-leaflet visual layers (z-ordered base→regions→routes→fog→pins) | `FogLayer`, `RegionLayer`, `RouteLayer` |
| `src/atlas/tabs/{FogTab,RegionsTab,RoutesTab}.tsx`, `MapLayerPanel.tsx` | Tab UIs | — |
| `src/atlas/editor/saveGate.ts` + `dirtyPlacements.ts` | Pure save pre-flight (dirty filter, patch derivation, empty gate) | `buildSavePlan`, `filterDirtyPlacements` |
| `src/atlas/editor/{mapClickCoord,pinClickIntent,entityCloseIntent}.ts` | Pure click/intent resolvers | `mapClickToAtlasCoord`, `resolvePinClickIntent`, `resolveEntityCloseIntent` |
| `src/atlas/useUndoStack.ts` + `session/useEditorSession.ts` | Central snapshot undo/redo + session status | `useUndoStack`, `useEditorSession` |

**Entry:** router mounts the page (behind the editor gate); map/layer/draw clicks
funnel through the pure resolvers → mutate override/draft → push undo; Save →
`buildSavePlan` → diff preview → `/__atlas/save`.

**Traps:** v1 overrides (no mapId) park under `__legacy__:` until the default map is
known, then `finishLegacyMigration` rewrites keys; `mutateOverride` needs a baseline for
nudge/label/pin and no-ops without one; locked layers still allow rename but reject
geometry edits; undo captures full-state snapshots so it works *across* a save.

**Tests:** `src/test/editor/placementOverrides.test.ts`, `placement-save-integration.test.tsx`,
`atlas/resize-from-corner-drag.test.ts`, `atlas/map-layer-panel-lock.test.tsx`,
`use-map-layers-undo.test.tsx`, `save-boundary-undo.test.tsx`, `use-draft-undo.test.tsx`.

---

### 6. Data model + load boundary — `src/atlas/content/`

The schema every layer agrees on, plus runtime validation at the fetch boundary and the
client-side mirror of the build's player projection.

| File | Role | Key exports |
|------|------|-------------|
| `src/atlas/content/schema.ts` | All atlas types | `AtlasProject`, `Entity`, `MapDocument`, `MapPlacement`, `Region`, `Route`, `FogOverlay`, `Point`, `EntityVisibility` |
| `src/atlas/content/visibility.ts` | **Single source** for visibility vocab + guards | `ALL_VISIBILITY`, `PLAYER_VISIBLE_VISIBILITY`, `isPlayerVisible`, `isSecretVisibility`, `isValidVisibility` |
| `src/atlas/content/loader.ts` | Fetch `atlas.json` / `search-index.json` | `loadAtlasContent`, `loadSearchIndex`, `SearchIndexEntry` |
| `src/atlas/content/atlasGuard.ts` | Validate artifacts at the boundary; actionable errors | `parseAtlasProject`, `parseSearchIndex` |
| `src/atlas/content/slugify.ts` | Stable entity IDs + disambiguation | `slugify`, `uniqueId` |
| `src/atlas/content/projectEntityForPlayer.ts` | Client mirror of build's player transform (parity-locked) | `projectEntityForPlayer`, `buildProjectionContext` |
| `src/atlas/content/projectMapForPlayer.ts` | Filter placements/regions/routes by visibility + fog | `projectMapForPlayer` |
| `src/atlas/content/{parseWikilinks,renderEntityMarkdown,markdownCore,stripDmBlocks}.ts` | Content transforms (shared with build) | `tokenizeWikilinks`, `renderEntityMarkdown`, `markdownToHtml`, `stripDmBlocks` |
| `src/atlas/schemas/imports.ts` | Zod schemas at editor boundaries (localStorage overrides, legacy import) | `overridesSchema`, `safeParseInput` |

**Traps:** visibility is declared/consumed in ~6 places — all import from
`visibility.ts`, the shim only re-exports; `slugify` parity with the build copy is
test-locked; `CURRENT_ATLAS_SCHEMA_VERSION` mismatch blocks load at the guard (clear
error, not a deep crash); asset URLs resolve against `import.meta.env.BASE_URL`
(differs between `/atlas/edit` and a published `/campaign-name/`).

**Tests:** `src/test/atlas-world-loader.test.ts`, `atlas-schema-version.test.ts`,
`atlas-input-schemas.test.ts`, `content/projectEntityForPlayer*.test.ts`,
`content/slugify-parity.test.ts`.

---

### 7. Shared UI + cross-cutting seams — `src/components/`, `src/hooks/`, `src/lib/`

| File | Role | Key exports |
|------|------|-------------|
| `src/lib/logger.ts` | Leveled logger seam — the single point all diagnostics route through | `logger`, `shouldEmit` |
| `src/components/ui/sonner.tsx` | Toast mount; call `toast()` from `sonner` directly for user feedback | `Toaster`, `toast` |
| `src/hooks/use-has-desktop-aside.tsx` | Responsive gate (≥1024px → aside, else sheet; never both/neither) | `useHasDesktopAside`, `DESKTOP_ASIDE_BREAKPOINT` |
| `src/atlas/tabs/ValidationChips.tsx` | Shared validation-issue chips (RegionsTab/RoutesTab/FogTab) | `ValidationChips` |
| `src/components/ErrorBoundary.tsx` | Class boundary; logs via `logger.error`, recovery UI | `ErrorBoundary` |
| `src/components/ui/*` | shadcn/Radix wrappers — styling + prop-forwarding only, **no business logic** | `Button`, `Dialog`, `Sheet`, `Select`, `Tabs`, … |

**Traps:** diagnostics go through `logger.*`, never raw `console.*`; `toast` is
user-facing and separate from logging; `ErrorBoundary` catches render/lifecycle errors
only — async/handler errors must be `try/catch` + `logger.error`; `TooltipProvider`
must wrap the tree (it's mounted at `App.tsx` root).

**Tests:** `src/test/logger.test.ts`, `use-has-desktop-aside.test.tsx`,
`tabs/validation-chips.test.tsx`, `accessibility-labels.test.tsx`.

---

### 8. Tests + tooling — `src/test/`, config files

~151 test files in feature-mirrored subdirs (`atlas/`, `content/`, `editor/`, `entity/`,
`fog/`, `categories/`, …). Full suite ≈ **1555 tests**.

| File | Role |
|------|------|
| `vitest.config.ts` | jsdom env, `setupFiles`, globals, coverage scope, `__INCLUDE_EDITOR__` define |
| `src/test/setup.ts` | jsdom shims: `ResizeObserver`, `scrollIntoView`, `matchMedia` |
| `tsconfig.app.json` | src typecheck config (`strict`, `@/*` alias) — `typecheck` must use `-p` on this |
| `tsconfig.scripts.json` | `scripts/**` typecheck config (`strict`, `@/*` alias, DOM lib for Web Crypto types) — `typecheck:scripts` uses `-p` on this |
| `tsconfig.json` / `tsconfig.node.json` | solution root (refs) / vite.config config |
| `eslint.config.js` | flat config; bans `require()` in ESM |
| `.prettierrc.json` | 100 cols, double quotes, trailing commas |
| `scripts/pre-commit.sh` | `typecheck:all` (app + scripts) + eslint + `vitest --changed`; filters infra noise |
| `.github/workflows/atlas-pr-check.yml` | PR CI: `typecheck:all`, format:check, player build, secret/shape scans |
| `src/test/fixtures/{atlas-build,sentinel-vault}` | integration test vaults |

**Traps (the ones that cost time):**
- **Always shard.** `npx vitest run --shard=N/4 --poolOptions.forks.maxForks=3` for N=1..4.
  Bisect to the offending *file* before blaming memory. A shard can exit 1 on a
  `Timeout calling "onTaskUpdate"` RPC flake with all tests green — re-run it alone.
- `typecheck` **must** pass `-p tsconfig.app.json`; bare `tsc` resolves the solution root
  and checks nothing. Same rule for `scripts/**`: use `npm run typecheck:scripts` (`-p tsconfig.scripts.json`),
  or `npm run typecheck:all` for both in one shot.
- `require()` is ESLint-banned (vite.config is esbuild-bundled) — use `import` / `await import()`.
- jsdom lacks `ResizeObserver`/`scrollIntoView`/`matchMedia`; add shims to `setup.ts`,
  not per-test.

---

## Command reference

| Command | Does | Writes to |
|---------|------|-----------|
| `npm run dev` | Full editor + local save endpoint | — |
| `npm run build` | Player-safe production build (tree-shakes editor) | `dist/` |
| `npm run atlas:build` | Build DM atlas | `.local-atlas/` (gitignored) |
| `npm run atlas:build:player` | Strict player atlas | **`public/atlas/`** ⚠️ |
| `npm run atlas:publish` | Snapshot + player build + prod build + all scans | `public/atlas/`, `dist/` |
| `npm run atlas:check-secrets <dir>` / `:check-derived <dir>` | Leak scans against an output dir | — |
| `npm run typecheck` / `typecheck:scripts` / `typecheck:all` / `lint` / `format:check` | Static gates | — |
| `npm test` | Vitest (**shard it — see above**) | — |

> ⚠️ `atlas:build:player` and `atlas:publish` regenerate `public/atlas/*.json`. If you
> have uncommitted atlas WIP there, they'll overwrite it. For a pure code-change QA gate,
> prefer `npm run build` (writes only `dist/`) + typecheck + lint + sharded tests.
