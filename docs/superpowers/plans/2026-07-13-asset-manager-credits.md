# Asset Manager + Per-Asset Credits Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax. This is the largest plan here (L effort) and is phased — Phase 0 is a hard prerequisite for the rest. If a fresh design pass is wanted on the map-image rendering (Decision 3), run superpowers:brainstorming on that piece first; the rest is settled.

**Goal (the DM's words):** "A menu where all assets are stored, and on each asset I can choose to toggle credits on or off. The credit shows in the bottom-right corner of the image, faint but readable."

**What already exists (do NOT rebuild):** A `CreditBadge` component ships today with exactly the requested look — faint bottom-right, brightens on hover (`src/atlas/entity/CreditBadge.tsx`; CSS `.atlas-credit-badge` at `src/index.css:285-310`: `position:absolute; bottom:5px; right:5px; opacity:0.45`, `opacity:1` on hover/focus). It's wired only to entity thumbnails today, driven by one `Entity.credit` string per entity. There is also a `/atlas/credits` aggregate page and a world-level `CreditsConfig { badges, page }` master switch. This plan generalizes that into a per-asset system and reuses the badge.

**The real blocker:** the previously-attempted "credits toggle" (L1 Increment 2) was handed back because `credits` is a WORLD-level setting and the editor has no world-level save path — only a per-map one (`patchMap`). Proof: `buildWorldYamlContent` (`src/pages/AtlasPlacementEditor.tsx:813-850`) never passes `credits` to `buildFullWorldYaml` even though the parameter exists and serializes (`src/atlas/yaml/buildFullWorldYaml.ts:48-49,57`); `WorldDetailsPanel.onPatch` is a stub that only `logger.warn`s (`AtlasPlacementEditor.tsx:1920-1928`). **Phase 0 builds that world-level save path, which unblocks this feature AND the old Increment 2.**

**Tech Stack:** React + react-leaflet, YAML (`world.yaml`) via `buildFullWorldYaml`, the dev save endpoint (`/__atlas/save`), Vitest.

---

## Grounded context (verified file:line)

- **No runtime asset inventory exists.** `AtlasProject.assets: AssetRef[]` (`src/atlas/content/schema.ts:22,268-272`) is hardcoded empty at build (`scripts/build-atlas.ts:959` `assets: []`). The only asset walk is the standalone `scripts/atlas/audit-assets.ts` (`collectAssets` :126-157, `extractFrontmatterImageRefs` :178-195, `extractWorldYamlLayerSrcs` :201-217) — a CI tool, not a UI feed.
- **Image locations:** `Entity.images: string[]` (`schema.ts:217`) + one `Entity.credit?: string` (`schema.ts:234`, covers all of an entity's images). `MapLayer` (`schema.ts:176-187`) has `src` but NO credit field. World `CreditsConfig` (`schema.ts:47-50,57`).
- **Existing credit render points:** entity thumbnails `src/atlas/entity/EntityPanel.tsx:367-382` (CreditBadge as absolutely-positioned sibling of `<img>` in a `relative` wrapper — the reference pattern). Lightbox `EntityPanel.tsx:483-496` has NO badge (pre-existing gap). Map layer images render as Leaflet `<ImageOverlay>`: player `AtlasViewer.tsx:865-875`, editor `MapLayerEditableOverlay.tsx:234-236`, minimap `AtlasMinimap.tsx:96` (a real `<img>`).
- **Save path:** `/__atlas/save` takes full file CONTENTS (`scripts/vite-plugin-atlas-save.ts`, `handleSaveRequest` :322-748). For `world-yaml`, the client builds the whole file via `buildFullWorldYaml({ maps, calendar, schemaVersion, credits })` (`buildFullWorldYaml.ts:52-60`). The per-map editor seam is `patchMap` (`AtlasPlacementEditor.tsx:360-366`) writing `mapOverride`, folded by `activeMap` (:349-353) and spread into the serialized map by `buildWorldYamlContent` (:813-850). **There is no world-level equivalent.**
- **Editor menu-panel pattern (the fit for a world-wide menu):** the `panels` record in `AtlasPlacementEditor.tsx` (starts :1504) with menu-reachable keys like `world:` (:1920-1929, "no rail icon — opened via ☰ menu or CommandPalette"); ☰ wiring in `EditorMenu.tsx:20-34` + `AtlasPlacementEditor.tsx:1444-1447` (`setActivePanel("world")`); command palette entry via `useCommandPalette.ts:34` + routing at `AtlasPlacementEditor.tsx:2276`.
- **Prior design doc / scope note:** `docs/superpowers/specs/2026-06-17-asset-credits-badge-and-page-design.md:155-161` explicitly deferred "per-image credit" and "badges on body embeds" to v2. This plan IS that v2. Increment-2 handback recorded in `docs/automation/continuous-dev-queue.md:214-246`.

---

## Decisions (recommended defaults — confirm or override before building)

1. **Storage model = one world-level asset-credit registry, keyed by asset path.** Add `assetCredits?: Record<string, AssetCredit>` to `world.yaml`, where `AssetCredit = { credit: string; enabled: boolean }`. This maps 1:1 to the DM's mental model ("a menu of all assets, each with a toggle"), covers map-layer images AND entity images uniformly by their `src` path, and needs only the ONE new world-level save path — no churn to `Entity.images` shape or per-layer schema. The existing `Entity.credit` stays working as a coarse per-entity fallback; the registry takes precedence for any asset with an entry. *Alternatives considered & why not:* per-`MapLayer.credit` + per-`Entity.imageCredits` map = two divergent surfaces + two save paths; promoting `images` to objects = large blast radius across parser/build/projection/tests.
2. **"Toggle on/off" is an explicit boolean** (`enabled`), separate from the credit text — so the DM can keep the text but hide the badge without deleting it, exactly as asked. Badge shows when `enabled === true && credit` is non-empty. The world-level `CreditsConfig.badges` remains the site-wide master kill-switch (badges off entirely).
3. **Corner rendering differs by surface (both read as "bottom-right of the image"):**
   - **Entity images = DOM boxes** → reuse `CreditBadge` unchanged (bottom-right of the image box). Also close the lightbox gap.
   - **The big map = a full-bleed Leaflet map** → a viewport-anchored bottom-right overlay (Leaflet's conventional attribution corner), combining the active layers' enabled credits. A badge glued to the image's geographic bounds would pan/scale off-screen under zoom. For a full-bleed map, viewport-bottom-right IS "bottom-right of the map." *If the DM wants the geographic-anchored behavior instead, brainstorm this one piece first.*
4. **Inventory source = a pure client-side walker** `collectAssets(project)` over `project.entities[].images` + `project.maps[].layers[].src`, plus retire/populate the dead `AtlasProject.assets` field (don't leave a second empty inventory). Live (no rebuild needed) since the editor already holds `project`.

---

## Phase 0 — World-level save path (PREREQUISITE; also unblocks L1 Increment 2)

**Files:** `src/pages/AtlasPlacementEditor.tsx` (add `worldOverride` state + `patchWorld` + fold into `buildWorldYamlContent`), `src/atlas/yaml/buildFullWorldYaml.ts` (already accepts `credits`; add `assetCredits`), tests under `src/test/`.

- [ ] **Step 1 (test-first):** In a new `src/test/editor/world-override-save.test.tsx` (model on `placement-save-integration.test.tsx`'s harness style), assert that a `patchWorld({ credits: { badges: false } })` results in `buildWorldYamlContent()` producing YAML whose `credits.badges` is `false`. Expect FAIL (no `patchWorld` yet).
- [ ] **Step 2:** Add `worldOverride` state (mirror `mapOverride` at `AtlasPlacementEditor.tsx:343`) + `patchWorld(patch)` + `setWorldOverrideUndoable` (mirror `setMapOverrideUndoable` :452-472, so it's undo-tracked). Compute `effectiveWorld` = base world settings folded with `worldOverride`.
- [ ] **Step 3:** In `buildWorldYamlContent` (:813-850), pass `credits: effectiveWorld.credits` (and later `assetCredits`) into `buildFullWorldYaml(...)`. Add `worldYamlDirty` awareness of world-setting changes.
- [ ] **Step 4:** Replace the `WorldDetailsPanel.onPatch` stub (:1920-1928) to call `patchWorld` instead of `logger.warn`.
- [ ] **Step 5:** Run the new test + `npx vitest run src/test/atlas-build*.test.ts src/test/editor` → green. Commit `feat(editor): world-level settings save path (patchWorld) — unblocks credits toggle`.

---

## Phase 1 — Schema + inventory

**Files:** `src/atlas/content/schema.ts`, `scripts/atlas/loadWorldConfig.ts`, `src/atlas/yaml/buildFullWorldYaml.ts`, `scripts/build-atlas.ts`, new `src/atlas/assets/collectAssets.ts`, tests.

- [ ] **Step 1 (test-first):** `src/test/assets/collectAssets.test.ts` — given a `makeProject()` (reuse `src/test/helpers/makeProject.ts` from the smoke-tests plan) with entity images + map layers, `collectAssets(project)` returns a deduped list of `{ src, usedBy: {kind:'entity'|'layer', id}[] }`. FAIL first.
- [ ] **Step 2:** Add `AssetCredit` type + `World.assetCredits?: Record<string, AssetCredit>` to `schema.ts`. Write `src/atlas/assets/collectAssets.ts` (pure). Make it pass.
- [ ] **Step 3:** Parse/sanitize `assetCredits` in `loadWorldConfig.ts` (mirror `resolveCredits` :31-34); serialize it in `buildFullWorldYaml.ts` (mirror the `credits` handling :57). Add parity tests.
- [ ] **Step 4:** In `build-atlas.ts`, populate `AtlasProject.assets` from the walker (retire the `assets: []` stub at :959) AND emit only ENABLED, non-empty credits into the player `atlas.json` (disabled/empty stripped — player-safety: a DM-typed-but-disabled credit must not ship). Add a projection test.
- [ ] **Step 5:** Commit `feat(assets): world-level assetCredits registry + collectAssets inventory`.

---

## Phase 2 — The Asset Manager menu

**Files:** new `src/atlas/assets/AssetManagerPanel.tsx`, `src/atlas/shell/EditorMenu.tsx`, `src/atlas/shell/useCommandPalette.ts`, `src/pages/AtlasPlacementEditor.tsx`, tests.

- [ ] **Step 1 (test-first):** `src/test/assets/AssetManagerPanel.test.tsx` — renders the panel with a fixture project, shows N asset rows (one per `collectAssets` entry), each with a credit text input + an on/off toggle; toggling/typing calls `onPatch` (patchWorld) with the updated `assetCredits[src]`. FAIL first.
- [ ] **Step 2:** Build `AssetManagerPanel` — a scrollable list: thumbnail (`normalizeAtlasAssetUrl(src)`), the asset path, where it's used, a `credit` text field, and an `enabled` toggle (a `Switch` from `src/components/ui/`). Reads current values from `effectiveWorld.assetCredits`, writes via the passed `onPatch`.
- [ ] **Step 3:** Register as a menu-reachable panel (Decision follows the `world:` precedent): add an `assets:` key to the `panels` record; add `onAssetManager` prop + `<li>Assets…</li>` to `EditorMenu.tsx`; wire `setActivePanel("assets")`; add a `set.assets` command-palette entry alongside `set.world`/`set.maps` (`useCommandPalette.ts:34`, routing `AtlasPlacementEditor.tsx:2276`). (Optional: also add a rail icon per `railRegistry.tsx` if one-click access is wanted — DM's call.)
- [ ] **Step 4:** Run panel tests + `npm run typecheck` → green. Commit `feat(assets): Asset Manager panel with per-asset credit toggle`.

---

## Phase 3 — Rendering the badges

**Files:** `src/atlas/entity/EntityPanel.tsx`, new `src/atlas/map/MapCreditOverlay.tsx`, `src/pages/AtlasViewer.tsx`, `src/pages/AtlasCredits.tsx`, tests.

- [ ] **Step 1 (entity images):** Update `EntityPanel.tsx:367-382` so each image's badge text/visibility comes from `assetCredits[img]` (falling back to `entity.credit`), gated by `credits.badges !== false && enabled && text`. Reuse `CreditBadge`. ALSO add a `CreditBadge` to the lightbox (`:483-496`) inside a new `relative` wrapper — closes the pre-existing gap. Test with `atlas-credits`-style fixtures.
- [ ] **Step 2 (map image):** Build `src/atlas/map/MapCreditOverlay.tsx` — a viewport-anchored bottom-right element (NOT a Leaflet `ImageOverlay`; a plain absolutely-positioned DOM node over the map container, reusing `.atlas-credit-badge` styling) that combines the enabled credits of the active map's layers. Mount it in `AtlasViewer.tsx` near the map container (and optionally the editor). Test the pure "which credits are active" logic in isolation.
- [ ] **Step 3 (credits page):** Update `AtlasCredits.tsx` to aggregate BOTH `Entity.credit` and the `assetCredits` registry, so attributions don't silently under-report. Update its test.
- [ ] **Step 4:** Commit `feat(assets): render per-asset credit badges on entity images + map + credits page`.

---

## Phase 4 — Player-safety + verification

- [ ] **Step 1:** Add a parity/projection test proving a `assetCredits` entry with `enabled:false` (or empty text) does NOT appear in the player `atlas.json` nor render a badge.
- [ ] **Step 2:** Full gate:
```bash
for n in 1 2 3 4; do npx vitest run --shard=$n/4 --poolOptions.forks.maxForks=3; done
npm run typecheck && npm run lint
npm run atlas:publish     # player build + secret/derived/shape scans PASS
```
- [ ] **Step 3:** Manual: `npm run dev` → ☰ → Assets, toggle a credit on and type an attribution, Save, confirm it writes to `world.yaml`; reload the player viewer (`npm run build` preview) and confirm the faint badge shows bottom-right on the entity image and the map corner. Toggle off → badge gone → Save → gone from `world.yaml`/player build.

## Acceptance criteria
- ☰ → **Assets** opens a menu listing every image asset with a per-asset credit text + on/off toggle.
- Toggling on + typing → faint, readable, bottom-right badge on that image (entity images and the map).
- Toggling off keeps the text but hides the badge, and the disabled/empty credit never ships to the player build.
- Changes persist to `world.yaml` via Save (the new world-level path), are undoable, and the old L1 Increment-2 world-settings gap is closed.
- `atlas:publish` scans pass.

## Open questions for the DM
1. **Map-image badge behavior** (Decision 3): viewport-corner (recommended, always readable) vs glued-to-image (literal but can drift off-screen)? If glued, brainstorm first.
2. **Multiple map layers with credits**: show all stacked, or just the topmost? (Default: stack, small.)
3. **Should the existing single `Entity.credit` be migrated into the registry** (one system) or kept as a coarse fallback (Decision 1 default)? Migration is cleaner long-term but touches the parser + credits page.
4. Split Phase 0 into its own tiny plan/PR first (it's independently valuable and unblocks the stuck Increment 2), or land it as part of this feature? (Recommended: its own PR.)
