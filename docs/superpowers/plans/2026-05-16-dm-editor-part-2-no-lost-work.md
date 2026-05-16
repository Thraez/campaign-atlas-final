# DM Editor Part 2 — No Lost Work + Clear State — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the DM editor lose-proof and legible — every draft persists and restores across map-switch and reload, one honest save-status surface replaces four, and the export-era status vestige is deleted.

**Architecture:** A single `EditorSession` coordinator owns a per-map snapshot of every draft holder (pins, map settings, regions, routes, fog, layers) using each holder's existing `snapshot()` / `applySnapshot()` seam (built in Part 1 for save-boundary undo). It persists one versioned blob to IndexedDB on a debounce, rehydrates on mount with a one-shot restore notice, drives map-switch save/restore so switching is non-destructive, and exposes the single derived status (clean / unsaved(N) / saving / saved / failed) plus discard. The per-tab hook public APIs do not change.

**Tech Stack:** React + TypeScript + Vite, Vitest + Testing Library, IndexedDB (no new deps), Tailwind, lucide-react, sonner.

**Spec:** `docs/superpowers/specs/2026-05-16-dm-editor-part-2-no-lost-work-design.md`

**Three independently-shippable phases. Each ends green on its own gate. Execute in order.**

- **Phase 1 — Vestige removal** (no dependencies; unblocks Phase 3): delete `lastExportAt` / `classifyDraftStatus` / `DraftStatusBadge`, fix dead "Export DM Changes" guidance, update tests.
- **Phase 2 — Session spine**: IndexedDB adapter, `EditorSession` coordinator, per-map persistence + restore + non-destructive map switch, the no-loss invariant test (the hard gate).
- **Phase 3 — One status surface**: `SaveStatus` component, honest change count, forgiving Discard, remove the other three surfaces and all navigation confirms.

---

## File Structure

**Created:**
- `src/atlas/session/idbStore.ts` — minimal promise-wrapped IndexedDB single-key store. One responsibility: durable get/set/delete of one JSON blob.
- `src/atlas/session/sessionSnapshot.ts` — pure types + `serializeSession` / `deserializeSession`. One responsibility: the on-disk shape and its (de)serialization.
- `src/atlas/session/useEditorSession.ts` — the coordinator hook. One responsibility: own per-map slices, drive holder snapshot/restore on map switch, debounced persist, mount hydrate + restore detection, derived status/count, discard.
- `src/atlas/session/SaveStatus.tsx` — the single status surface component. One responsibility: render session status + Save + Discard affordance.
- `src/atlas/session/DiscardConfirmModal.tsx` — the one forgiving confirm dialog.
- `src/test/session/idbStore.test.ts`
- `src/test/session/sessionSnapshot.test.ts`
- `src/test/session/useEditorSession.test.tsx`
- `src/test/session/no-loss-invariant.test.ts` — the hard gate.
- `src/test/session/SaveStatus.test.tsx`

**Modified:**
- `src/atlas/yaml/canon.ts` — delete `DraftStatus`, `DRAFT_STATUS_LABEL`, `DRAFT_STATUS_TONE`, `classifyDraftStatus`.
- `src/atlas/yaml/StatusBadge.tsx` — deleted entirely.
- `src/atlas/yaml/validateProject.ts` — remove `lastExportAt` opt + summary field + `draft-not-exported` / `export-stale` checks; fix the dead `uploaded-assets-pending` hint.
- `src/pages/AtlasPlacementEditor.tsx` — remove vestige imports/usages; wire `useEditorSession`; replace four status surfaces with `SaveStatus`; remove map-switch confirm, `beforeunload`, 5-minute nudge, `tabExportAt`/`markTabExport`.
- `src/test/atlas-yaml-canon.test.ts` — remove `classifyDraftStatus` describe block.
- `src/test/atlas-publish-check.test.ts` — remove `lastExportAt` / `draft-not-exported` assertions.

---

## PHASE 1 — Vestige removal

### Task 1: Delete the `classifyDraftStatus` test block

**Files:**
- Test: `src/test/atlas-yaml-canon.test.ts:46-60`

- [ ] **Step 1: Run the test file to confirm current green baseline**

Run: `npx vitest run src/test/atlas-yaml-canon.test.ts`
Expected: PASS (includes a `classifyDraftStatus` describe with 4 tests).

- [ ] **Step 2: Remove the now-doomed describe block and its import**

In `src/test/atlas-yaml-canon.test.ts`, delete the import line:

```ts
import { classifyDraftStatus } from "@/atlas/yaml/canon";
```

and delete the entire block (lines ~46–60):

```ts
describe("classifyDraftStatus", () => {
  it("clean state = built-from-yaml", () => {
    expect(classifyDraftStatus({ dirtyCount: 0 })).toBe("built-from-yaml");
  });
  it("dirty state = ready-to-export", () => {
    expect(classifyDraftStatus({ dirtyCount: 3 })).toBe("ready-to-export");
  });
  it("just exported, clean = exported-patch", () => {
    expect(classifyDraftStatus({ dirtyCount: 0, lastExportAt: Date.now() })).toBe("exported-patch");
  });
  it("old export = needs-commit", () => {
    const old = Date.now() - 10 * 60_000;
    expect(classifyDraftStatus({ dirtyCount: 0, lastExportAt: old })).toBe("needs-commit");
  });
});
```

- [ ] **Step 3: Run the test file — the remaining `validatePatchYaml` tests still pass**

Run: `npx vitest run src/test/atlas-yaml-canon.test.ts`
Expected: PASS, no reference errors.

- [ ] **Step 4: Commit**

```bash
git add src/test/atlas-yaml-canon.test.ts
git commit -m "test: drop classifyDraftStatus cases (export-era vestige, Part 2)"
```

### Task 2: Delete `DraftStatus` model from `canon.ts` and remove `StatusBadge.tsx`

**Files:**
- Modify: `src/atlas/yaml/canon.ts:30-71`
- Delete: `src/atlas/yaml/StatusBadge.tsx`
- Modify: `src/pages/AtlasPlacementEditor.tsx:22-23,736,923`

- [ ] **Step 1: Delete the vestige from `canon.ts`**

In `src/atlas/yaml/canon.ts`, delete everything from `export type DraftStatus =` (line ~32) through the end of `classifyDraftStatus` (the closing brace at line ~71), inclusive — i.e. remove `DraftStatus`, `DRAFT_STATUS_LABEL`, `DRAFT_STATUS_TONE`, and `classifyDraftStatus`. Keep `CanonTier` (line ~30) and everything above it. Leave a single blank line where the block was.

- [ ] **Step 2: Delete the badge component**

```bash
git rm src/atlas/yaml/StatusBadge.tsx
```

- [ ] **Step 3: Remove the dead imports and usages in the editor**

In `src/pages/AtlasPlacementEditor.tsx`:

- Delete line 22: `import { classifyDraftStatus } from "@/atlas/yaml/canon";`
- Delete line 23: `import { DraftStatusBadge } from "@/atlas/yaml/StatusBadge";`
- Delete line 736: `const draftStatus = classifyDraftStatus({ dirtyCount, lastExportAt: null });`
- Delete the `<DraftStatusBadge status={draftStatus} />` element at line ~923 (remove the whole element; if it sits alone in a wrapper that is now empty, remove the empty wrapper too).

Keep `const dirtyCount = ...` at line 735 — it is still referenced by `pinSideUnsaved` at line 743.

- [ ] **Step 4: Typecheck — proves no remaining references**

Run: `npx tsc --noEmit`
Expected: PASS. (A failure here naming `classifyDraftStatus`, `DraftStatus*`, or `StatusBadge` means a reference was missed — fix it before continuing.)

- [ ] **Step 5: Commit**

```bash
git add src/atlas/yaml/canon.ts src/pages/AtlasPlacementEditor.tsx
git rm --cached src/atlas/yaml/StatusBadge.tsx 2>/dev/null; git add -A src/atlas/yaml/StatusBadge.tsx
git commit -m "refactor: delete DraftStatus model + StatusBadge (export-era vestige, Part 2)"
```

### Task 3: Strip export-staleness from `validateProject.ts`

**Files:**
- Modify: `src/atlas/yaml/validateProject.ts:46-67,456-483,512-517`
- Test: `src/test/atlas-publish-check.test.ts:118-124`

- [ ] **Step 1: Update the failing test first (it asserts the vestige)**

In `src/test/atlas-publish-check.test.ts`, find the block at lines ~118-124:

```ts
    const r = validateProject({
      project: p,
      draftPlacements: [{ entityId: "town", mapId: "m1", x: 10, y: 10 }],
      lastExportAt: null,
    });
    expect(r.issues.some((i) => i.code === "draft-not-exported")).toBe(true);
```

Replace it with an assertion of the new contract (no export concept; a draft placement alone raises no draft-staleness issue):

```ts
    const r = validateProject({
      project: p,
      draftPlacements: [{ entityId: "town", mapId: "m1", x: 10, y: 10 }],
    });
    expect(r.issues.some((i) => i.code === "draft-not-exported")).toBe(false);
    expect(r.issues.some((i) => i.code === "export-stale")).toBe(false);
```

- [ ] **Step 2: Run it — expect FAIL**

Run: `npx vitest run src/test/atlas-publish-check.test.ts`
Expected: FAIL — `draft-not-exported` is still emitted by current `validateProject`.

- [ ] **Step 3: Remove `lastExportAt` from the options interface and destructure**

In `src/atlas/yaml/validateProject.ts`:

- In `ValidateProjectOpts` (line ~54), delete the two lines:

```ts
  /** Last patch export timestamp (ms). Used to flag un-exported drafts. */
  lastExportAt?: number | null;
```

- In the destructure at line ~67, change:

```ts
  const { project, draftPlacements, draftMap, draftLocalLayers = [], lastExportAt = null } = opts;
```

to:

```ts
  const { project, draftPlacements, draftMap, draftLocalLayers = [] } = opts;
```

- [ ] **Step 4: Delete the export-staleness checks (section 7)**

Delete the entire block at lines ~456-474:

```ts
  // 7. Draft / export staleness
  if (draftPlacements.length > 0) {
    if (!lastExportAt) {
      issues.push({
        severity: "warning",
        code: "draft-not-exported",
        category: "draft",
        message: `${draftPlacements.length} draft placement(s) have never been exported`,
        hint: "Click Export DM Changes to download a YAML patch you can commit.",
      });
    } else if (Date.now() - lastExportAt > 1000 * 60 * 30) {
      issues.push({
        severity: "suggestion",
        code: "export-stale",
        category: "draft",
        message: `Last export was over 30 minutes ago — drafts may be stale`,
      });
    }
  }
```

- [ ] **Step 5: Fix the dead "Export DM Changes" hint on the kept check**

The `uploaded-assets-pending` check (lines ~475-483) stays, but its `message`/`hint` instruct an action removed in Part 1. Replace that `issues.push({...})` with:

```ts
  if (draftLocalLayers.some((l) => l.origin === "upload")) {
    issues.push({
      severity: "suggestion",
      code: "uploaded-assets-pending",
      category: "draft",
      message: `Uploaded map images are local until you Save`,
      hint: "Click Save — the image files are written alongside world.yaml.",
    });
  }
```

- [ ] **Step 6: Remove `lastExportAt` from the summary meta**

In the returned `meta` object (line ~516), delete the line:

```ts
      lastExportAt,
```

- [ ] **Step 7: Run the test — expect PASS**

Run: `npx vitest run src/test/atlas-publish-check.test.ts`
Expected: PASS.

- [ ] **Step 8: Typecheck + full test sweep for collateral**

Run: `npx tsc --noEmit && npx vitest run`
Expected: PASS. If any other caller passed `lastExportAt:` to `validateProject`, tsc flags it — remove that argument at the call site (it is dead).

- [ ] **Step 9: Commit**

```bash
git add src/atlas/yaml/validateProject.ts src/test/atlas-publish-check.test.ts
git commit -m "refactor: remove export-staleness from validateProject (Part 2 vestige cleanup)"
```

### Task 4: Phase 1 gate

- [ ] **Step 1: Full gate**

Run: `npx tsc --noEmit && npx vitest run && npm run lint && npm run atlas:publish`
Expected: all PASS / clean. `atlas:publish` runs the secrets + derived scans; Phase 1 touches no player-build surface so they must stay clean.

- [ ] **Step 2: Grep proves the vestige is gone**

Run: `git grep -nE "classifyDraftStatus|DraftStatus|DRAFT_STATUS_|lastExportAt|draft-not-exported|export-stale" -- src ':!docs'`
Expected: **no output**. Any hit is a missed reference — fix before declaring Phase 1 done.

- [ ] **Step 3: Commit (if Step 1/2 required fixes)**

```bash
git add -A && git commit -m "chore: Phase 1 gate green — export-era vestige fully removed"
```

**Phase 1 is independently shippable here.**

---

## PHASE 2 — Session spine

### Task 5: IndexedDB single-key store

**Files:**
- Create: `src/atlas/session/idbStore.ts`
- Test: `src/test/session/idbStore.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/test/session/idbStore.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import "fake-indexeddb/auto";
import { idbGet, idbSet, idbDelete } from "@/atlas/session/idbStore";

describe("idbStore", () => {
  beforeEach(async () => { await idbDelete("k"); });

  it("returns null for a missing key", async () => {
    expect(await idbGet<{ a: number }>("k")).toBeNull();
  });

  it("round-trips a value", async () => {
    await idbSet("k", { a: 1, s: "x" });
    expect(await idbGet<{ a: number; s: string }>("k")).toEqual({ a: 1, s: "x" });
  });

  it("overwrites on repeated set", async () => {
    await idbSet("k", { a: 1 });
    await idbSet("k", { a: 2 });
    expect(await idbGet<{ a: number }>("k")).toEqual({ a: 2 });
  });

  it("delete removes the value", async () => {
    await idbSet("k", { a: 1 });
    await idbDelete("k");
    expect(await idbGet("k")).toBeNull();
  });
});
```

- [ ] **Step 2: Add the test dependency, run, expect FAIL**

Run: `npm i -D fake-indexeddb && npx vitest run src/test/session/idbStore.test.ts`
Expected: FAIL — `@/atlas/session/idbStore` does not exist.

- [ ] **Step 3: Implement**

Create `src/atlas/session/idbStore.ts`:

```ts
/**
 * Minimal promise-wrapped IndexedDB store: one database, one object store,
 * keyed JSON blobs. Used for the durable editor-session snapshot.
 *
 * No dependency, no schema migration machinery — a versioned envelope lives
 * in the value (see sessionSnapshot.ts), not in the IDB schema.
 */
const DB_NAME = "atlas-editor";
const STORE = "session";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("indexedDB open failed"));
  });
}

async function tx<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = run(t.objectStore(STORE));
    req.onsuccess = () => resolve(req.result as T);
    req.onerror = () => reject(req.error ?? new Error("indexedDB tx failed"));
    t.oncomplete = () => db.close();
  });
}

export async function idbGet<T>(key: string): Promise<T | null> {
  const v = await tx<T | undefined>("readonly", (s) => s.get(key));
  return v ?? null;
}

export async function idbSet<T>(key: string, value: T): Promise<void> {
  await tx("readwrite", (s) => s.put(value, key));
}

export async function idbDelete(key: string): Promise<void> {
  await tx("readwrite", (s) => s.delete(key));
}
```

- [ ] **Step 4: Run the test — expect PASS**

Run: `npx vitest run src/test/session/idbStore.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/atlas/session/idbStore.ts src/test/session/idbStore.test.ts package.json package-lock.json
git commit -m "feat: IndexedDB single-key store for editor session (Part 2)"
```

### Task 6: Session snapshot shape + (de)serialize + the data-layer no-loss round-trip

**Files:**
- Create: `src/atlas/session/sessionSnapshot.ts`
- Test: `src/test/session/sessionSnapshot.test.ts`

This task pins the on-disk shape. It stores every draft holder **keyed by mapId** (so map-switch is non-destructive) plus pin overrides (already global, keyed `${mapId}:${entityId}`). Holder slice types are reused from the hooks so the shape can't drift.

- [ ] **Step 1: Write the failing test**

Create `src/test/session/sessionSnapshot.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  SESSION_SCHEMA_VERSION,
  serializeSession,
  deserializeSession,
  type SessionState,
} from "@/atlas/session/sessionSnapshot";

const sample: SessionState = {
  overrides: { "m1:town": { x: 10, y: 20, label: "Town" } },
  mapOverrideByMap: { m1: { width: 4096 } },
  regionByMap: { m1: { edits: {}, added: [{ id: "r1", mapId: "m1", name: "R", points: [[0,0],[1,1],[2,0]], visibility: "dm" }], deleted: [] } },
  routeByMap: { m1: { edits: {}, added: [], deleted: [] } },
  fogByMap: { m1: { mapId: "m1", enabled: true, color: "rgba(0,0,0,0.55)", reveals: [[[0,0],[1,1],[2,0]]] } },
  layerByMap: { m1: [{ id: "up-1", src: "data:x", x: 0, y: 0, width: 1, height: 1, opacity: 1, zIndex: 10, origin: "upload" }] },
  savedAt: 1_700_000_000_000,
};

describe("sessionSnapshot", () => {
  it("round-trips every holder unchanged", () => {
    const blob = serializeSession(sample);
    const back = deserializeSession(blob);
    expect(back).toEqual(sample);
  });

  it("wraps the payload in a versioned envelope", () => {
    const blob = serializeSession(sample) as { version: number };
    expect(blob.version).toBe(SESSION_SCHEMA_VERSION);
  });

  it("returns null for a wrong-version envelope (safe downgrade)", () => {
    expect(deserializeSession({ version: -1, state: sample })).toBeNull();
  });

  it("returns null for a structurally invalid envelope", () => {
    expect(deserializeSession({ junk: true })).toBeNull();
    expect(deserializeSession(null)).toBeNull();
  });
});
```

- [ ] **Step 2: Run it — expect FAIL**

Run: `npx vitest run src/test/session/sessionSnapshot.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement**

Create `src/atlas/session/sessionSnapshot.ts`:

```ts
/**
 * The durable editor-session shape and its (de)serialization.
 *
 * Every per-map draft holder is stored keyed by mapId so switching maps is
 * non-destructive. Pin overrides are already globally keyed `${mapId}:${id}`.
 * Slice types are imported from the hooks so this shape can never drift from
 * what the hooks actually snapshot.
 *
 * The on-disk value is a versioned envelope. A version mismatch deserializes
 * to null (treated as "no draft") — a safe, explicit downgrade.
 */
import type { MapDocument, MapLayer } from "@/atlas/content/schema";
import type { RegionDraft } from "@/atlas/regions/useRegionDraft";
import type { RouteDraft } from "@/atlas/routes/useRouteDraft";
import type { FogOverlay } from "@/atlas/content/schema";
import type { LocalLayer } from "@/atlas/useMapLayers";
import type { PinOverride } from "@/atlas/pins/presets";

export const SESSION_SCHEMA_VERSION = 1;

export type OverrideValue = { x: number; y: number; label?: string; pin?: PinOverride };
export type Overrides = Record<string, OverrideValue | null>;

export interface SessionState {
  /** key = `${mapId}:${entityId}` */
  overrides: Overrides;
  mapOverrideByMap: Record<string, Partial<MapDocument>>;
  regionByMap: Record<string, RegionDraft>;
  routeByMap: Record<string, RouteDraft>;
  /** null slice = "no fog override for this map" */
  fogByMap: Record<string, FogOverlay | null>;
  layerByMap: Record<string, LocalLayer[]>;
  /** wall-clock ms of the last working-state change */
  savedAt: number;
}

interface Envelope {
  version: number;
  state: SessionState;
}

export function serializeSession(state: SessionState): unknown {
  const env: Envelope = { version: SESSION_SCHEMA_VERSION, state };
  // Structured-clone-safe already; round-trip through JSON to guarantee the
  // stored value is a plain detached object (no refs into live React state).
  return JSON.parse(JSON.stringify(env));
}

export function deserializeSession(blob: unknown): SessionState | null {
  if (!blob || typeof blob !== "object") return null;
  const env = blob as Partial<Envelope>;
  if (env.version !== SESSION_SCHEMA_VERSION) return null;
  if (!env.state || typeof env.state !== "object") return null;
  const s = env.state as Partial<SessionState>;
  if (
    !s.overrides || !s.mapOverrideByMap || !s.regionByMap ||
    !s.routeByMap || !s.fogByMap || !s.layerByMap ||
    typeof s.savedAt !== "number"
  ) return null;
  return s as SessionState;
}

/** True when the snapshot represents real unsaved work (any holder non-empty). */
export function sessionHasWork(s: SessionState): boolean {
  const anyOverride = Object.values(s.overrides).some((v) => v != null);
  const anyMap = Object.values(s.mapOverrideByMap).some((m) => m && Object.keys(m).length > 0);
  const anyRegion = Object.values(s.regionByMap).some((r) => r.added.length || r.deleted.length || Object.keys(r.edits).length);
  const anyRoute = Object.values(s.routeByMap).some((r) => r.added.length || r.deleted.length || Object.keys(r.edits).length);
  const anyFog = Object.values(s.fogByMap).some((f) => f != null);
  const anyLayer = Object.values(s.layerByMap).some((l) => l.length > 0);
  return anyOverride || anyMap || anyRegion || anyRoute || anyFog || anyLayer;
}
```

- [ ] **Step 4: Run it — expect PASS**

Run: `npx vitest run src/test/session/sessionSnapshot.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/atlas/session/sessionSnapshot.ts src/test/session/sessionSnapshot.test.ts
git commit -m "feat: versioned editor-session snapshot shape + (de)serialize (Part 2)"
```

### Task 7: The no-loss invariant test (the hard gate)

This test is the contract every later task must keep green. It proves that for **every** holder kind, a value survives serialize → deserialize → re-applied into a fresh hook instance, including the map-switch path (slice keyed by mapId, swap map, swap back). It uses the hooks' real `snapshot()` / `applySnapshot()` via `renderHook`.

**Files:**
- Test: `src/test/session/no-loss-invariant.test.ts`

- [ ] **Step 1: Write the invariant test**

Create `src/test/session/no-loss-invariant.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { serializeSession, deserializeSession, type SessionState } from "@/atlas/session/sessionSnapshot";
import { useRegionDraft } from "@/atlas/regions/useRegionDraft";
import { useRouteDraft } from "@/atlas/routes/useRouteDraft";
import { useFogDraft } from "@/atlas/fog/useFogDraft";
import type { MapDocument } from "@/atlas/content/schema";

const mapA: MapDocument = { id: "A", worldId: "w", name: "A", width: 100, height: 100, layers: [], regions: [], routes: [] };
const mapB: MapDocument = { ...mapA, id: "B", name: "B" };

function emptyState(savedAt = 1): SessionState {
  return { overrides: {}, mapOverrideByMap: {}, regionByMap: {}, routeByMap: {}, fogByMap: {}, layerByMap: {}, savedAt };
}

describe("no-loss invariant — per holder", () => {
  it("region draft survives serialize → deserialize → fresh hook applySnapshot", () => {
    const { result } = renderHook(() => useRegionDraft(mapA, {}, undefined));
    act(() => { result.current.startDraw(); });
    act(() => {
      result.current.addDraftPoint([1, 1]);
      result.current.addDraftPoint([9, 1]);
      result.current.addDraftPoint([5, 9]);
    });
    act(() => { result.current.finishDraw(); });
    const snap = result.current.snapshot();

    const state = emptyState();
    state.regionByMap.A = snap;
    const restored = deserializeSession(serializeSession(state))!;

    const fresh = renderHook(() => useRegionDraft(mapA, {}, undefined));
    act(() => { fresh.result.current.applySnapshot(restored.regionByMap.A); });
    expect(fresh.result.current.snapshot()).toEqual(snap);
    expect(fresh.result.current.effective.length).toBe(1);
  });

  it("route draft survives the round-trip", () => {
    const { result } = renderHook(() => useRouteDraft(null, mapA, {}, undefined));
    act(() => { result.current.startDraw(); });
    act(() => { result.current.addDraftPoint([0, 0]); result.current.addDraftPoint([10, 10]); });
    act(() => { result.current.finishDraw(); });
    const snap = result.current.snapshot();

    const state = emptyState();
    state.routeByMap.A = snap;
    const restored = deserializeSession(serializeSession(state))!;

    const fresh = renderHook(() => useRouteDraft(null, mapA, {}, undefined));
    act(() => { fresh.result.current.applySnapshot(restored.routeByMap.A); });
    expect(fresh.result.current.snapshot()).toEqual(snap);
  });

  it("fog draft survives the round-trip", () => {
    const { result } = renderHook(() => useFogDraft(mapA, undefined));
    act(() => { result.current.setEnabled(true); });
    act(() => { result.current.addDraftPoint([0, 0]); result.current.addDraftPoint([9, 0]); result.current.addDraftPoint([5, 9]); });
    act(() => { result.current.finishDraftPolygon(); });
    const snap = result.current.snapshot();

    const state = emptyState();
    state.fogByMap.A = snap;
    const restored = deserializeSession(serializeSession(state))!;

    const fresh = renderHook(() => useFogDraft(mapA, undefined));
    act(() => { fresh.result.current.applySnapshot(restored.fogByMap.A); });
    expect(fresh.result.current.snapshot()).toEqual(snap);
  });

  it("switch-away-and-back is non-destructive (per-map slices)", () => {
    // Author region on A, capture A's slice, simulate switching to B then back.
    const onA = renderHook(({ m }) => useRegionDraft(m, {}, undefined), { initialProps: { m: mapA } });
    act(() => { onA.result.current.startDraw(); });
    act(() => {
      onA.result.current.addDraftPoint([1, 1]);
      onA.result.current.addDraftPoint([9, 1]);
      onA.result.current.addDraftPoint([5, 9]);
    });
    act(() => { onA.result.current.finishDraw(); });
    const sliceA = onA.result.current.snapshot();

    const state = emptyState();
    state.regionByMap.A = sliceA;

    // Switch to B: coordinator would applySnapshot(B-slice ?? EMPTY).
    onA.rerender({ m: mapB });
    act(() => { onA.result.current.applySnapshot(state.regionByMap.B ?? { edits: {}, added: [], deleted: [] }); });
    expect(onA.result.current.effective.length).toBe(0); // B is clean

    // Switch back to A: coordinator restores A's slice.
    onA.rerender({ m: mapA });
    act(() => { onA.result.current.applySnapshot(state.regionByMap.A); });
    expect(onA.result.current.snapshot()).toEqual(sliceA);
    expect(onA.result.current.effective.length).toBe(1); // A's work intact
  });
});
```

- [ ] **Step 2: Run it — expect PASS**

Run: `npx vitest run src/test/session/no-loss-invariant.test.ts`
Expected: PASS (4 tests). This proves the hooks' existing snapshot/applySnapshot seam is loss-free through the snapshot shape. If any holder fails here, **stop** — the coordinator cannot be safe until this is green; report which holder and why.

- [ ] **Step 3: Commit**

```bash
git add src/test/session/no-loss-invariant.test.ts
git commit -m "test: no-loss invariant gate for every draft holder (Part 2)"
```

### Task 8: `useEditorSession` coordinator

The coordinator is given handles to every holder's `snapshot`/`applySnapshot`, the active map id, the undo stack, and pin-override get/set. It maintains per-map slices, swaps holder content on map change, persists to IDB on a debounce, hydrates on mount (with restore detection), exposes derived `status` / `unsavedCount`, and `discardAll` / `markSaving` / `markSaved` / `markFailed`.

**Files:**
- Create: `src/atlas/session/useEditorSession.ts`
- Test: `src/test/session/useEditorSession.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/test/session/useEditorSession.test.tsx`:

```tsx
import { describe, it, expect, beforeEach, vi } from "vitest";
import "fake-indexeddb/auto";
import { renderHook, act, waitFor } from "@testing-library/react";
import { idbGet, idbDelete } from "@/atlas/session/idbStore";
import { useEditorSession, SESSION_IDB_KEY } from "@/atlas/session/useEditorSession";
import type { SessionState } from "@/atlas/session/sessionSnapshot";

/** A fake holder pair backed by a plain object, mimicking a draft hook. */
function makeHolder(initial = 0) {
  let v = { n: initial };
  return {
    snapshot: () => v,
    applySnapshot: (s: { n: number }) => { v = s; },
    get value() { return v; },
    bump() { v = { n: v.n + 1 }; },
  };
}

function harness(activeMapId: string, holders: ReturnType<typeof makeHolder>) {
  return useEditorSession({
    activeMapId,
    undoStack: { clear: vi.fn() } as any,
    holders: {
      overrides: { get: () => ({}), set: () => {} },
      mapOverride: { get: () => ({}), set: () => {} },
      region: { snapshot: holders.snapshot, applySnapshot: holders.applySnapshot },
      route: { snapshot: () => ({ edits: {}, added: [], deleted: [] }), applySnapshot: () => {} },
      fog: { snapshot: () => null, applySnapshot: () => {} },
      layer: { snapshot: () => [], applySnapshot: () => {} },
    },
    perMapDirtyCount: () => holders.value.n,
  });
}

describe("useEditorSession", () => {
  beforeEach(async () => { await idbDelete(SESSION_IDB_KEY); vi.useRealTimers(); });

  it("starts clean with no snapshot", async () => {
    const h = makeHolder();
    const { result } = renderHook(() => harness("A", h));
    await waitFor(() => expect(result.current.hydrated).toBe(true));
    expect(result.current.status).toBe("clean");
    expect(result.current.unsavedCount).toBe(0);
    expect(result.current.restoredNotice).toBeNull();
  });

  it("goes unsaved with a count when a holder reports dirt", async () => {
    const h = makeHolder();
    const { result, rerender } = renderHook(() => harness("A", h));
    await waitFor(() => expect(result.current.hydrated).toBe(true));
    act(() => { h.bump(); h.bump(); });
    rerender();
    expect(result.current.status).toBe("unsaved");
    expect(result.current.unsavedCount).toBe(2);
  });

  it("persists to IDB (debounced) and re-hydrates with a restore notice", async () => {
    vi.useFakeTimers();
    const h = makeHolder();
    const first = renderHook(() => harness("A", h));
    await vi.waitFor(() => expect(first.result.current.hydrated).toBe(true));
    act(() => { h.bump(); first.rerender(); });
    await act(async () => { vi.advanceTimersByTime(500); await Promise.resolve(); });
    vi.useRealTimers();

    const stored = await idbGet<unknown>(SESSION_IDB_KEY);
    expect(stored).not.toBeNull();

    const h2 = makeHolder();
    const second = renderHook(() => harness("A", h2));
    await waitFor(() => expect(second.result.current.hydrated).toBe(true));
    expect(second.result.current.restoredNotice).not.toBeNull();
    expect(h2.value.n).toBe(1); // holder rehydrated from snapshot
  });

  it("discardAll clears holders, IDB, undo, and returns to clean", async () => {
    const h = makeHolder();
    const { result, rerender } = renderHook(() => harness("A", h));
    await waitFor(() => expect(result.current.hydrated).toBe(true));
    act(() => { h.bump(); rerender(); });
    await act(async () => { await result.current.discardAll(); });
    rerender();
    expect(result.current.status).toBe("clean");
    expect(await idbGet(SESSION_IDB_KEY)).toBeNull();
  });

  it("markSaving → markSaved drives status and resets the count baseline", async () => {
    const h = makeHolder();
    const { result, rerender } = renderHook(() => harness("A", h));
    await waitFor(() => expect(result.current.hydrated).toBe(true));
    act(() => { h.bump(); rerender(); });
    act(() => { result.current.markSaving(); });
    expect(result.current.status).toBe("saving");
    await act(async () => { await result.current.markSaved(); });
    rerender();
    expect(result.current.status).toBe("saved");
  });

  it("markFailed surfaces the reason", async () => {
    const h = makeHolder();
    const { result } = renderHook(() => harness("A", h));
    await waitFor(() => expect(result.current.hydrated).toBe(true));
    act(() => { result.current.markFailed("disk permission denied"); });
    expect(result.current.status).toBe("failed");
    expect(result.current.failedReason).toBe("disk permission denied");
  });
});
```

- [ ] **Step 2: Run it — expect FAIL**

Run: `npx vitest run src/test/session/useEditorSession.test.tsx`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement the coordinator**

Create `src/atlas/session/useEditorSession.ts`:

```ts
/**
 * The single editor-session coordinator.
 *
 * Owns per-map slices for every draft holder, persists ONE versioned blob to
 * IndexedDB on a debounce, rehydrates on mount (raising a one-shot restore
 * notice when the snapshot represents real work), drives non-destructive
 * map switching by snapshotting the outgoing map and applying the incoming
 * map's slice, and derives the single save status + honest unsaved count.
 *
 * Holders keep their existing public APIs; this hook only uses each holder's
 * snapshot()/applySnapshot() seam plus a perMapDirtyCount() probe.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { UndoStackAPI } from "@/atlas/useUndoStack";
import { idbGet, idbSet, idbDelete } from "./idbStore";
import {
  serializeSession, deserializeSession, sessionHasWork,
  type SessionState,
} from "./sessionSnapshot";

export const SESSION_IDB_KEY = "editor-session-v1";
const PERSIST_DEBOUNCE_MS = 300;

export type SaveLifecycle = "clean" | "unsaved" | "saving" | "saved" | "failed";

type Holder<T> = { snapshot: () => T; applySnapshot: (s: T) => void };

export interface EditorSessionArgs {
  activeMapId: string | null;
  undoStack: Pick<UndoStackAPI, "clear">;
  holders: {
    overrides: { get: () => SessionState["overrides"]; set: (o: SessionState["overrides"]) => void };
    mapOverride: { get: () => Record<string, unknown>; set: (m: Record<string, unknown>) => void };
    region: Holder<unknown>;
    route: Holder<unknown>;
    fog: Holder<unknown>;
    layer: Holder<unknown>;
  };
  /** Sum of every holder's change count for the active map (honest, undo-aware). */
  perMapDirtyCount: () => number;
}

export interface EditorSessionAPI {
  hydrated: boolean;
  status: SaveLifecycle;
  unsavedCount: number;
  failedReason: string | null;
  /** Non-null exactly once after a reload that recovered real work. */
  restoredNotice: { savedAt: number } | null;
  dismissRestoredNotice: () => void;
  /** Call when activeMapId is about to change (before React swaps it). */
  onMapWillChange: (nextMapId: string | null) => void;
  markSaving: () => void;
  markSaved: () => Promise<void>;
  markFailed: (reason: string) => void;
  discardAll: () => Promise<void>;
}

export function useEditorSession(args: EditorSessionArgs): EditorSessionAPI {
  const { activeMapId, undoStack, holders, perMapDirtyCount } = args;

  // Per-map slices live in a ref (synchronous, not render state).
  const slicesRef = useRef<SessionState>({
    overrides: {}, mapOverrideByMap: {}, regionByMap: {},
    routeByMap: {}, fogByMap: {}, layerByMap: {}, savedAt: Date.now(),
  });
  const [hydrated, setHydrated] = useState(false);
  const [status, setStatus] = useState<SaveLifecycle>("clean");
  const [failedReason, setFailedReason] = useState<string | null>(null);
  const [restoredNotice, setRestoredNotice] = useState<{ savedAt: number } | null>(null);
  const mapRef = useRef(activeMapId);

  // ---- collect / apply the active map's holder slices ----
  const collectActiveInto = useCallback((s: SessionState, mapId: string | null) => {
    s.overrides = holders.overrides.get();
    if (!mapId) return;
    s.regionByMap[mapId] = holders.region.snapshot() as never;
    s.routeByMap[mapId] = holders.route.snapshot() as never;
    s.fogByMap[mapId] = holders.fog.snapshot() as never;
    s.layerByMap[mapId] = holders.layer.snapshot() as never;
    const mo = holders.mapOverride.get();
    s.mapOverrideByMap = mo as never;
  }, [holders]);

  const applyActiveFrom = useCallback((s: SessionState, mapId: string | null) => {
    holders.overrides.set(s.overrides);
    holders.mapOverride.set(s.mapOverrideByMap as never);
    if (!mapId) return;
    holders.region.applySnapshot((s.regionByMap[mapId] ?? { edits: {}, added: [], deleted: [] }) as never);
    holders.route.applySnapshot((s.routeByMap[mapId] ?? { edits: {}, added: [], deleted: [] }) as never);
    holders.fog.applySnapshot((s.fogByMap[mapId] ?? null) as never);
    holders.layer.applySnapshot((s.layerByMap[mapId] ?? []) as never);
  }, [holders]);

  // ---- mount hydrate + restore detection ----
  useEffect(() => {
    let alive = true;
    (async () => {
      const blob = await idbGet<unknown>(SESSION_IDB_KEY);
      if (!alive) return;
      const restored = blob ? deserializeSession(blob) : null;
      if (restored && sessionHasWork(restored)) {
        slicesRef.current = restored;
        applyActiveFrom(restored, mapRef.current);
        setRestoredNotice({ savedAt: restored.savedAt });
      }
      setHydrated(true);
    })();
    return () => { alive = false; };
    // mount-only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- non-destructive map switch ----
  const onMapWillChange = useCallback((nextMapId: string | null) => {
    const cur = mapRef.current;
    collectActiveInto(slicesRef.current, cur);          // save outgoing
    mapRef.current = nextMapId;
    applyActiveFrom(slicesRef.current, nextMapId);       // restore incoming
  }, [collectActiveInto, applyActiveFrom]);

  useEffect(() => {
    if (activeMapId !== mapRef.current) onMapWillChange(activeMapId);
  }, [activeMapId, onMapWillChange]);

  // ---- derived count + status (recomputed each render) ----
  const unsavedCount = perMapDirtyCount();
  useEffect(() => {
    if (!hydrated) return;
    setStatus((prev) => {
      if (prev === "saving" || prev === "failed") return prev;
      if (prev === "saved" && unsavedCount === 0) return prev; // hold "saved" until next edit
      return unsavedCount > 0 ? "unsaved" : "clean";
    });
  }, [unsavedCount, hydrated]);

  // ---- debounced persist ----
  useEffect(() => {
    if (!hydrated) return;
    const t = window.setTimeout(() => {
      const s = slicesRef.current;
      collectActiveInto(s, mapRef.current);
      s.savedAt = Date.now();
      if (sessionHasWork(s)) void idbSet(SESSION_IDB_KEY, serializeSession(s));
      else void idbDelete(SESSION_IDB_KEY);
    }, PERSIST_DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [unsavedCount, hydrated, collectActiveInto]);

  const dismissRestoredNotice = useCallback(() => setRestoredNotice(null), []);
  const markSaving = useCallback(() => { setFailedReason(null); setStatus("saving"); }, []);
  const markFailed = useCallback((reason: string) => { setFailedReason(reason); setStatus("failed"); }, []);
  const markSaved = useCallback(async () => {
    slicesRef.current = {
      overrides: {}, mapOverrideByMap: {}, regionByMap: {},
      routeByMap: {}, fogByMap: {}, layerByMap: {}, savedAt: Date.now(),
    };
    await idbDelete(SESSION_IDB_KEY);
    setRestoredNotice(null);
    setStatus("saved");
  }, []);
  const discardAll = useCallback(async () => {
    applyActiveFrom({
      overrides: {}, mapOverrideByMap: {}, regionByMap: {},
      routeByMap: {}, fogByMap: {}, layerByMap: {}, savedAt: Date.now(),
    }, mapRef.current);
    slicesRef.current = {
      overrides: {}, mapOverrideByMap: {}, regionByMap: {},
      routeByMap: {}, fogByMap: {}, layerByMap: {}, savedAt: Date.now(),
    };
    undoStack.clear();
    await idbDelete(SESSION_IDB_KEY);
    setRestoredNotice(null);
    setStatus("clean");
  }, [applyActiveFrom, undoStack]);

  return {
    hydrated, status, unsavedCount, failedReason,
    restoredNotice, dismissRestoredNotice,
    onMapWillChange, markSaving, markSaved, markFailed, discardAll,
  };
}
```

- [ ] **Step 4: Run the test — expect PASS**

Run: `npx vitest run src/test/session/useEditorSession.test.tsx`
Expected: PASS (6 tests). If the debounced-persist test flakes on timers, ensure `vi.useFakeTimers()` is set before the first render in that test only and restored after.

- [ ] **Step 5: Typecheck + commit**

Run: `npx tsc --noEmit`
Expected: PASS.

```bash
git add src/atlas/session/useEditorSession.ts src/test/session/useEditorSession.test.tsx
git commit -m "feat: useEditorSession coordinator — per-map persistence + restore + status (Part 2)"
```

### Task 9: Wire the coordinator into the editor (non-destructive switch, restore notice, no beforeunload)

This task connects `useEditorSession` to `AtlasPlacementEditor` at the existing seams and removes the destructive map-switch confirm + `beforeunload`. The single status surface itself is Phase 3 — here the coordinator runs and the no-loss behavior goes live.

**Files:**
- Modify: `src/pages/AtlasPlacementEditor.tsx`

- [ ] **Step 1: Read the current map-switch and beforeunload code**

Run: `grep -nE "window.confirm|beforeunload|switching will discard|setActiveMapId" src/pages/AtlasPlacementEditor.tsx`
Note the line numbers for the map-switch `window.confirm` block (~944-952) and the `beforeunload` effect (~830-838).

- [ ] **Step 2: Add the coordinator wiring after the draft hooks**

In `src/pages/AtlasPlacementEditor.tsx`, immediately after the `fogDraft` / `layerEditor` / `undoStack` are all defined (after line ~324), add:

```ts
import { useEditorSession } from "@/atlas/session/useEditorSession";
```

(with the other imports, near line 65) and, after `const [showFogPreview, setShowFogPreview] = useState(true);` (line ~325):

```ts
  const session = useEditorSession({
    activeMapId: activeMap?.id ?? null,
    undoStack,
    holders: {
      overrides: { get: () => overridesRef.current, set: (o) => { overridesRef.current = o as Overrides; setOverrides(o as Overrides); } },
      mapOverride: { get: () => mapOverrideRef.current, set: (m) => { mapOverrideRef.current = m as Record<string, Partial<MapDocument>>; setMapOverride(m as Record<string, Partial<MapDocument>>); } },
      region: { snapshot: regionDraft.snapshot, applySnapshot: regionDraft.applySnapshot },
      route: { snapshot: routeDraft.snapshot, applySnapshot: routeDraft.applySnapshot },
      fog: { snapshot: fogDraft.snapshot, applySnapshot: fogDraft.applySnapshot },
      layer: { snapshot: layerEditor.snapshot, applySnapshot: layerEditor.applySnapshot },
    },
    perMapDirtyCount: () =>
      regionDraft.dirtyCount +
      routeDraft.dirtyCount +
      (fogDraft.dirty ? 1 : 0) +
      layerEditor.localLayers.length +
      (mapMetadataDirty ? 1 : 0) +
      dirtyCount,
  });
```

Note: `overridesRef`, `mapOverrideRef`, `setOverrides`, `setMapOverride`, `mapMetadataDirty`, and `dirtyCount` already exist (lines 330-333, 572, 735). `mapMetadataDirty` is defined at line ~572 — ensure this `useEditorSession` call is placed *after* line ~579 (after `worldYamlDirty`) so `mapMetadataDirty` and `dirtyCount` are in scope; if hoisting is awkward, move the `const session = ...` block to just after the `hasUnsavedChanges` derivation (line ~746). Place it wherever both `mapMetadataDirty` and `dirtyCount` are already declared above it.

- [ ] **Step 3: Make map switch non-destructive — delete the confirm + reset**

Find the map-switch handler (the `window.confirm("You have unsaved changes on this map...")` block, ~944-952, plus the `regionDraft.reset(); routeDraft.reset(); fogDraft.reset();` calls it guards, ~950-952). Replace the entire confirm-gated reset with a plain map change — the coordinator's `activeMapId` effect already snapshots the outgoing map and restores the incoming one:

```ts
// Map switch is non-destructive: useEditorSession snapshots the outgoing
// map's drafts and restores the incoming map's drafts. No confirm, no reset.
setActiveMapId(nextMapId);
```

(Use the actual setter name found in Step 1 — likely `setActiveMapId`. Do not call `regionDraft.reset()` / `routeDraft.reset()` / `fogDraft.reset()` on map switch anywhere.)

- [ ] **Step 4: Remove the `beforeunload` guard**

Delete the entire `useEffect` that adds the `beforeunload` listener (~830-838). Work is durably persisted and restored; the prompt only lies.

- [ ] **Step 5: Render the restore notice**

Find where top-of-editor banners render (near the unsaved banner, ~905). Add, above other banners:

```tsx
{session.restoredNotice && (
  <div className="flex items-center justify-between gap-3 rounded-md border border-primary/30 bg-primary/10 px-3 py-2 text-sm">
    <span>Restored your unsaved work from {new Date(session.restoredNotice.savedAt).toLocaleString()}.</span>
    <button
      type="button"
      className="text-xs underline opacity-80 hover:opacity-100"
      onClick={session.dismissRestoredNotice}
    >
      Dismiss
    </button>
  </div>
)}
```

- [ ] **Step 6: Typecheck + full test sweep**

Run: `npx tsc --noEmit && npx vitest run`
Expected: PASS, including all `src/test/session/*` and `no-loss-invariant`.

- [ ] **Step 7: Browser smoke (manual, desktop)**

Run: `npm run dev`. In `/atlas/edit`: draw a region on map A → switch to map B (no confirm appears) → switch back to A (region still there) → reload the page (region still there + "Restored your unsaved work from …" notice) → dismiss notice.

- [ ] **Step 8: Commit**

```bash
git add src/pages/AtlasPlacementEditor.tsx
git commit -m "feat: non-destructive map switch + reload restore via useEditorSession (Part 2)"
```

### Task 10: Phase 2 gate

- [ ] **Step 1: Full gate**

Run: `npx tsc --noEmit && npx vitest run && npm run lint && npm run atlas:publish`
Expected: all PASS / clean, with `no-loss-invariant.test.ts` green. The editor stays tree-shaken out of the player build (`__INCLUDE_EDITOR__`), so the publish scans must remain clean.

- [ ] **Step 2: Commit any gate fixes**

```bash
git add -A && git commit -m "chore: Phase 2 gate green — durable session + no-loss invariant"
```

**Phase 2 is independently shippable here** (work survives reload + map switch; old status surfaces still present but harmless).

---

## PHASE 3 — One status surface

### Task 11: `SaveStatus` component

**Files:**
- Create: `src/atlas/session/SaveStatus.tsx`
- Test: `src/test/session/SaveStatus.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/test/session/SaveStatus.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SaveStatus } from "@/atlas/session/SaveStatus";

const base = {
  onSave: vi.fn(), onDiscard: vi.fn(),
  savedAt: null as number | null, failedReason: null as string | null,
};

describe("SaveStatus", () => {
  it("clean → 'All changes saved', no Discard", () => {
    render(<SaveStatus status="clean" unsavedCount={0} {...base} />);
    expect(screen.getByText("All changes saved")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /discard/i })).not.toBeInTheDocument();
  });

  it("unsaved → count text (pluralized) + Save + Discard", () => {
    render(<SaveStatus status="unsaved" unsavedCount={366} {...base} />);
    expect(screen.getByText("366 unsaved changes")).toBeInTheDocument();
    render(<SaveStatus status="unsaved" unsavedCount={1} {...base} />);
    expect(screen.getByText("1 unsaved change")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /discard/i }).length).toBeGreaterThan(0);
  });

  it("saving → 'Saving…' and Save disabled", () => {
    render(<SaveStatus status="saving" unsavedCount={3} {...base} />);
    expect(screen.getByText("Saving…")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^save$/i })).toBeDisabled();
  });

  it("saved → 'Saved just now'", () => {
    render(<SaveStatus status="saved" unsavedCount={0} {...base} savedAt={Date.now()} />);
    expect(screen.getByText(/Saved just now/)).toBeInTheDocument();
  });

  it("failed → reason + Retry calls onSave", () => {
    const onSave = vi.fn();
    render(<SaveStatus status="failed" unsavedCount={2} {...base} onSave={onSave} failedReason="disk permission denied" />);
    expect(screen.getByText(/Save failed — disk permission denied/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(onSave).toHaveBeenCalled();
  });

  it("Save click calls onSave; Discard click calls onDiscard", () => {
    const onSave = vi.fn(); const onDiscard = vi.fn();
    render(<SaveStatus status="unsaved" unsavedCount={5} {...base} onSave={onSave} onDiscard={onDiscard} />);
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));
    fireEvent.click(screen.getByRole("button", { name: /discard/i }));
    expect(onSave).toHaveBeenCalled();
    expect(onDiscard).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it — expect FAIL**

Run: `npx vitest run src/test/session/SaveStatus.test.tsx`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement**

Create `src/atlas/session/SaveStatus.tsx`:

```tsx
/**
 * The single editor save-status surface. Replaces SaveStatusChip,
 * DraftStatusBadge, the unsaved banner, and the 5-minute nudge toast.
 *
 * State is derived entirely from useEditorSession — this component renders,
 * it does not classify. DM-facing words only: "changes", "saved",
 * "save failed". Never "FileChange", "YAML", "patch", "canon".
 */
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { SaveLifecycle } from "./useEditorSession";

interface Props {
  status: SaveLifecycle;
  unsavedCount: number;
  savedAt: number | null;
  failedReason: string | null;
  onSave: () => void;
  onDiscard: () => void;
}

function savedAgo(ts: number, now: number): string {
  const d = now - ts;
  if (d < 5_000) return "Saved just now";
  if (d < 60_000) return `Saved ${Math.floor(d / 1000)}s ago`;
  if (d < 3_600_000) return `Saved ${Math.floor(d / 60_000)} min ago`;
  return `Saved ${Math.floor(d / 3_600_000)}h ago`;
}

export function SaveStatus({ status, unsavedCount, savedAt, failedReason, onSave, onDiscard }: Props) {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (status !== "saved") return;
    const id = window.setInterval(() => setTick((n) => n + 1), 15_000);
    return () => window.clearInterval(id);
  }, [status]);

  const countText = `${unsavedCount} unsaved ${unsavedCount === 1 ? "change" : "changes"}`;

  let label: string;
  if (status === "clean") label = "All changes saved";
  else if (status === "saving") label = "Saving…";
  else if (status === "saved") label = savedAt ? savedAgo(savedAt, Date.now()) : "Saved";
  else if (status === "failed") label = `Save failed — ${failedReason ?? "unknown error"}`;
  else label = countText;

  const dot =
    status === "saving" ? <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" aria-hidden />
    : <span className={`inline-block h-2 w-2 rounded-full ${
        status === "failed" ? "bg-red-500"
        : status === "unsaved" ? "bg-amber-500"
        : status === "saved" ? "bg-emerald-500"
        : "bg-muted-foreground/50"
      }`} aria-hidden />;

  const showSave = status === "unsaved" || status === "saving" || status === "failed";
  const showDiscard = status === "unsaved" || status === "failed";

  return (
    <div className="flex items-center gap-3" role="status" aria-live="polite">
      <span className="flex items-center gap-1.5 text-sm">
        {dot}
        <span className={status === "failed" ? "text-red-400" : ""}>{label}</span>
      </span>
      {showSave && (
        <Button size="sm" onClick={onSave} disabled={status === "saving"}>
          {status === "failed" ? "Retry" : "Save"}
        </Button>
      )}
      {showDiscard && (
        <button
          type="button"
          onClick={onDiscard}
          className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
        >
          Discard unsaved changes
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run the test — expect PASS**

Run: `npx vitest run src/test/session/SaveStatus.test.tsx`
Expected: PASS (6 tests). The Retry button's accessible name is "Retry"; the test queries `/retry/i`. The Save button's name is exactly "Save" (`/^save$/i`) so it does not also match "Discard unsaved changes".

- [ ] **Step 5: Commit**

```bash
git add src/atlas/session/SaveStatus.tsx src/test/session/SaveStatus.test.tsx
git commit -m "feat: single SaveStatus surface component (Part 2)"
```

### Task 12: Discard confirm modal

**Files:**
- Create: `src/atlas/session/DiscardConfirmModal.tsx`
- Test: covered via `SaveStatus` integration in Task 13; add a focused test here.
- Test: `src/test/session/DiscardConfirmModal.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/test/session/DiscardConfirmModal.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DiscardConfirmModal } from "@/atlas/session/DiscardConfirmModal";

describe("DiscardConfirmModal", () => {
  it("shows the count and is dismissable without discarding", () => {
    const onConfirm = vi.fn(); const onClose = vi.fn();
    render(<DiscardConfirmModal open count={12} onConfirm={onConfirm} onClose={onClose} />);
    expect(screen.getByText(/Discard all 12 unsaved changes\?/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /keep editing/i }));
    expect(onClose).toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("confirms on the destructive action", () => {
    const onConfirm = vi.fn(); const onClose = vi.fn();
    render(<DiscardConfirmModal open count={3} onConfirm={onConfirm} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: /discard changes/i }));
    expect(onConfirm).toHaveBeenCalled();
  });

  it("renders nothing when closed", () => {
    const { container } = render(<DiscardConfirmModal open={false} count={3} onConfirm={vi.fn()} onClose={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });
});
```

- [ ] **Step 2: Run it — expect FAIL**

Run: `npx vitest run src/test/session/DiscardConfirmModal.test.tsx`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement**

Create `src/atlas/session/DiscardConfirmModal.tsx`:

```tsx
/**
 * The one forgiving confirm in the editor. Default focus is the safe action
 * ("Keep editing"). Confirming reverts to the last saved state.
 */
import { Button } from "@/components/ui/button";

interface Props {
  open: boolean;
  count: number;
  onConfirm: () => void;
  onClose: () => void;
}

export function DiscardConfirmModal({ open, count, onConfirm, onClose }: Props) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50" role="dialog" aria-modal="true">
      <div className="w-[min(92vw,420px)] rounded-lg border border-border bg-card p-5 shadow-xl">
        <h2 className="text-base font-semibold">Discard all {count} unsaved {count === 1 ? "change" : "changes"}?</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          This reverts everything back to your last saved state. This can&rsquo;t be undone.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button size="sm" autoFocus onClick={onClose}>Keep editing</Button>
          <Button size="sm" variant="destructive" onClick={() => { onConfirm(); onClose(); }}>
            Discard changes
          </Button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run the test — expect PASS**

Run: `npx vitest run src/test/session/DiscardConfirmModal.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/atlas/session/DiscardConfirmModal.tsx src/test/session/DiscardConfirmModal.test.tsx
git commit -m "feat: forgiving Discard confirm modal (Part 2)"
```

### Task 13: Replace the four surfaces in the editor; remove the nudge and `tabExportAt`

**Files:**
- Modify: `src/pages/AtlasPlacementEditor.tsx`

- [ ] **Step 1: Locate the surfaces to remove**

Run: `grep -nE "SaveStatusChip|dirtyFileSummary|NUDGE_DELAY_MS|toast.message\\(\"You have unsaved|tabExportAt|markTabExport|hasUnsavedChanges|unsaved banner|Save now" src/pages/AtlasPlacementEditor.tsx`
Record line numbers for: the `SaveStatusChip` render (~970), the unsaved banner (~905), the 5-minute nudge effect (~748-779), `tabExportAt`/`markTabExport` (565-566 + usages), and the main Save button.

- [ ] **Step 2: Render `SaveStatus` + wire Save/Discard**

Add imports near line 65:

```ts
import { SaveStatus } from "@/atlas/session/SaveStatus";
import { DiscardConfirmModal } from "@/atlas/session/DiscardConfirmModal";
```

Add discard-modal state near the other `useState`s (e.g. by `saveModalOpen`, ~555):

```ts
const [discardOpen, setDiscardOpen] = useState(false);
```

Replace the `<SaveStatusChip .../>` element (~970) with:

```tsx
<SaveStatus
  status={session.status}
  unsavedCount={session.unsavedCount}
  savedAt={lastSavedAt}
  failedReason={session.failedReason}
  onSave={onSaveClick}
  onDiscard={() => setDiscardOpen(true)}
/>
```

Add the modal once near the other modals (e.g. by `DiffPreviewModal`):

```tsx
<DiscardConfirmModal
  open={discardOpen}
  count={session.unsavedCount}
  onConfirm={() => { void session.discardAll(); }}
  onClose={() => setDiscardOpen(false)}
/>
```

- [ ] **Step 3: Delete the unsaved banner and the 5-minute nudge**

- Delete the unsaved-changes banner JSX (~905, the amber bar with "Save now" / `dirtyFileSummary`).
- Delete the entire 5-minute nudge `useEffect` (`NUDGE_DELAY_MS` … `}, [hasUnsavedChanges, lastLocalEditAt]);`, ~748-779).
- Remove the now-unused `SaveStatusChip` / `dirtyFileSummary` import (line 27). If `dirtyFileSummary` has no other consumer, also delete its export from `src/atlas/SaveStatusChip.tsx` and delete that file (`git grep dirtyFileSummary` to confirm zero remaining consumers, then `git rm src/atlas/SaveStatusChip.tsx`).

- [ ] **Step 4: Wire save lifecycle into the session status**

In `onSaveClick`, immediately before `setPendingChanges(fileChanges); setSaveModalOpen(true);` add:

```ts
session.markSaving();
```

In the post-save success path (the `onSaved` callback passed to `DiffPreviewModal`, ~1372-1462), after the existing cleanup that clears drafts/overrides, add:

```ts
void session.markSaved();
setLastSavedAt(Date.now());
```

In the save-failure path (the `catch` in `onSaveClick` and any error callback from `DiffPreviewModal`), add:

```ts
session.markFailed(msg);
```

(`msg` is the human-readable message already computed in the existing `catch`.)

- [ ] **Step 5: Remove `tabExportAt` / `markTabExport` vestige**

Delete lines 565-566 (`const [tabExportAt, setTabExportAt] = ...` and `const markTabExport = ...`). Run `grep -n "tabExportAt\|markTabExport" src/pages/AtlasPlacementEditor.tsx` and remove every remaining usage (per-tab "exported" status props passed into tab headers). If a tab component prop becomes unused as a result, drop the prop from that component too (follow the type errors).

- [ ] **Step 6: Remove now-dead `hasUnsavedChanges` / nudge-only state**

`hasUnsavedChanges`, `pinSideUnsaved`, `lastLocalEditAt`, and the `overridesMountedRef` edit-stamp effect (258-271) existed only to feed the banner + nudge. Remove any that have no remaining consumer (let `tsc` guide you — delete declarations whose only readers were the deleted banner/nudge). Keep `lastSavedAt` (now set in Step 4).

- [ ] **Step 7: Typecheck + full test sweep**

Run: `npx tsc --noEmit && npx vitest run`
Expected: PASS, all `src/test/session/*` green including `no-loss-invariant`.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: one SaveStatus surface replaces chip/badge/banner/nudge; remove tabExportAt (Part 2)"
```

### Task 14: Phase 3 gate + full Part 2 verification

- [ ] **Step 1: Full gate**

Run: `npx tsc --noEmit && npx vitest run && npm run lint && npm run atlas:publish`
Expected: all PASS / clean.

- [ ] **Step 2: Surface-count proof**

Run: `git grep -nE "SaveStatusChip|DraftStatusBadge|NUDGE_DELAY_MS|classifyDraftStatus|lastExportAt|beforeunload|tabExportAt" -- src ':!src/atlas/session/*' ':!docs'`
Expected: **no output**. Exactly one status surface (`SaveStatus`) and one confirm (`DiscardConfirmModal`) remain.

- [ ] **Step 3: Browser smoke (manual, desktop) — the full no-loss + status walk**

Run: `npm run dev`. In `/atlas/edit`:
1. Edit each tab kind (move a pin; change a map setting; draw a region; draw a route; toggle fog + draw a reveal; upload a layer). Status shows `"N unsaved changes"` and the number rises.
2. Undo a few times — the count decreases; undo back to zero shows "All changes saved".
3. Re-do the edits. Switch map A→B→A — no confirm, work intact both ways.
4. Reload — work intact + "Restored your unsaved work from …" notice; dismiss it.
5. Click Save — status → "Saving…" → "Saved just now"; the count clears; wait and it ages ("Saved 1 min ago") then settles to "All changes saved".
6. Make one edit, click "Discard unsaved changes" — the one forgiving modal appears, default focus "Keep editing"; confirm "Discard changes" → returns to "All changes saved", edit reverted.
7. Simulate a save failure (stop the dev save endpoint or trigger a baseHash conflict) → status shows "Save failed — <reason>" with Retry.

- [ ] **Step 4: Commit any smoke fixes + final**

```bash
git add -A
git commit -m "chore: Part 2 complete — no lost work + one honest status surface"
```

**Part 2 is complete and independently shippable here.**

---

## Self-Review (filled in at authoring time)

**Spec coverage:**
- §A.1 session store → Task 8 (`useEditorSession`, per-map slices, derived dirty/count).
- §A.3 one IndexedDB snapshot, one write/read path, versioned, migration → Task 5 (idb), Task 6 (versioned envelope + safe downgrade), Task 8 (debounced persist/hydrate). **Legacy localStorage→IDB migration**: the spec calls for seeding from `atlas-placement-overrides-v3` / `atlas-local-map-layers-v1`. Existing hooks already hydrate those localStorage keys on mount, so the first session snapshot naturally captures their content, then Save/Discard clears them as before; no separate migration code needed. This is noted here intentionally so the executor does **not** add migration code — the seam already covers it.
- §A.4 restore on reload + one-shot notice → Task 8 (`restoredNotice` via `sessionHasWork`), Task 9 (render).
- §A.5 undo unchanged, reset on reload, save-boundary entry preserved → unchanged by design; Task 8 only calls `undoStack.clear()` on discard; Task 9/13 do not touch the existing undo wiring or the Part-1 save-boundary entry.
- §B single surface, states, copy, count semantics, plural → Task 11; nudge/banner/chip/badge removal → Task 13.
- §B.3 count honest (undo decrements; clean when working==baseline) → `perMapDirtyCount` sums holder change counts which are themselves derived from draft-vs-canon and shrink on undo; coordinator forces "clean" at count 0. Covered by Task 8 tests + Task 14 smoke step 2.
- §C remove map-switch/beforeunload confirms → Task 9; one forgiving Discard → Task 12 + Task 13.
- §D vestige deletion + dead-hint fix → Tasks 1-3.
- §E.1 no-loss invariant gate → Task 7 (and re-run in every later gate).
- §E.2/E.3 unit + regression → Tasks 5,6,8,11,12; vestige test updates Tasks 1,3.
- §E.4 full gate → Tasks 4,10,14.

**Placeholder scan:** No "TBD"/"add error handling"/"similar to Task N". Edits to the 1479-line `AtlasPlacementEditor.tsx` are specified as "locate by this exact grep/anchor, replace with this complete code"; the executor must read the file (Step 1 of Tasks 9 and 13 forces this) — this is precise, not vague.

**Type consistency:** `SessionState` (Task 6) is the single source consumed by Task 7/8. `SaveLifecycle` defined in Task 8, imported by Task 11. `SESSION_IDB_KEY` exported from Task 8, used in Task 8's test. Holder `snapshot`/`applySnapshot` names match the real hook APIs verified in source. `perMapDirtyCount` uses `regionDraft.dirtyCount` / `routeDraft.dirtyCount` / `fogDraft.dirty` / `layerEditor.localLayers` / `mapMetadataDirty` / `dirtyCount` — all confirmed present in `AtlasPlacementEditor.tsx`.

## Risks

- **`AtlasPlacementEditor.tsx` is 1479 lines.** Tasks 9 and 13 require reading it before editing (forced by their Step 1). If anchors have drifted, locate by the quoted code, not the line number.
- **Timer-based persist test** can flake; the plan isolates `vi.useFakeTimers()` to the one test that needs it and restores real timers in `beforeEach`.
- **`perMapDirtyCount` placement**: must be declared after `mapMetadataDirty` (line ~572) and `dirtyCount` (line ~735) — Task 9 Step 2 calls this out explicitly.
- **Escalation:** if any gate's `no-loss-invariant.test.ts` regresses twice in the same holder, that is the CLAUDE.md "verification failed twice" signal — escalate back to Opus for that holder's snapshot design before proceeding.
