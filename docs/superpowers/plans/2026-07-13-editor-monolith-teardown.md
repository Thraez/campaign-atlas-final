# AtlasPlacementEditor Monolith Teardown Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax. This is a **behavior-preserving refactor** — every task keeps the app doing exactly what it did. TDD/regression discipline is mandatory.

**Goal:** Break `src/pages/AtlasPlacementEditor.tsx` (2794 lines; `AtlasPlacementEditorInner` alone is 208-2319 with 32 `useState`, 10 `useEffect`, 12 `useCallback`) into focused, independently-testable units, following the codebase's existing pattern of pure hooks + pure modules — WITHOUT changing behavior.

**Architecture:** Extract lowest-risk, leaflet-free logic first (duplicate deletion, pure helpers, self-contained hooks), leaving the leaflet-coupled render and the entangled save flow for last. Each extraction lands as its own commit with new unit tests, gated by the full suite + a manual dev pass.

**Tech Stack:** React hooks, TypeScript, Vitest, `@testing-library/react` (`renderHook`).

**HARD PREREQUISITE:** The page-level smoke test from `2026-07-13-page-smoke-tests.md` **Task 3** must be green and committed before starting Task 3 here. It is the regression net that proves the page still mounts + saves after each extraction. Do not skip it.

---

## Grounded context (verified file:line — from a full read of the file)

Responsibility map (approx line ranges within `AtlasPlacementEditorInner`):

| Concern | Lines |
|---|---|
| Canon load + overrides hydration + legacy migration | 209-238 |
| External-rebuild poll + `reloadCanon` | 240-291 |
| Overrides persistence + dirty stamping | 327-340 |
| Per-map draft (`mapOverride`/`patchMap`/`activeMap`) | 342-374 |
| Undo + draft-hook wiring | 376-420 |
| Pin placement resolution (`canonPlacement`/`effectivePlacement`/`effectiveCoord`) | 520-551 |
| Entity list derivation + filters | 553-591 |
| Local `pointInPolygon` (DUPLICATE) + `placedForLens` | 593-630 |
| Override mutation API (`mutateOverride`, `setCoord`, `setLabel`, `nudge`, …) | 632-718 |
| `buildWorldYamlContent` + `buildAssetBinaryChanges` | 797-878 |
| `onSaveClick` | 880-985 |
| Dirty-signal derivations | 784-795, 1011-1026 |
| `useEditorSession` holders adapter | 1028-1082 |
| Keyboard shortcuts (Esc-cancel, Undo/Redo) | 1084-1128 |
| Validation aggregation (`issuesByScope` + counts) | 1130-1173 |
| `renderCategory` + 6× repeated category-panel JSX | 1463-1937 |
| Leaflet `MapContainer` render | 1952-2078 |
| Modals incl. `DiffPreviewModal.onSaved` post-save cleanup/undo boundary | 2111-2317 |

Already delegated (don't touch): `useMapLayers`, `useUndoStack`, `useEditorSession`, `useRegionDraft`/`useRouteDraft`/`useFogDraft`/`useSoundscapeDraft`, `placementOverrides`, `saveGate.buildSavePlan`, `mapClickCoord`, `pinClickIntent`, `entityCloseIntent`, `useEntityEditDraft`, `useWorldYamlBaseline`, `buildFullWorldYaml`, `validateProject`, `buildPaletteIndex`, `railRegistry`.

Two known cleanups flagged by the read:
- **`pointInPolygon` (597-606) duplicates `src/atlas/geometry/polygon.ts:11-21`** (already tested at `src/test/geometry/polygon.test.ts`). Delete-and-import. Confirm arg order at the call site (~615) matches `(x, y, poly)` before swapping — a silent x/y swap corrupts fog-preview-in-player-lens.
- **`entityDrafts`/`setEntityDrafts` (778, 901, 1025, 2160) appears write-only-cleared, never populated** — likely vestigial since `useEntityEditDraft` (431) took over. VERIFY across `EntityEditPanel`/`useEntityEditDraft` call sites before deleting; out of scope for behavior-preserving teardown but record it.

---

## Task 1: Delete the duplicate `pointInPolygon` (zero risk)

**Files:** `src/pages/AtlasPlacementEditor.tsx`

- [ ] **Step 1:** Read `AtlasPlacementEditor.tsx:593-630` and the call site (~615). Confirm the shared `pointInPolygon(x, y, poly: Point[])` (`src/atlas/geometry/polygon.ts:11-21`) has the same signature/arg order.
- [ ] **Step 2:** Delete the local `pointInPolygon` (597-606); add `import { pointInPolygon } from "@/atlas/geometry/polygon";`. Adjust the call site if arg names differ.
- [ ] **Step 3:** `npx vitest run src/test/geometry/polygon.test.ts` + typecheck + lint.
- [ ] **Step 4:** Commit `refactor(editor): use shared geometry.pointInPolygon (delete inline duplicate)`.

---

## Task 2: Land the AtlasPlacementEditor smoke test

- [ ] Execute **Task 3 of `2026-07-13-page-smoke-tests.md`** if not already done. It must be green and committed. This is the regression net for everything below. (If already done, verify it runs green here and move on.)

---

## Task 3: Extract `useEditorKeyboardShortcuts` (smallest surface, no leaflet)

**Files:** Create `src/atlas/shell/useEditorKeyboardShortcuts.ts`; Test `src/test/shell/useEditorKeyboardShortcuts.test.ts`; Modify `AtlasPlacementEditor.tsx:1084-1128`.

- [ ] **Step 1 (test-first):** `renderHook(() => useEditorKeyboardShortcuts({ undoStack, pendingId, setPendingId }))`, dispatch `KeyboardEvent`s (`Escape`; `Ctrl+Z`/`Ctrl+Shift+Z`), assert `undoStack.undo/redo` and `setPendingId(null)` fire, and that the editable-target skip (1106-1111) prevents undo while typing in an input. FAIL first (module absent).
- [ ] **Step 2:** Move the two `useEffect` blocks (1084-1097, 1099-1128) into the hook; it takes `{ undoStack, pendingId, setPendingId }`. Call it from the page.
- [ ] **Step 3:** New hook test + smoke test + `npx vitest run src/test/shell` green.
- [ ] **Step 4:** Commit `refactor(editor): extract useEditorKeyboardShortcuts`.

---

## Task 4: Extract `buildValidationScopes` (pure)

**Files:** Create `src/atlas/yaml/validationScopes.ts`; Test `src/test/yaml/validation-scopes.test.ts`; Modify `AtlasPlacementEditor.tsx:1147-1173`.

- [ ] **Step 1 (test-first):** feed a fixture `Issue[]`, assert `buildValidationScopes(issues)` returns the `{ issuesByScope, pinIssues, mapIssues, regionIssues, routeIssues }` counts the page currently derives inline. FAIL first.
- [ ] **Step 2:** Extract the pure function; call it from the page (replace the inline block).
- [ ] **Step 3:** Test green + smoke test green.
- [ ] **Step 4:** Commit `refactor(editor): extract pure buildValidationScopes`.

---

## Task 5: Extract `usePinsTabFilters` (no leaflet)

**Files:** Create `src/atlas/editor/usePinsTabFilters.ts`; Test `src/test/editor/use-pins-tab-filters.test.ts`; Modify `AtlasPlacementEditor.tsx` (214, 509-512, 559-591).

- [ ] **Step 1 (test-first):** `renderHook` with a fixture entity list + `effectiveCoord` fn passed IN (it depends on overrides/activeMap — must be a parameter, not owned). Assert `filtered`/`placed`/`unplaced`/`allTypes`/`allTags` for a few filter combinations. FAIL first.
- [ ] **Step 2:** Move `filter`, `stateFilter`, `visFilter`, `typeFilter`, `tagFilter` + the derivations into the hook; accept `{ entities, effectiveCoord, activeMap }`.
- [ ] **Step 3:** Test + smoke green.
- [ ] **Step 4:** Commit `refactor(editor): extract usePinsTabFilters`.

---

## Task 6: Extract `usePinOverrideMutations` (medium risk — synchronous ref mirror)

**Files:** Create `src/atlas/editor/usePinOverrideMutations.ts`; Test `src/test/editor/use-pin-override-mutations.test.ts`; Modify `AtlasPlacementEditor.tsx:520-551,632-718`.

- [ ] **Step 1 (test-first):** construct fake `project`/`activeMap`/`overrides` + a fake undo stack; call each mutator (`setCoord`, `setLabel`, `setPinOverride`, `nudge`, `removeCoord`, `clearOverride`, `duplicateToMap`) and the read-side (`canonPlacement`/`effectivePlacement`/`effectiveCoord`); assert resulting `Overrides` + pushed undo entries. FAIL first.
- [ ] **Step 2:** Move `mutateOverride` + the 7 setters + the read-side resolvers into the hook. **Keep the `overridesRef` synchronous-mirror pattern (441-444, `setOverridesUndoable` 452-472) intact** — `DiffPreviewModal.onSaved` (2166-2174) reads `overridesRef.current` synchronously and must keep working. Decide (see open question) whether the ref is owned by this hook and exposed, or hoisted and passed in; document the choice in the hook's header.
- [ ] **Step 3:** Test + smoke green + a manual `npm run dev` pass placing/nudging/duplicating a pin.
- [ ] **Step 4:** Commit `refactor(editor): extract usePinOverrideMutations`.

---

## Task 7: Extract `useSaveFlow` (highest risk — do last, split pure part first)

**Files:** Create `src/atlas/save/buildSaveBatch.ts` (pure) + `src/atlas/save/useSaveFlow.ts` (hook); Tests `src/test/save/build-save-batch.test.ts`; Modify `AtlasPlacementEditor.tsx:784-795,813-878,880-985,1011-1026,2133-2245`.

- [ ] **Step 1 (test-first, PURE part):** extract the pure "assemble the `FileChange[]` batch" logic (`buildWorldYamlContent` 813-850, `buildAssetBinaryChanges` 861-878, plus the plan assembly currently in `onSaveClick` that isn't already in `buildSavePlan`) into `buildSaveBatch(inputs)` returning the batch + dirty flags. Test heavily with fixtures — no React. FAIL first, then implement, then green.
- [ ] **Step 2:** Wrap the side-effecting shell (`onSaveClick` toast/setState/session calls + the `DiffPreviewModal.onSaved` post-save cleanup + save-boundary undo entry, 2133-2245) into `useSaveFlow(...)` returning `{ onSaveClick, onSaved, hasUnsavedChanges, dirtyCount, ... }`. The `onSaved` undo-boundary logic mutates 5+ pieces of state atomically — preserve ordering exactly.
- [ ] **Step 3:** FULL verification — the save integration test (`placement-save-integration.test.tsx`), the save-boundary undo test (`save-boundary-undo.test.tsx`), the new pure-batch test, the page smoke test, all four suite shards, typecheck, lint. Then a manual dev pass: place a pin, edit world/layer/entity, Save, confirm the diff preview + on-disk write + undo-across-save all still work.
- [ ] **Step 4:** Commit `refactor(editor): extract useSaveFlow (+ pure buildSaveBatch)`.

---

## Task 8 (optional): collapse the 6× category-panel JSX

- [ ] The `renderCategory` closure + six near-identical panel blocks (1469-1933) can collapse to a `CATEGORIES.map(...)`-driven single branch (~300 lines → ~60). Decide first (open question) whether to keep it JSX-returning or reshape into a data table for snapshot-testability. Only attempt after Tasks 1-7 land. Commit separately.

---

## Verification (after EACH task, non-negotiable)
```bash
for n in 1 2 3 4; do npx vitest run --shard=$n/4 --poolOptions.forks.maxForks=3; done
npm run typecheck && npm run lint
```
All four shards green (re-run a lone shard on the known `onTaskUpdate` RPC flake). After Tasks 6 and 7, ALSO do a manual `npm run dev` place-and-save pass. Behavior must be identical — this is a refactor, not a feature.

## Acceptance criteria
- `AtlasPlacementEditor.tsx` shrinks materially (target: well under 2000 lines; the extracted hooks/modules each have their own unit tests).
- No behavior change (smoke + save-integration + undo tests all still green).
- The duplicate `pointInPolygon` is gone; `entityDrafts` dead-state is either removed (if verified vestigial) or explicitly documented as retained.

## Open questions
1. `usePinOverrideMutations` ↔ `useSaveFlow` boundary: who owns `overridesRef`? (Decide in Task 6.)
2. `entityDrafts` — verify vestigial before deleting.
3. Task 8: JSX-returning helper vs data-table reshape.
