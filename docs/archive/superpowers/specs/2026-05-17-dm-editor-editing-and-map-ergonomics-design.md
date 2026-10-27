# DM Editor — Editing Experience & Map Ergonomics — Design Spec

**Status:** Owner-approved 2026-05-17 (brainstormed with the owner; design accepted in full).
**Author:** Opus design session. **Executor:** fresh Sonnet via `superpowers:subagent-driven-development`.
**Predecessors (shipped, not reopened):** Sub-project B "Unified Entity Foundation" (shared `EntityPanel`, parity-locked `projectEntityForPlayer`, global Player/DM lens); Group A (entity-panel X-close fix, commit `d596688`).

---

## 1. Motivation

Owner smoke-tested the shipped Sub-project B and surfaced concrete problems:

1. **Confirmed data-loss bug.** Typed-but-unsaved entity edits *actually vanish* when leaving Edit (toggling to Reading, flipping the lens, navigating away). This violates the project's non-negotiable "no lost work" constraint. It is a bug, not a missing feature.
2. **No way to see player render while editing.** To check "what will players see" the DM must leave the edit form; there is no live preview beside the editor.
3. **Lens scroll reset.** Flipping the global DM/Player lens on a long entity scrolls back to the top, making comparison useless.
4. **Map ignores the lens.** DM-only pins remain on the map and openable in Player view (only the category lists honour the lens today).
5. **Pin-placement pain.** The DM cannot drop a pin where they click; the editable map-image/layer overlay intercepts the click, forcing "place elsewhere, then drag."

Owner principle established during the brainstorm: **the editor's Player view and the published player site must be the same code, not two implementations.** For entity content this is already true (`projectEntityForPlayer` is parity-locked to the build). For the map it is not yet true because the published site has no fog/visibility map mechanic at all — so the correct move is to build the map projection once, shared and parity-ready, exactly as Sub-project B did for entities.

## 2. Scope

One design, **two independently-shippable workstreams** (brainstormed together because the Player/DM lens spans both; each gets its own implementation plan and ships on its own gate):

- **Workstream B — Editing experience.** Progressive pane pipeline, single-source no-loss draft, scroll behaviour. Fixes problems 1–3. Lower risk (no build-pipeline changes).
- **Workstream D — Map interaction & lens.** Map-image lock, click-to-place, shared parity-ready map projection for the editor's Player view. Fixes problems 4–5. Medium risk (map editor is fiddly; no published-build changes).

**Explicitly deferred (recorded in project memory, NOT in this project):**
- **Published progressive-fog player mechanic** — the live player site hiding/revealing fogged locations and shipping the neutral backdrop. This project builds the *shared projection logic* so the future published mechanic reuses it verbatim; it does **not** build the published rendering/route/build-pipeline/secret-scan work.
- **Formatting-assist UI** for non-technical users (Obsidian-style toolbar / collapsible callouts). Its own future brainstorm.

## 3. Workstream B — Editing experience

### 3.1 Single source of truth: the in-memory draft

All editing and all preview panes read from one in-memory draft: the existing `useEntityEditDraft` (`src/atlas/categories/useEntityEditDraft.ts`), already wired into the Part-2 IndexedDB session holder `editorEntity` (`src/atlas/session/useEditorSession.ts`).

**The data-loss fix is structural:** the panes are shown/hidden (CSS / conditional render *without unmount of the draft owner*), **never unmounting the draft**. Today the draft is lost because switching out of Edit unmounts `EntityEditPanel`, which reloads from disk on remount and discards the in-memory draft. The fix: the draft is owned above the pane switch (it already is — `entityEditDraft` lives in `AtlasPlacementEditor`), and the Edit pane binds to it rather than re-loading from disk whenever it becomes visible. Re-load from disk happens only on first open of an entity with no live draft for that `sourcePath`, or after an explicit Save/Discard.

### 3.2 The progressive pane pipeline

A surface that renders the *same live draft* through up to three columns, each one stage further from source:

- **Edit** — the existing fields + body textarea, bound to the draft (`useEntityEditDraft`).
- **DM render** — the draft body rendered with the shared `tokenizeWikilinks → marked → renderLinkTokens → sanitizeAtlasHtml` pipeline, **secrets kept**. This is exactly the DM branch already in `EntityReadingView.tsx`; reuse it, fed from the draft instead of the saved entity.
- **Player render** — the draft entity passed through `projectEntityForPlayer` (Sub-project B, parity-locked) then rendered. Identical to the published player site by construction.

**Progressive expansion.** Reading mode opens at **DM** (collapsed); an edge control expands **Player** beside it. Edit mode opens at **Edit** (collapsed, max writing room); expand adds **DM**, expand again adds **Player** (max 3 columns). Which panes are open is a UI preference (same class as the view-mode lens; persisted in localStorage, **not** session work). On a narrow viewport the surface widens / overlays the map area when panes are expanded (desktop-only product).

This **supersedes** the current `EntitySurface` Edit/Reading toggle: Reading and Edit become the collapsed states of the same pipeline rather than mutually exclusive modes.

### 3.3 No-loss model (model 2)

- Only an explicit **Save** writes to disk (existing `canonicalEntitySave`).
- Only an explicit **Discard** clears the draft. Closing the entity (the panel X) while `entityEditDraft.isDirty()` shows a single confirm: **"Discard changes / Keep editing."**
- Switching Reading↔Edit, expanding/collapsing panes, flipping the global lens, opening a different entity, reloading the app — **never** clears or loses the draft. (The session holder already persists across reload; this design guarantees it also survives every in-session navigation.)
- A **permanent no-loss invariant test** gates this: a change that lets the draft vanish on any non-Save, non-explicit-Discard path fails CI.

### 3.4 Scroll behaviour

- **Floor (non-negotiable, ships regardless):** panes are persistent DOM with their own scroll containers, so each retains its `scrollTop` across show/hide and Player↔DM swaps. This alone removes the "jumps to top on lens flip" bug (problem 3).
- **Target (anchor-sync):** scrolling one pane computes its topmost visible structural anchor (heading / paragraph index, derived from the shared markdown structure); the other panes scroll so the *same anchor* is at the top. A section present in one pane but not another (e.g. a stripped secret) → followers park at the last shared anchor and re-align at the next shared one. Fine-scrolling within a section is free.
- **Graceful degradation:** if anchor mapping fails for an entity (no resolvable shared anchors), fall back to independent scroll. Never a wrong jump.

## 4. Workstream D — Map interaction & lens

### 4.1 Map-image lock

State already exists: `editGeometry` (`AtlasPlacementEditor.tsx`), passed as `editMode` to `MapLayerEditableOverlay`. Problems: it is not surfaced as a clear control, and when off the editable overlay still intercepts clicks intended for pin placement (the Part-1 `onBackgroundClick` patch only partially mitigated this).

Design: a clear, discoverable **"Adjust map image"** toggle, **off by default**. When off, the editable map-image/layer handle overlay is fully click-transparent (no pointer interception — handles not interactive / `pointer-events:none` on the handle layer) so every map click reaches the Leaflet pin layer. When on, resize/move handles are active for the rare task of repositioning/scaling the base map image or layers. This replaces event-forwarding hacks with an explicit mode.

### 4.2 Click-to-place pins

Flow: select an unplaced entity (list row / "Place" affordance) → place-mode (existing `pendingId`, crosshair cursor) → click the map → the pin is created at the **exact clicked lat/lng**, final. No forced drag. Existing drag-to-move stays for later nudging. §4.1's lock is what makes the click land where intended.

### 4.3 Lens-on-map: one shared, parity-ready projection

Create a single pure function, the twin of `projectEntityForPlayer`:

`projectMapForPlayer(map, placements, regions, routes, fog, ctx) → player-faithful map view`

- Drops `dm`/`hidden` placements, regions, routes (reuse the `PLAYER_VISIBLE` rule + the projection context from Sub-project B).
- For a **player-visible but fogged** entity: omit the pin/location from the map, but the entity remains readable on the B surfaces (entity browser / search / lore links). Clicking it from a list opens the bio and does **not** fly the map to an undiscovered point.
- Flag fogged terrain so the editor renders a per-world configurable **"undiscovered" backdrop** (e.g. blank sea / parchment) instead of real terrain, uniformly.

The editor's Player-view renders the map through this function now. The deferred published progressive-fog mechanic will reuse this exact function → automatic parity, same pattern Sub-project B established. A parity-style contract test locks it now so the deferred work cannot drift.

Wiring: the map markers/regions/routes/fog currently derive from `filtered`/`placed` (`AtlasPlacementEditor.tsx` ~line 501), which is **not** lens-filtered. In Player lens, feed them through `projectMapForPlayer`; in DM lens, raw. Mirrors how `filterEntitiesForLens` already gates the category lists.

## 5. Reused / shared modules (no new copies)

- `projectEntityForPlayer`, `buildProjectionContext` — `src/atlas/content/projectEntityForPlayer.ts` (Player pane; parity-locked).
- `tokenizeWikilinks`, `renderLinkTokens`, `marked`, `sanitizeAtlasHtml` — DM render pane (reuse `EntityReadingView`'s existing DM branch).
- `useEntityEditDraft` + session holder `editorEntity` — the single draft source (no-loss).
- `canonicalEntitySave` — the only disk write.
- `filterEntitiesForLens`, `ViewModeProvider`/`useViewMode` — existing lens; `projectMapForPlayer` joins it.
- `MapLayerEditableOverlay`, `useMapLayers`, `editGeometry` — the map-image lock attaches here.

## 6. Component / file structure (design-level; the plan specifies exact files)

**Workstream B**
- A pane-pipeline component (evolves/absorbs `EntitySurface.tsx` + `EntityReadingView.tsx`) owning the collapsed/expanded pane state and the scroll controller.
- A scroll-sync module (pure: given pane scroll state + shared anchors → target offsets; independently testable).
- Draft-binding adjustment in `EntityEditPanel.tsx` so it binds to the live draft instead of reloading from disk on every show.
- No-loss invariant test (permanent gate).

**Workstream D**
- `src/atlas/content/projectMapForPlayer.ts` — pure projection + its parity-style test.
- Map-image lock control + click-transparency wiring in `AtlasPlacementEditor.tsx` / `MapLayerEditableOverlay`.
- Place-mode click-to-place wiring (extends existing `pendingId` flow).
- Fog "undiscovered backdrop" render path in the map (editor Player-view only).

## 7. Testing & safety

- **Entity Player pane:** no new parity test — it is the already-parity-locked `projectEntityForPlayer`.
- **`projectMapForPlayer`:** parity-style contract test (the editor projection equals the spec'd player-faithful set), so the deferred published mechanic cannot drift from it.
- **No-loss invariant test:** simulate edit → leave Edit / flip lens / open another entity / collapse panes / (where feasible) reload → assert draft intact; assert only Save writes and only explicit Discard clears. Permanent CI gate.
- **Scroll:** unit-test the pure scroll-sync module (anchor mapping, park-at-last-shared, degradation). Toggle-safe floor verified by test + browser smoke.
- **Mandatory browser smoke in every slice gate.** Hard lesson from Sub-project B: the `ViewModeProvider` placement crash passed tsc + 665 tests + lint + `atlas:publish` and still blanked `/atlas/edit`. Automated green ≠ working page. Use the managed preview (`.claude/launch.json`).
- `npm run atlas:publish` scans stay clean. This is all client-side editor work; the published build is untouched (published fog deferred).

## 8. Slice decomposition (independently shippable; each ends in tsc + vitest + lint + atlas:publish + **browser** gate)

**Workstream B**
- **B-1** Single-source no-loss draft + permanent invariant test (fixes the data-loss bug first, on its own).
- **B-2** Progressive pane pipeline (Edit/DM/Player, progressive expand) replacing the Edit/Reading toggle.
- **B-3** Scroll: persistent-DOM floor, then anchor-sync with graceful degradation.

**Workstream D**
- **D-1** Map-image lock ("Adjust map image" mode; clicks transparent when off).
- **D-2** Click-to-place pins (select entity → click → final).
- **D-3** `projectMapForPlayer` shared projection + parity test; wire editor Player-view map (pins/regions/routes), plus fogged-location pin omission and the "undiscovered backdrop".

Order: B-1 first (stops active data loss). B-2, B-3 follow. D-1 → D-2 (D-2 depends on D-1's click transparency) → D-3. Workstreams B and D are otherwise independent.

## 9. Risks

- **Pane width on desktop.** Three text columns need room; the surface must widen/overlay gracefully. Mitigation: progressive (collapsed by default), desktop-only product.
- **Anchor-sync edge cases.** Divergent content makes perfect sync impossible by definition; the design accepts "park + re-align" and degrades to independent scroll rather than chasing pixel perfection. The floor (no wrong jump) is the guarantee.
- **Map overlay click interception.** The exact pointer-events path in `MapLayerEditableOverlay` must be verified in the browser, not just by tsc — this is precisely the class of bug automated gates miss.
- **Draft binding regression.** Changing `EntityEditPanel` load behaviour risks new edge cases (e.g. external file change). The no-loss invariant test plus browser smoke gate this.

## 10. Self-review

- Placeholders: none — every section states concrete behaviour and named modules.
- Internal consistency: the "same code" principle is honoured (Player pane = `projectEntityForPlayer`; map = shared `projectMapForPlayer`); no second implementations introduced.
- Scope: two workstreams, independently plannable; deferred items explicitly carved out and recorded in memory.
- Ambiguity: scroll model has a defined floor + target + degradation; no-loss model fully specified (Save writes, Discard/confirm clears, everything else preserves).
