# DM Editor Part 2 — No Lost Work + Clear State — Design

**Date:** 2026-05-16
**Owner:** Thraez
**Status:** Draft — pending user approval
**Program:** DM-editor product-quality overhaul, Part 2 of 4 (Part 1 merged in `01864a5` / PR #21)

## Problem

Part 1 made the editor *correct* (Save no longer crashes, pins place, one unified Save writes everything to disk, Export/Patch removed). It did not make the editor *safe* or *legible*. Today:

1. **Work is lost on reload.** Pin overrides and layer uploads survive a reload (localStorage); region, route, and fog drafts and per-map settings are memory-only and vanish on reload, browser crash, or accidental close.
2. **Switching maps silently destroys drafts.** A raw `window.confirm` warns that region/route/fog drafts will be discarded, then discards them.
3. **State is told four different ways, two of them false.** Four parallel surfaces exist: the vestigial `DraftStatusBadge` (says "Ready to export" / "Built from YAML"), the real `SaveStatusChip` (saved/unsaved/saving/failed), an unsaved banner, and a 5-minute idle nudge toast. The export-era status model in `canon.ts` / `validateProject.ts` still instructs the DM to "Export DM Changes / download a YAML patch" — an action removed in Part 1.
4. **No honest change count.** Nothing tells the DM how much unsaved work has accumulated.

The bar for this program is "a product I'd buy on the App Store." For Part 2 that means: it is *impossible to lose work*, and it is *always obvious what the editor is doing*.

## Goals

- Every draft kind persists durably and restores on reload — proven by a permanent invariant test, not asserted.
- One global undo/redo stack (already exists) is preserved and reset cleanly on reload.
- One save-status surface, derived from a single source of truth, that cannot lie.
- An honest running count of unsaved edits since the last save.
- Forgiving confirms only where something is genuinely irreversible.
- The export-era status-model vestige (`lastExportAt` / `classifyDraftStatus`) is removed, not patched around.

## Non-goals

- Autosave. Save remains ONE explicit, bulletproof button. (Standing constraint, never revisit.)
- Undo history surviving a reload. Data is restored; the undo timeline starts fresh after reload (user decision).
- Touch / mobile. Desktop + laptop, mouse + keyboard only.
- Information architecture, terminology, type-aware categories — that is Part 3.
- Visual / interaction polish, design-system pass — that is Part 4.
- Re-introducing Export, Patch, or Zip in any form.

## Confirmed product decisions (this design pass)

1. **Reload behavior:** work is automatically restored exactly as left, plus a small dismissible notice — *"Restored your unsaved work from 2:14 pm."*
2. **Undo on reload:** data is fully restored; the undo timeline starts fresh from the reload point (no Cmd+Z past a reload).
3. **Confirms:** remove map-switch, `beforeunload`, and all "drafts will be discarded" warnings (nothing is lost anymore). Keep exactly ONE forgiving confirm, on an explicit *Discard unsaved changes* action.
4. **Change count:** the status surface shows unsaved edits since last save (e.g. "366 unsaved changes"). Undo decrements it; reaching the last-saved state reads "All changes saved". The count can never lie upward.
5. **State-model approach:** one unified editor-session model (Approach B) — a single durable working draft, one save/restore path, tabs become views over it.

---

## A. Unified editor session (the spine)

### A.1 The session store

Introduce one store, `EditorSession`, that owns the **entire** editor working draft:

- pin placement overrides (position / label / pin-style)
- per-map settings (`mapOverride`: size, ocean, grid, zoom)
- region drafts
- route drafts
- fog drafts
- layer uploads (including inline upload data)

Plus a **baseline**: the hashes/snapshot of the last-saved canonical state. Two derived values are computed by diffing working against baseline — never tracked by hand:

- `isDirty` — working differs from baseline.
- `unsavedCount` — number of unsaved edits since last save (see §B.3 for exact semantics).

**Boundaries.** The store exposes a small, explicit interface: read selectors per draft kind, mutation actions per draft kind, `serialize()`, `hydrate(snapshot)`, `resetToBaseline()`, `markSaved(newBaseline)`, and the two derived getters. Tab components never reach inside it.

### A.2 Tabs become views, APIs unchanged

The existing per-tab hooks keep their **exact public APIs**:

- `src/atlas/regions/useRegionDraft.ts`, `useRouteDraft.ts`, `useFogDraft.ts`
- `src/atlas/useMapLayers.ts`
- the pin `overrides` / `mapOverride` state in `src/pages/AtlasPlacementEditor.tsx`

Internally they stop owning `useState` and instead read/write `EditorSession`. Tab components (`PinsTab`, `RegionsTab`, `RoutesTab`, `FogTab`, `EntitiesTab`, the Maps panel) require no behavioural change. This keeps the blast radius in the state layer, not across every screen.

### A.3 Persistence: one snapshot, one path

The whole session serializes to a **single versioned snapshot in IndexedDB**, not localStorage. Rationale: layer uploads are inline data URLs; the current `atlas-local-map-layers-v1` localStorage cache already risks exceeding the ~5 MB quota, and adding region/route/fog/settings to it would make quota failure likely. IndexedDB removes that ceiling and gives one durable, structured store.

- **One write path:** any session mutation schedules a debounced (≈300 ms) snapshot write. No other code writes editor state to storage.
- **One read path:** on editor mount, the session attempts to hydrate from the snapshot.
- **One timestamp:** the snapshot carries `savedAt` (wall-clock of the last working-state change), used for the restore notice.
- **Versioned:** the snapshot has a schema `version`. On version mismatch the snapshot is discarded (treated as no draft) rather than mis-hydrated — a safe, explicit downgrade.
- **Migration of existing caches:** on first run, if the legacy `atlas-placement-overrides-v3` / `atlas-local-map-layers-v1` localStorage entries exist and no IndexedDB snapshot does, their contents seed the initial session, then the legacy keys are cleared. No silent dual-write afterward.

### A.4 Restore on reload

On mount:

1. Load canonical project (unchanged).
2. Attempt `hydrate(snapshot)`.
3. If a snapshot exists, is the current schema version, and **diverges from canon** (the DM actually had unsaved work): hydrate it and raise a **one-shot dismissible notice** — *"Restored your unsaved work from {savedAt, friendly}."* The notice is informational only; the work is already back. No decision is required.
4. If the snapshot equals canon (nothing was unsaved) or is absent: start clean, no notice.

The notice is dismissible and auto-clears once the DM makes any edit or saves.

### A.5 Undo/redo

The existing single global stack (`src/atlas/useUndoStack.ts`) is **kept as-is in behaviour**: one stack shared by all tabs, dual past/future, 50-entry cap, Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y, save-boundary entry from Part 1 preserved. Its entries now operate against `EditorSession`. It is **not** persisted; after a reload it starts empty (decision 2), while the *data* is fully restored via §A.4.

---

## B. One save-status surface

### B.1 Replace four surfaces with one

Delete all four current surfaces:

- `src/atlas/yaml/StatusBadge.tsx` (`DraftStatusBadge`) — vestigial, wrong words.
- `src/atlas/SaveStatusChip.tsx` — superseded.
- the unsaved banner in `AtlasPlacementEditor.tsx` (~line 905).
- the 5-minute idle nudge toast in `AtlasPlacementEditor.tsx` (~lines 748–779) — **removed, not relocated**. Durable persistence plus an always-honest status make a periodic "you should save" prompt obsolete anxiety about a loss that can no longer happen.

Introduce one component, `SaveStatus`, in the editor toolbar, always visible, sitting directly next to the single Save button. All state derives purely from `EditorSession` — there is no second classifier anywhere in the codebase.

### B.2 States and copy

| State | Condition | What the DM sees |
|---|---|---|
| Clean | working == baseline | "All changes saved" |
| Unsaved | working != baseline, `unsavedCount` = N | "{N} unsaved changes" — clickable to Save |
| Saving | save in flight | "Saving…" (spinner) |
| Saved | save just succeeded | "Saved just now" → ages ("Saved 4 min ago") → settles to Clean wording |
| Failed | save returned an error | "Save failed — {reason}" + Retry |

- **Copy is DM-facing.** Words are "changes", "saved", "save failed". Never "FileChange", "YAML", "patch", "canon", "baseHash".
- **`{reason}`** is the human-readable cause surfaced from the `/__atlas/save` response (e.g. "disk permission denied", "a file changed on disk since you loaded it"), not a stack trace or HTTP code.
- **Singular/plural:** "1 unsaved change" / "{N} unsaved changes".

### B.3 `unsavedCount` semantics (exact)

- Each undoable mutation pushed to the global stack increments the conceptual edit count.
- **Undo decrements; redo re-increments.** The displayed count is the count of edits that are currently *live* (applied and not undone) relative to the last save boundary.
- **Hard invariant:** if working state equals baseline (everything undone, or discarded, or just saved), the surface reads **Clean ("All changes saved")** regardless of raw activity. The count is clamped by the baseline diff: it can never claim unsaved work when the file on disk already matches. This is enforced by deriving "dirty vs clean" from the baseline diff and only using the activity tally for the *number* shown while dirty.

---

## C. Confirms & discard

### C.1 Remove

- The `window.confirm` on map switch (`AtlasPlacementEditor.tsx` ~lines 944–948) and the draft-reset-on-map-change it guards (~lines 950–952). Map switch must **not** discard region/route/fog drafts — they persist per-map in the session.
- The `beforeunload` guard (~lines 830–838). Work is restored on return; the prompt only lies.
- Any remaining "drafts will be discarded" copy.

### C.2 Add: one explicit Discard

A single **Discard unsaved changes** action lives in the `SaveStatus` area (visible only when dirty). Clicking it opens one forgiving modal:

> **Discard all {N} unsaved changes?**
> This reverts everything back to your last saved state. This can't be undone.
> [ Keep editing ]  [ Discard changes ]

- Default / safe action is **Keep editing** (the non-destructive choice is the default focus).
- Confirm → `EditorSession.resetToBaseline()` + clear the IndexedDB snapshot + clear the undo stack. The surface returns to Clean.
- This is the *only* confirm dialog remaining in the editor.

### C.3 Preserve

The Part-1 save-boundary undo entry stays: immediately after a Save, Cmd+Z still restores the pre-save local state, exactly as Part 1 built it.

---

## D. Status-model vestige rework (explicit Part-1 debt)

This is the cleanup the program explicitly assigned to Part 2.

- **Delete entirely** from `src/atlas/yaml/canon.ts`: `DraftStatus`, `DRAFT_STATUS_LABEL`, `DRAFT_STATUS_TONE`, `classifyDraftStatus`.
- **Delete** `src/atlas/yaml/StatusBadge.tsx`.
- **`src/atlas/yaml/validateProject.ts`:** remove the `lastExportAt` option and the `lastExportAt` summary field; delete the `draft-not-exported` and `export-stale` issue checks (§7 "Draft / export staleness"). These instruct the DM to perform an action that no longer exists and actively mislead.
- Remove the now-dead imports/usages in `AtlasPlacementEditor.tsx` (lines 22–23, 736, 923).
- The new status lives **only** in `EditorSession`. No parallel classifier survives anywhere.

Per the standing rule (legacy + superseded → delete the whole unit, do not keep it behind a caveat), nothing here is preserved "just in case".

---

## E. Testing & verification

### E.1 No-loss invariant test (the gate)

A permanent test, parameterized over **every** draft kind — pins, per-map settings, regions, routes, fog, layer uploads:

> mutate the draft → switch to another map → switch back → simulate reload (tear down, remount, rehydrate from the serialized snapshot) → assert the **serializable working state is identical** to before.

"Serializable working state" deliberately excludes transient runtime artifacts that are deterministically regenerated from persisted data (e.g. layer-upload object URLs are recreated from the persisted data URL on hydrate, exactly as `useMapLayers` does today). The invariant is on the persisted/restored content, not on object identity of regenerated handles.

The map-switch confirms (§C.1) are removed **only once this test is green**. The test is permanent regression armor, in the spirit of the Part-1 ESLint `require()` guard. If any draft kind cannot be made to pass, its confirm stays and the gap is reported — no-loss is proven, never assumed.

### E.2 Unit

- Session baseline diff → `isDirty` and `unsavedCount` (including: undo decrements; full undo / discard / save ⇒ Clean).
- Snapshot `serialize()` / `hydrate()` round-trip for every draft kind, including inline layer-upload data.
- Restore detection: snapshot == canon ⇒ no notice; snapshot diverges ⇒ notice with correct `savedAt`; wrong schema version ⇒ discarded safely.
- Legacy localStorage → IndexedDB migration seeds the session then clears legacy keys.
- `SaveStatus` state machine: clean / unsaved(N) / saving / saved→ages / failed(reason) / discard→clean.

### E.3 Regression

- Undo/redo across every tab kind still works against the session; 50-cap and redo semantics intact.
- Part-1 save-boundary undo (Cmd+Z after Save) still restores pre-save state.
- Save flow + `onSaved` cleanup still clears the session and refreshes baseline correctly.
- `atlas-yaml-canon.test.ts` and `atlas-publish-check.test.ts` updated for the deleted vestige (removed `lastExportAt` / `classifyDraftStatus` cases; assert the `draft-not-exported` / `export-stale` codes no longer emit).

### E.4 Full gate (Part 2 is done only when all green)

- `tsc` clean.
- `npm test` (Vitest) green, including E.1.
- `npm run lint` clean.
- `npm run atlas:publish` — secrets scan + derived scan clean (no DM content leaks; player build unaffected — editor remains tree-shaken out via `__INCLUDE_EDITOR__`).
- Browser smoke (desktop): edit each tab kind → reload → restore notice + work intact → switch maps both ways, no loss, no confirm → Save → status cycles Clean → Saving → Saved → ages to Clean → make an edit → Discard → one forgiving confirm → Clean.

## Risks & mitigations

- **Refactor blast radius.** Mitigated by freezing each tab hook's public API; only internals change. Tab components and their tests are the regression tripwire.
- **IndexedDB unavailable / private-browsing quirks.** The editor is desktop-only on the DM's own machine; if IndexedDB is genuinely unavailable, fail soft to in-memory session (no persistence) and surface the single Failed-state messaging rather than crashing — but treat this as an unsupported edge, not a supported mode.
- **Snapshot/canon divergence after an external file edit.** Out of scope for Part 2's no-loss guarantee (Part 1's `baseHash` conflict protection still covers the save itself); the restore notice plus the existing conflict messaging cover the DM-visible cases.

## Independently shippable

Part 2 is self-contained: it changes the editor's state plumbing, status surface, and confirms, and removes the export-era vestige. It does not depend on Parts 3–4 and leaves them a coherent state model to build on. Done = §E.4 fully green.
