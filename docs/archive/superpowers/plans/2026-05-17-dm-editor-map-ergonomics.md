# DM Editor — Map Interaction & Lens (Workstream D) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the base map image stop stealing pin-placement clicks (lock it behind an explicit "Adjust map image" mode), make "select entity → click map = pin lands there" reliable, and make the editor's Player-view map honour the lens via one shared, parity-ready projection (the twin of `projectEntityForPlayer`).

**Architecture:** `MapLayerEditableOverlay` currently hard-codes `interactive={true}`, so the base image always absorbs map clicks (the placement pain + the reason for the Part-1 `onBackgroundClick` hack). Gate interactivity on `editMode` so the image is click-transparent when "Adjust map image" is off; clicks then flow cleanly through the existing `MapClickCapture → onMapClick` path. Add `projectMapForPlayer` — a pure function mirroring `projectEntityForPlayer`'s pattern — that the editor's Player lens renders through now and the deferred published fog mechanic will reuse verbatim.

**Tech Stack:** React, TypeScript, react-leaflet/Leaflet, Vitest, existing modules `MapLayerEditableOverlay`, `MapClickCapture`/`onMapClick`, `projectEntityForPlayer` (pattern reference), `useViewMode`, `filterEntitiesForLens`.

**Spec:** `docs/superpowers/specs/2026-05-17-dm-editor-editing-and-map-ergonomics-design.md` (§4, §7, §8 D-slices).

**Test/verify commands:** as Workstream B (single file `npx vitest run`, `npx tsc --noEmit`, `npm run lint`, slice gate = `npm test -- --run` + lint + `npm run atlas:publish` + **browser smoke** via the managed preview).

**Pre-existing known-failing tests (ignore):** `src/test/session/idbStore.test.ts`, `src/test/session/useEditorSession.test.tsx`.

**Depends on:** none code-wise, but D-2 depends on D-1 (D-1 removes the click interception D-2 needs). Independent of Workstream B.

---

## File Structure

- `src/atlas/MapLayerEditableOverlay.tsx` — modify: `interactive={editMode}`; the overlay click handler only selects when `editMode` (no more always-on `onBackgroundClick` consumption).
- `src/atlas/MapLayerPanel.tsx` — modify: relabel the existing `editGeometry` toggle to "Adjust map image" (clear, discoverable).
- `src/atlas/editor/mapClickCoord.ts` — create: pure `mapClickToAtlasCoord(lng, lat, mapHeight)`.
- `src/pages/AtlasPlacementEditor.tsx` — modify: use `mapClickToAtlasCoord` in `onMapClick`; feed the marker list through `projectMapForPlayer` when the lens is Player.
- `src/atlas/content/projectMapForPlayer.ts` — create: pure shared projection (placements/regions/routes/fog) + fogged-location pin omission.
- Tests: `src/test/atlas/MapLayerEditableOverlay.test.tsx`, `src/test/editor/mapClickCoord.test.ts`, `src/test/content/projectMapForPlayer.test.ts`.

---

# SLICE D-1 — Map-image lock ("Adjust map image" mode)

### Task D1.1: Base image is click-transparent unless "Adjust map image" is on

**Files:**
- Modify: `src/atlas/MapLayerEditableOverlay.tsx` (the `<ImageOverlay>`, lines 192–212)
- Test: `src/test/atlas/MapLayerEditableOverlay.test.tsx`

The `<ImageOverlay>` hard-codes `interactive={true}` (line 199) and its `click` handler consumes/forwarded clicks via `onBackgroundClick`. Gate interactivity on `editMode`: when off (default), `interactive={false}` so map clicks pass straight through to Leaflet (`MapClickCapture → onMapClick`); the layer can only be selected/dragged in edit mode. This makes the `onBackgroundClick` forwarding obsolete (placement no longer needs it).

- [ ] **Step 1: Write the failing test**

`MapLayerEditableOverlay` needs a Leaflet map context. Test the interactivity decision through a thin pure helper so no full Leaflet mount is required, and assert the component uses it.

```tsx
// src/test/atlas/MapLayerEditableOverlay.test.tsx
import { describe, it, expect } from "vitest";
import { overlayInteractive } from "@/atlas/MapLayerEditableOverlay";

describe("MapLayerEditableOverlay interactivity", () => {
  it("base image is NON-interactive when not in edit-geometry mode (clicks pass through to place pins)", () => {
    expect(overlayInteractive(false)).toBe(false);
  });
  it("base image IS interactive in edit-geometry mode (so it can be selected/resized)", () => {
    expect(overlayInteractive(true)).toBe(true);
  });
});
```

- [ ] **Step 2: Run it (fails)**

Run: `npx vitest run src/test/atlas/MapLayerEditableOverlay.test.tsx`
Expected: FAIL — `overlayInteractive` is not exported.

- [ ] **Step 3: Implement**

In `src/atlas/MapLayerEditableOverlay.tsx`, add an exported pure helper near the top (after imports):

```tsx
/** The base image must be non-interactive unless the DM is explicitly
 *  adjusting the map image — otherwise it absorbs map clicks meant for
 *  pin placement (the long-standing placement pain). */
export function overlayInteractive(editMode: boolean): boolean {
  return editMode;
}
```

Change the `<ImageOverlay>` (line ~199) from `interactive={true}` to `interactive={overlayInteractive(editMode)}`. Replace its `eventHandlers.click` so it only selects in edit mode and never consumes placement clicks:

```tsx
        interactive={overlayInteractive(editMode)}
        eventHandlers={{
          click: (e) => {
            if (!editMode) return;            // locked: clicks fall through to the map
            const me = e as L.LeafletMouseEvent;
            if (onBackgroundClick && onBackgroundClick(me.latlng)) {
              L.DomEvent.stopPropagation(me.originalEvent);
              return;
            }
            onSelect();
          },
        }}
```

(Leave the `onBackgroundClick` prop in the interface for now — harmless and still used by the edit-mode branch; D-2 no longer relies on it.)

- [ ] **Step 4: Run it (passes)**

Run: `npx vitest run src/test/atlas/MapLayerEditableOverlay.test.tsx`
Expected: PASS.

- [ ] **Step 5: Regression**

Run: `npx vitest run src/test -t "layer" 2>&1` and any `src/test/**/*MapLayer*`/`*layer*` suites that exist. Expected: still green (edit-mode behaviour unchanged; only the locked-state interactivity changed).

- [ ] **Step 6: Types + commit**

Run: `npx tsc --noEmit` → clean.

```bash
git add src/atlas/MapLayerEditableOverlay.tsx src/test/atlas/MapLayerEditableOverlay.test.tsx
git commit -m "fix(map): base image non-interactive unless adjusting map image (clicks reach pin placement)"
```

---

### Task D1.2: Relabel the geometry toggle "Adjust map image"

**Files:**
- Modify: `src/atlas/MapLayerPanel.tsx`
- Test: none (string/label change; covered by the D-1 browser smoke)

The existing toggle is wired via `editGeometry`/`setEditGeometry` props into `MapLayerPanel` (`AtlasPlacementEditor.tsx` lines 1417–1418). Make it a clear, discoverable control.

- [ ] **Step 1: Read the panel**

Read `src/atlas/MapLayerPanel.tsx`. Find the control bound to `editGeometry`/`setEditGeometry` (a checkbox/toggle/button, likely labelled "Edit geometry").

- [ ] **Step 2: Relabel**

Change its visible label to **"Adjust map image"** and add a one-line helper caption beneath it: `Off: click the map to place pins. On: drag/resize the map image.` Keep the prop names and wiring unchanged.

- [ ] **Step 3: Types + commit**

Run: `npx tsc --noEmit` → clean. Run `npm run lint` → no new errors.

```bash
git add src/atlas/MapLayerPanel.tsx
git commit -m "feat(map): relabel geometry toggle to 'Adjust map image' with plain-language caption"
```

---

### Task D1.3: Slice D-1 gate

- [ ] **Step 1:** `npx tsc --noEmit` → clean.
- [ ] **Step 2:** `npm test -- --run` → green except the two pre-existing failures.
- [ ] **Step 3:** `npm run lint` → no new errors.
- [ ] **Step 4:** `npm run atlas:publish` → scans clean.
- [ ] **Step 5: Browser smoke.** `/atlas/edit`: with "Adjust map image" OFF, clicking the map does NOT select/move the base image (no selection handles, no drag). Turn it ON → the image is selectable and shows resize handles; drag/resize works; turn OFF → locked again.
- [ ] **Step 6:** `git commit --allow-empty -m "chore(sliceD1): map-image lock gate green"`

---

# SLICE D-2 — Reliable click-to-place

### Task D2.1: Pure map-click → atlas-coord conversion

**Files:**
- Create: `src/atlas/editor/mapClickCoord.ts`
- Modify: `src/pages/AtlasPlacementEditor.tsx` (`onMapClick`, lines 572–585)
- Test: `src/test/editor/mapClickCoord.test.ts`

`onMapClick` converts a Leaflet click to atlas coords inline (`x = Math.round(lng); y = Math.round(activeMap.height - lat)`). Extract it as a pure, tested unit so the placement maths is verified and reused.

- [ ] **Step 1: Write the failing test**

```ts
// src/test/editor/mapClickCoord.test.ts
import { describe, it, expect } from "vitest";
import { mapClickToAtlasCoord } from "@/atlas/editor/mapClickCoord";

describe("mapClickToAtlasCoord", () => {
  it("rounds lng→x and flips lat against map height for y", () => {
    expect(mapClickToAtlasCoord(120.4, 80.6, 1000)).toEqual({ x: 120, y: 919 });
  });
  it("origin click maps to (0, height)", () => {
    expect(mapClickToAtlasCoord(0, 0, 1000)).toEqual({ x: 0, y: 1000 });
  });
});
```

- [ ] **Step 2: Run it (fails)**

Run: `npx vitest run src/test/editor/mapClickCoord.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement + use it**

```ts
// src/atlas/editor/mapClickCoord.ts
/** Leaflet CRS.Simple click (lng,lat) → atlas (x,y). Atlas y is measured
 *  downward from the top; Leaflet lat increases upward, so y = height - lat. */
export function mapClickToAtlasCoord(lng: number, lat: number, mapHeight: number): { x: number; y: number } {
  return { x: Math.round(lng), y: Math.round(mapHeight - lat) };
}
```

In `src/pages/AtlasPlacementEditor.tsx`, add the import and use it inside `onMapClick`:

```tsx
import { mapClickToAtlasCoord } from "@/atlas/editor/mapClickCoord";
// ...
  const onMapClick = (lng: number, lat: number) => {
    if (!pendingId || !activeMap) return;
    const { x, y } = mapClickToAtlasCoord(lng, lat, activeMap.height);
    setCoord(pendingId, { x, y });
    toast.success(`Placed "${project?.entities.find((e) => e.id === pendingId)?.title}" at ${x},${y} on ${activeMap.name}`);
    if (chainPlaceMode) {
      const next = unplaced.find((e) => e.id !== pendingId);
      setPendingId(next?.id ?? null);
      if (!next) toast.info("All entities placed.");
    } else {
      setPendingId(null);
    }
  };
```

- [ ] **Step 4: Run it (passes)**

Run: `npx vitest run src/test/editor/mapClickCoord.test.ts`
Expected: PASS.

- [ ] **Step 5: Types + commit**

Run: `npx tsc --noEmit` → clean.

```bash
git add src/atlas/editor/mapClickCoord.ts src/test/editor/mapClickCoord.test.ts src/pages/AtlasPlacementEditor.tsx
git commit -m "refactor(map): extract tested mapClickToAtlasCoord; use in onMapClick"
```

---

### Task D2.2: Slice D-2 gate (placement works end-to-end)

- [ ] **Step 1:** `npx tsc --noEmit` → clean.
- [ ] **Step 2:** `npm test -- --run` → green except the two pre-existing failures.
- [ ] **Step 3:** `npm run lint` → no new errors.
- [ ] **Step 4:** `npm run atlas:publish` → scans clean.
- [ ] **Step 5: Browser smoke (the core user pain).** `/atlas/edit`, "Adjust map image" OFF: pick an unplaced entity (its "Place" affordance → crosshair banner appears) → click anywhere on the map → the pin lands **exactly at the click**, final, no drag needed. Repeat over different parts of the image (including over the base map image itself — previously the dead zone). Existing pins still drag to nudge; clicking an existing pin still opens it.
- [ ] **Step 6:** `git commit --allow-empty -m "chore(sliceD2): reliable click-to-place gate green"`

---

# SLICE D-3 — Lens-on-map shared projection

### Task D3.1: `projectMapForPlayer` — pure shared projection + contract test

**Files:**
- Create: `src/atlas/content/projectMapForPlayer.ts`
- Test: `src/test/content/projectMapForPlayer.test.ts`

The twin of `projectEntityForPlayer`. Given the active map's placements/regions/routes + the fog overlay + a projection context, return the player-faithful set: drop `dm`/`hidden` placements/regions/routes; for a player-visible entity whose pin sits under fog, omit the pin (the entity stays readable elsewhere); report which placements are fogged so the caller can also render the "undiscovered backdrop". No build oracle exists yet (published fog deferred), so this is a **contract test** to the spec rules; the future published mechanic reuses this exact function.

- [ ] **Step 1: Read the references**

Read `src/atlas/content/projectEntityForPlayer.ts` (pattern + `PLAYER_VISIBLE` set + `buildProjectionContext` shape) and the `MapPlacement`, `Region`, `Route`, `FogOverlay` types in `src/atlas/content/schema.ts` (field names: placement `entityId`/`x`/`y`/`mapId`; region/route `visibility`; fog shape — note how fog encodes covered area).

- [ ] **Step 2: Write the failing test**

```ts
// src/test/content/projectMapForPlayer.test.ts
import { describe, it, expect } from "vitest";
import { projectMapForPlayer } from "@/atlas/content/projectMapForPlayer";
import type { Entity } from "@/atlas/content/schema";

const ent = (id: string, visibility: string): Entity => ({
  id, title: id, type: "npc", visibility, aliases: [], tags: [], images: [],
  body: "", bodyHtml: "", frontmatter: {}, sourcePath: "", links: [], backlinks: [],
} as Entity);

describe("projectMapForPlayer", () => {
  const entitiesById = new Map<string, Entity>([
    ["a", ent("a", "player")],
    ["b", ent("b", "dm")],
    ["c", ent("c", "player")], // player-visible but its pin is fogged
  ]);
  const placements = [
    { entityId: "a", x: 10, y: 10, mapId: "m" },
    { entityId: "b", x: 20, y: 20, mapId: "m" },
    { entityId: "c", x: 90, y: 90, mapId: "m" },
  ] as never[];
  // Fog covers the region around (90,90) only.
  const isFogged = (x: number, y: number) => x >= 80 && y >= 80;

  it("drops dm/hidden placements; keeps player-visible unfogged pins", () => {
    const r = projectMapForPlayer({ placements, regions: [], routes: [], entitiesById, isFogged });
    expect(r.placements.map((p) => p.entityId)).toEqual(["a"]);
  });

  it("omits the pin for a player-visible-but-fogged entity (still reported as fogged)", () => {
    const r = projectMapForPlayer({ placements, regions: [], routes: [], entitiesById, isFogged });
    expect(r.placements.some((p) => p.entityId === "c")).toBe(false);
    expect(r.foggedEntityIds).toContain("c");
  });

  it("drops dm/hidden regions and routes", () => {
    const regions = [{ id: "r1", visibility: "player" }, { id: "r2", visibility: "dm" }] as never[];
    const routes = [{ id: "t1", visibility: "rumor" }, { id: "t2", visibility: "hidden" }] as never[];
    const r = projectMapForPlayer({ placements: [], regions, routes, entitiesById, isFogged });
    expect(r.regions.map((x: { id: string }) => x.id)).toEqual(["r1"]);
    expect(r.routes.map((x: { id: string }) => x.id)).toEqual(["t1"]);
  });
});
```

- [ ] **Step 3: Run it (fails)**

Run: `npx vitest run src/test/content/projectMapForPlayer.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement**

```ts
// src/atlas/content/projectMapForPlayer.ts
/**
 * Pure player-faithful projection of a map's overlays — the twin of
 * projectEntityForPlayer. The DM editor's Player lens renders through this
 * now; the (deferred) published progressive-fog mechanic will reuse this
 * exact function so the two can never diverge.
 */
import type { Entity } from "@/atlas/content/schema";

const PLAYER_VISIBLE = new Set(["player", "rumor"]);

interface Placementish { entityId: string; x: number; y: number; mapId?: string; }
interface Visible { visibility?: string; id?: string; }

export interface MapProjectionInput<P extends Placementish, R extends Visible, T extends Visible> {
  placements: P[];
  regions: R[];
  routes: T[];
  entitiesById: Map<string, Entity>;
  /** True if the atlas point is hidden under fog (caller supplies the test). */
  isFogged: (x: number, y: number) => boolean;
}

export interface MapProjectionResult<P, R, T> {
  placements: P[];
  regions: R[];
  routes: T[];
  /** Player-visible entities whose pin is suppressed because it is fogged. */
  foggedEntityIds: string[];
}

export function projectMapForPlayer<
  P extends Placementish, R extends Visible, T extends Visible,
>(input: MapProjectionInput<P, R, T>): MapProjectionResult<P, R, T> {
  const foggedEntityIds: string[] = [];
  const placements = input.placements.filter((p) => {
    const e = input.entitiesById.get(p.entityId);
    if (!e || !PLAYER_VISIBLE.has(e.visibility)) return false; // dm/hidden/unknown
    if (input.isFogged(p.x, p.y)) { foggedEntityIds.push(p.entityId); return false; }
    return true;
  });
  const regions = input.regions.filter((r) => PLAYER_VISIBLE.has(r.visibility ?? "dm"));
  const routes = input.routes.filter((t) => PLAYER_VISIBLE.has(t.visibility ?? "dm"));
  return { placements, regions, routes, foggedEntityIds };
}
```

- [ ] **Step 5: Run it (passes)**

Run: `npx vitest run src/test/content/projectMapForPlayer.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add src/atlas/content/projectMapForPlayer.ts src/test/content/projectMapForPlayer.test.ts
git commit -m "feat(content): projectMapForPlayer — shared parity-ready map lens projection"
```

---

### Task D3.2: Wire the editor Player lens to the map pins + fog backdrop

**Files:**
- Modify: `src/pages/AtlasPlacementEditor.tsx` (the `placed` marker list ~line 501/1519; fog render)
- Test: covered by `projectMapForPlayer` unit + the D-3 browser smoke (the wiring is a thin adapter; the logic is unit-tested in D3.1)

In Player lens the map must show only what `projectMapForPlayer` returns; fogged player-visible entities have no pin (the bug the owner hit). DM lens unchanged.

- [ ] **Step 1: Read the fog + lens context**

In `src/pages/AtlasPlacementEditor.tsx`: confirm `const { mode } = useViewMode();` is in scope (added in Sub-project B for `displayEntities`). Read how `placed` is derived (~line 501, `filtered.filter(e => effectiveCoord(e.id))`) and how `fogDraft`/`FogLayer` expose the fogged area (`useFogDraft`, `fogDraft.fog`) — find the predicate or polygon describing covered area so you can supply `isFogged(x,y)`.

- [ ] **Step 2: Apply the projection to the marker list**

Where the markers are rendered (`placed.map((e) => …`, ~line 1519), compute the player-faithful set when `mode === "player"`:

```tsx
const placedForLens = useMemo(() => {
  if (mode !== "player") return placed;
  const { placements } = projectMapForPlayer({
    placements: placed.map((e) => {
      const c = effectiveCoord(e.id)!;
      return { entityId: e.id, x: c.x, y: c.y };
    }),
    regions: [],
    routes: [],
    entitiesById,                       // existing memo from Sub-project B
    isFogged: (x, y) => isPointFogged(x, y), // from Step 1's fog predicate
  });
  const keep = new Set(placements.map((p) => p.entityId));
  return placed.filter((e) => keep.has(e.id));
}, [mode, placed, entitiesById, /* fog deps */]);
```

Render `placedForLens.map(...)` instead of `placed.map(...)` for the markers. Add `import { projectMapForPlayer } from "@/atlas/content/projectMapForPlayer";`. If a clean `isPointFogged` predicate is not directly available from `fogDraft`, derive it from the fog overlay geometry read in Step 1 (point-in-polygon / covered-rect test) — do not guess; use the actual fog shape fields.

- [ ] **Step 3: Undiscovered backdrop (Player lens only)**

When `mode === "player"`, render the fogged area as the neutral "undiscovered" backdrop instead of revealing terrain: pass a `playerMode` flag to `FogLayer` so in player mode it paints the fog area opaque with the per-world configured backdrop colour (default: a dark slate `#0b1f2a`), rather than the semi-transparent DM planning preview. Read `src/atlas/FogLayer` (or equivalent) props first; wire the minimal flag. DM lens keeps the existing translucent preview.

- [ ] **Step 4: Types + lint + commit**

Run: `npx tsc --noEmit` → clean. `npm run lint` → no new errors.

```bash
git add src/pages/AtlasPlacementEditor.tsx src/atlas/FogLayer*
git commit -m "feat(map): editor Player lens hides dm/fogged pins + paints undiscovered backdrop"
```

---

### Task D3.3: Slice D-3 gate (Workstream D complete)

- [ ] **Step 1:** `npx tsc --noEmit` → clean.
- [ ] **Step 2:** `npm test -- --run` → green except the two pre-existing failures.
- [ ] **Step 3:** `npm run lint` → no new errors.
- [ ] **Step 4:** `npm run atlas:publish` → secrets + derived scans clean.
- [ ] **Step 5: Browser smoke (spec §4.3, the owner's bug #3).** `/atlas/edit`: set lens to **Player view** → DM/hidden pins are gone and not clickable; a player-visible entity whose pin is under fog has **no pin** on the map; the fogged area shows the neutral "undiscovered" backdrop (not the real terrain). Flip to **DM view** → everything returns, fog shows the translucent planning preview. Opening that fogged player-visible entity from a category list still opens its bio (no fly-to an invisible pin).
- [ ] **Step 6:** `git commit --allow-empty -m "chore(sliceD3): lens-on-map shared projection gate green — Workstream D complete"`

---

## Self-Review

**Spec coverage (§4, §7, §8 D-slices):**
- §4.1 map-image lock (interactive only in edit mode; explicit discoverable toggle) → D1.1 + D1.2. ✓
- §4.2 click-to-place reliable (select → click → final) → unblocked by D1.1; D2.1 hardens + tests the coord maths; D2.2 browser-verifies the end-to-end pain. ✓
- §4.3 shared parity-ready `projectMapForPlayer` (drops dm/hidden placements/regions/routes; player-visible-but-fogged → no pin, still readable elsewhere; undiscovered backdrop) → D3.1 (pure + contract test) + D3.2 (editor wiring + backdrop). ✓
- §7 mandatory browser smoke each gate → D1.3/D2.2/D3.3 Step 5. ✓ No published-build changes (published fog deferred) — `atlas:publish` stays clean each gate. ✓
- §8 order D-1 → D-2 → D-3 (D-2 depends on D-1) → reflected. ✓

**Placeholder scan:** complete code for every code step. Two read-then-apply steps (the `editGeometry` control in `MapLayerPanel`; the fog predicate / `FogLayer` flag) are explicitly bounded — the modules provably exist and are imported; the contract (`isFogged`, the projection result) is fully defined and unit-tested in D3.1, so the wiring adapter has a hard spec, not a TODO.

**Type consistency:** `overlayInteractive(editMode:boolean):boolean` D1.1. `mapClickToAtlasCoord(lng,lat,mapHeight):{x,y}` D2.1 ↔ used in `onMapClick`. `projectMapForPlayer(input):{placements,regions,routes,foggedEntityIds}` defined D3.1, consumed D3.2 with the same shape. `PLAYER_VISIBLE` mirrors `projectEntityForPlayer`'s set (player/rumor) — consistent across the codebase.

**Scope:** Workstream D only; no Workstream B coupling; no published-build/fog-mechanic work (explicitly deferred per spec §2).
