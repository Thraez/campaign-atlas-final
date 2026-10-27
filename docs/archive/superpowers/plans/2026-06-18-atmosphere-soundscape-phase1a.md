# Atmosphere Soundscape — Phase 1a Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the player-side zoom- and location-aware ambient soundscape (silence at overview, innermost zoomed-into area wins, crossfade on handoff) plus a one-tap calm mode, shipped static and leak-safe, tested with a hand-authored Brackenfjall sound area.

**Architecture:** Mirrors the ocean engine's config → resolver → layer shape. A per-map `soundscape` config (array of "sound areas") is resolved by a **pure** function (`selectActiveBed`) against the screen centre + how much of the screen each area covers; a Web-Audio `AudioEngine` crossfades looping beds; a `SoundSettingsProvider` owns gesture-gated enable, persistent mute, and calm mode. The DM authoring UI is **out of scope** (Phase 1b) — Phase 1a is tested with config placed directly in `world.yaml`.

**Tech Stack:** TypeScript, React, react-leaflet (Leaflet flat CRS), Web Audio API, Vitest (sharded), Vite + Workbox PWA, Node build scripts.

**Spec:** `docs/superpowers/specs/2026-06-17-atmosphere-sound-design.md` (read §6 activation, §7 autoplay, §9 secrecy, §10 architecture before starting).

**Conventions:**
- New runtime code under `src/atlas/sound/` and `src/atlas/geometry/`. New tests under `src/test/sound/` and `src/test/geometry/` (mirrors existing `src/test/ocean/`).
- Run a single test file with `npx vitest run <path>` (the full suite OOMs — never run it un-sharded).
- Coordinate convention (load-bearing): map coords are `[x, y]`, top-left origin. Leaflet `LatLng` has `lng = x` and `lat = mapHeight − y`. **Always un-flip** before hit-testing.
- Commit after every task. Use `feat:`/`test:`/`chore:` prefixes.

---

## Phase A — Pure foundations (geometry, schema, resolver)

### Task 1: Geometry utilities (lift `pointInPolygon`, add bbox + rect overlap)

**Files:**
- Create: `src/atlas/geometry/polygon.ts`
- Modify: `src/atlas/fog/effectiveLit.ts` (use the shared `pointInPolygon` instead of its private copy; keep its re-export)
- Test: `src/test/geometry/polygon.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/test/geometry/polygon.test.ts
import { describe, it, expect } from "vitest";
import { pointInPolygon, bboxOf, rectArea, rectIntersectArea } from "@/atlas/geometry/polygon";
import type { Point } from "@/atlas/content/schema";

const square: Point[] = [[0, 0], [100, 0], [100, 100], [0, 100]];

describe("pointInPolygon", () => {
  it("is true for an interior point", () => expect(pointInPolygon(50, 50, square)).toBe(true));
  it("is false for an exterior point", () => expect(pointInPolygon(150, 50, square)).toBe(false));
  it("is false for a degenerate polygon", () => expect(pointInPolygon(0, 0, [[0, 0], [1, 1]])).toBe(false));
});

describe("bboxOf / rectArea / rectIntersectArea", () => {
  it("computes a bbox", () => expect(bboxOf(square)).toEqual({ minX: 0, minY: 0, maxX: 100, maxY: 100 }));
  it("returns null for empty points", () => expect(bboxOf([])).toBeNull());
  it("computes rect area", () => expect(rectArea({ minX: 0, minY: 0, maxX: 10, maxY: 20 })).toBe(200));
  it("computes overlap area of two rects", () => {
    const a = { minX: 0, minY: 0, maxX: 100, maxY: 100 };
    const b = { minX: 50, minY: 50, maxX: 150, maxY: 150 };
    expect(rectIntersectArea(a, b)).toBe(2500); // 50x50 overlap
  });
  it("returns 0 for disjoint rects", () => {
    const a = { minX: 0, minY: 0, maxX: 10, maxY: 10 };
    const b = { minX: 20, minY: 20, maxX: 30, maxY: 30 };
    expect(rectIntersectArea(a, b)).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/geometry/polygon.test.ts`
Expected: FAIL — `Cannot find module '@/atlas/geometry/polygon'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/atlas/geometry/polygon.ts
import type { Point } from "@/atlas/content/schema";

export interface BBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Ray-casting point-in-polygon. Coordinates are map coords [x, y]. */
export function pointInPolygon(x: number, y: number, poly: Point[]): boolean {
  if (poly.length < 3) return false;
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    const hit = (yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (hit) inside = !inside;
  }
  return inside;
}

export function bboxOf(points: Point[]): BBox | null {
  if (points.length === 0) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of points) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return { minX, minY, maxX, maxY };
}

export function rectArea(b: BBox): number {
  return Math.max(0, b.maxX - b.minX) * Math.max(0, b.maxY - b.minY);
}

export function rectIntersectArea(a: BBox, b: BBox): number {
  const w = Math.max(0, Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX));
  const h = Math.max(0, Math.min(a.maxY, b.maxY) - Math.max(a.minY, b.minY));
  return w * h;
}
```

- [ ] **Step 4: DRY the fog module onto the shared util**

In `src/atlas/fog/effectiveLit.ts`, delete the private `pointInPolygon` function (lines 5–15) and replace the top of the file so it imports the shared one and keeps re-exporting it:

```ts
import type { FogOverlay, Point } from "@/atlas/content/schema";
import { pointInPolygon } from "@/atlas/geometry/polygon";

export const DEFAULT_FEATHER_PX = 16;
```

Leave the rest of the file unchanged (it already calls `pointInPolygon(...)` and ends with `export { pointInPolygon };` — both keep working).

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/test/geometry/polygon.test.ts`
Expected: PASS (all cases).
Run the fog tests to confirm no regression: `npx vitest run src/test/fog` (if a fog test dir exists; otherwise `npx vitest run src/atlas/fog`).
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/atlas/geometry/polygon.ts src/atlas/fog/effectiveLit.ts src/test/geometry/polygon.test.ts
git commit -m "feat: shared polygon/bbox geometry utils (lifted from fog)"
```

---

### Task 2: Schema types for soundscape

**Files:**
- Modify: `src/atlas/content/schema.ts` (add `soundscape?` to `MapDocument`; add three interfaces near `WaterConfig`)
- Test: `src/test/sound/schema.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/test/sound/schema.test.ts
import { describe, it, expect } from "vitest";
import type { MapDocument, SoundscapeConfig, SoundArea, SoundBed } from "@/atlas/content/schema";

describe("soundscape schema", () => {
  it("accepts a fully-formed soundscape on a map (type-level + runtime shape)", () => {
    const bed: SoundBed = { src: "a.ogg", srcFallback: "a.mp3", gain: 0.7 };
    const area: SoundArea = { id: "s0", regionId: "brackenfjall", bed };
    const sound: SoundscapeConfig = { enabled: true, masterGain: 0.6, areas: [area] };
    const map = { id: "m", name: "M", width: 10, height: 10, soundscape: sound } as Partial<MapDocument>;
    expect(map.soundscape?.areas?.[0].bed.src).toBe("a.ogg");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/sound/schema.test.ts`
Expected: FAIL — type imports `SoundscapeConfig`/`SoundArea`/`SoundBed` do not exist (TS compile error in the test).

- [ ] **Step 3: Add the types**

In `src/atlas/content/schema.ts`, near the `WaterConfig` interface add:

```ts
/** One looping ambient bed. Two files so Safari (no Ogg) has a fallback. */
export interface SoundBed {
  /** Path under atlas/assets/audio/ (primary, e.g. .ogg). */
  src: string;
  /** Optional Safari-friendly twin (.mp3/.aac). */
  srcFallback?: string;
  /** Per-bed loudness, 0..1, default 0.7. */
  gain?: number;
}

/** A place that makes sound. Either borrows a region's shape (regionId) or
 *  carries its own polygon (points). Exactly one bed; zoom layering is by
 *  nesting smaller areas, not by multiple beds. */
export interface SoundArea {
  id: string;
  /** Ride-on: borrow this region's points + visibility. */
  regionId?: string;
  /** Sound-only zone: own polygon (used when regionId is absent). */
  points?: Point[];
  /** Sound-only zones only; ride-on areas inherit the region's visibility. */
  visibility?: EntityVisibility;
  /** Optional label (editor + credits). DM-strippable; never required to ship. */
  name?: string;
  bed: SoundBed;
}

/** Per-map soundscape config (sibling of `water`). */
export interface SoundscapeConfig {
  /** default true. false ⇒ no AudioContext, no control for this map. */
  enabled?: boolean;
  /** Overall loudness, 0..1, default 0.6. */
  masterGain?: number;
  areas?: SoundArea[];
}
```

Then add one field to the `MapDocument` interface, directly under its `water?: WaterConfig;` line:

```ts
  soundscape?: SoundscapeConfig;
```

(If `EntityVisibility` is not already imported/declared in this file, it is defined here already — `Region`/`Route`/`FogOverlay` use it — so no new import is needed.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/test/sound/schema.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/atlas/content/schema.ts src/test/sound/schema.test.ts
git commit -m "feat: soundscape schema types (SoundscapeConfig/SoundArea/SoundBed)"
```

---

### Task 3: `prepareAreas` — precompute geometry + resolve ride-on regions

**Files:**
- Create: `src/atlas/sound/resolveSoundscape.ts`
- Test: `src/test/sound/prepareAreas.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/test/sound/prepareAreas.test.ts
import { describe, it, expect } from "vitest";
import { prepareAreas } from "@/atlas/sound/resolveSoundscape";
import type { MapDocument } from "@/atlas/content/schema";

const baseMap = (over: Partial<MapDocument>): MapDocument =>
  ({ id: "m", name: "M", width: 1000, height: 1000, layers: [], ...over } as MapDocument);

describe("prepareAreas", () => {
  it("resolves a ride-on area's points from its region", () => {
    const map = baseMap({
      regions: [{ id: "r1", mapId: "m", name: "R", points: [[0, 0], [100, 0], [100, 100], [0, 100]], visibility: "player" } as any],
      soundscape: { areas: [{ id: "s0", regionId: "r1", bed: { src: "a.ogg" } }] },
    });
    const prepared = prepareAreas(map);
    expect(prepared).toHaveLength(1);
    expect(prepared[0].bbox).toEqual({ minX: 0, minY: 0, maxX: 100, maxY: 100 });
    expect(prepared[0].bboxArea).toBe(10000);
  });

  it("uses own points for a sound-only area", () => {
    const map = baseMap({ soundscape: { areas: [{ id: "s0", points: [[0, 0], [10, 0], [10, 10], [0, 10]], bed: { src: "a.ogg" } }] } });
    expect(prepareAreas(map)[0].bboxArea).toBe(100);
  });

  it("skips a ride-on area whose region is missing (belt-and-suspenders)", () => {
    const map = baseMap({ regions: [], soundscape: { areas: [{ id: "s0", regionId: "gone", bed: { src: "a.ogg" } }] } });
    expect(prepareAreas(map)).toHaveLength(0);
  });

  it("skips degenerate polygons", () => {
    const map = baseMap({ soundscape: { areas: [{ id: "s0", points: [[0, 0], [1, 1]], bed: { src: "a.ogg" } }] } });
    expect(prepareAreas(map)).toHaveLength(0);
  });

  it("returns [] when there is no soundscape", () => {
    expect(prepareAreas(baseMap({}))).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/sound/prepareAreas.test.ts`
Expected: FAIL — `Cannot find module '@/atlas/sound/resolveSoundscape'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/atlas/sound/resolveSoundscape.ts
import type { MapDocument, Point, SoundBed } from "@/atlas/content/schema";
import { BBox, bboxOf, pointInPolygon, rectArea, rectIntersectArea } from "@/atlas/geometry/polygon";

export interface PreparedArea {
  id: string;
  points: Point[];
  bbox: BBox;
  bboxArea: number;
  bed: SoundBed;
}

/** Fraction of the screen an area must cover before it can play. */
export const FILL_MIN = 0.5;
/** Stickiness: the active area is kept until coverage falls below FILL_MIN×this. */
export const HYSTERESIS = 0.85;

export function prepareAreas(map: MapDocument): PreparedArea[] {
  const areas = map.soundscape?.areas ?? [];
  const regionPoints = new Map<string, Point[]>();
  for (const r of map.regions ?? []) regionPoints.set(r.id, r.points);

  const out: PreparedArea[] = [];
  for (const a of areas) {
    const points = a.points ?? (a.regionId ? regionPoints.get(a.regionId) : undefined);
    if (!points || points.length < 3) continue;
    const bbox = bboxOf(points);
    if (!bbox) continue;
    out.push({ id: a.id, points, bbox, bboxArea: rectArea(bbox), bed: a.bed });
  }
  return out;
}
```

(`rectIntersectArea`/`pointInPolygon` are imported now; they're used by Task 4 in the same file.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/test/sound/prepareAreas.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/atlas/sound/resolveSoundscape.ts src/test/sound/prepareAreas.test.ts
git commit -m "feat: prepareAreas — precompute soundscape geometry + resolve ride-on regions"
```

---

### Task 4: `selectActiveBed` — coverage gate, innermost-wins, hysteresis

**Files:**
- Modify: `src/atlas/sound/resolveSoundscape.ts` (append `selectActiveBed` + `BBox` alias `ViewRect`)
- Test: `src/test/sound/selectActiveBed.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/test/sound/selectActiveBed.test.ts
import { describe, it, expect } from "vitest";
import { selectActiveBed, type PreparedArea } from "@/atlas/sound/resolveSoundscape";
import type { BBox } from "@/atlas/geometry/polygon";

const rect = (minX: number, minY: number, maxX: number, maxY: number): BBox => ({ minX, minY, maxX, maxY });
const sq = (id: string, x0: number, y0: number, x1: number, y1: number): PreparedArea => ({
  id,
  points: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]],
  bbox: rect(x0, y0, x1, y1),
  bboxArea: (x1 - x0) * (y1 - y0),
  bed: { src: `${id}.ogg` },
});

// Region 0..1000 (large), city 400..600 (small, nested), on a 0..1000 world.
const region = sq("region", 0, 0, 1000, 1000);
const city = sq("city", 400, 600, 600, 800); // centre (500,700)

describe("selectActiveBed", () => {
  it("is silent at world overview (area covers < FILL_MIN of the screen)", () => {
    // view spans the whole world; region covers 100% — but use a tiny area to prove the gate
    const tiny = sq("tiny", 480, 480, 520, 520); // 40x40 on a 1000x1000 view => coverage 0.0016
    const view = rect(0, 0, 1000, 1000);
    expect(selectActiveBed([tiny], 500, 500, view, null)).toBeNull();
  });

  it("plays a region once it fills enough of the screen", () => {
    const view = rect(100, 100, 900, 900); // 800x800; region overlap = 800x800 = full => coverage 1
    expect(selectActiveBed([region], 500, 500, view, null)).toBe("region");
  });

  it("picks the innermost (smallest) eligible area when nested", () => {
    // zoomed into the city: view 400..600 x 600..800 => city coverage 1, region coverage 1 too
    const view = rect(400, 600, 600, 800);
    expect(selectActiveBed([region, city], 500, 700, view, null)).toBe("city");
  });

  it("falls back to the region when zoomed out so the city no longer fills the screen", () => {
    // view 0..1000: city (200x200) coverage = 0.04 < FILL_MIN; region coverage 1
    const view = rect(0, 0, 1000, 1000);
    expect(selectActiveBed([region, city], 500, 700, view, "city")).toBe("region");
  });

  it("returns null when the centre is outside every polygon", () => {
    const view = rect(0, 0, 100, 100);
    expect(selectActiveBed([city], 50, 50, view, null)).toBeNull();
  });

  it("keeps the previous winner in the hysteresis dead-band rather than dropping to silence", () => {
    // coverage just under FILL_MIN but above FILL_MIN×HYSTERESIS (0.425): build a view where city coverage ≈ 0.45
    // city is 200x200=40000. view 400..600 x 600..889 => area 200x289=57800; overlap=40000 => coverage 0.692 (eligible)
    // Use a view giving coverage between 0.425 and 0.5:
    const view = rect(400, 600, 600, 1044); // 200x444=88800; overlap 40000 => coverage 0.45
    // not eligible (<0.5) but within dead-band, and prev was "city":
    expect(selectActiveBed([city], 500, 700, view, "city")).toBe("city");
    // with no previous winner, dead-band does not apply => silence
    expect(selectActiveBed([city], 500, 700, view, null)).toBeNull();
  });

  it("breaks ties between equal-size overlapping areas deterministically by id", () => {
    const a = sq("bbb", 0, 0, 100, 100);
    const b = sq("aaa", 0, 0, 100, 100);
    const view = rect(0, 0, 100, 100);
    expect(selectActiveBed([a, b], 50, 50, view, null)).toBe("aaa");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/sound/selectActiveBed.test.ts`
Expected: FAIL — `selectActiveBed` is not exported.

- [ ] **Step 3: Append the implementation**

Append to `src/atlas/sound/resolveSoundscape.ts`:

```ts
/** A viewport rectangle in map coords (same shape as a BBox). */
export type ViewRect = BBox;

/**
 * The active bed = the smallest eligible area whose polygon contains the screen
 * centre and which covers at least FILL_MIN of the screen. Nesting falls out of
 * "smallest wins". Hysteresis keeps the previous winner sticky at the boundary.
 * Pure: callers pass plain numbers (see readViewport).
 */
export function selectActiveBed(
  areas: PreparedArea[],
  cx: number,
  cy: number,
  view: ViewRect,
  prevId: string | null,
): string | null {
  const viewArea = rectArea(view);
  if (viewArea <= 0) return prevId;

  const coverage = (a: PreparedArea) => rectIntersectArea(a.bbox, view) / viewArea;
  const contains = (a: PreparedArea) => pointInPolygon(cx, cy, a.points);

  const eligible = areas.filter((a) => contains(a) && coverage(a) >= FILL_MIN);

  if (eligible.length === 0) {
    // Dead-band: keep the previous winner if it is still close to eligible.
    const prev = prevId ? areas.find((a) => a.id === prevId) : undefined;
    if (prev && contains(prev) && coverage(prev) >= FILL_MIN * HYSTERESIS) return prevId;
    return null;
  }

  eligible.sort((a, b) => a.bboxArea - b.bboxArea || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const smallest = eligible[0];

  // Keep the previous winner if nothing strictly smaller has become eligible,
  // so equal-size siblings don't flicker as the camera nudges across a border.
  if (prevId && prevId !== smallest.id) {
    const prev = eligible.find((a) => a.id === prevId);
    if (prev && smallest.bboxArea >= prev.bboxArea) return prevId;
  }
  return smallest.id;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/test/sound/selectActiveBed.test.ts`
Expected: PASS (all 7 cases).

- [ ] **Step 5: Commit**

```bash
git add src/atlas/sound/resolveSoundscape.ts src/test/sound/selectActiveBed.test.ts
git commit -m "feat: selectActiveBed — coverage gate, innermost-wins, hysteresis"
```

---

### Task 5: `readViewport` — the Leaflet→numbers extraction (the y-flip glue)

**Files:**
- Create: `src/atlas/sound/readViewport.ts`
- Test: `src/test/sound/readViewport.test.ts`

This isolates the single most bug-prone line (the coordinate un-flip) into a pure, mockable function.

- [ ] **Step 1: Write the failing test**

```ts
// src/test/sound/readViewport.test.ts
import { describe, it, expect } from "vitest";
import { readViewport } from "@/atlas/sound/readViewport";

// Mock just the slice of the Leaflet map API we use.
const mockMap = (center: { lat: number; lng: number }, sw: { lat: number; lng: number }, ne: { lat: number; lng: number }) => ({
  getCenter: () => center,
  getBounds: () => ({ getSouthWest: () => sw, getNorthEast: () => ne }),
});

describe("readViewport", () => {
  it("un-flips lat→y for the centre and the viewport corners", () => {
    const mapHeight = 1000;
    // Centre at map (x=300, y=200) => lat = 1000-200 = 800, lng = 300
    const map = mockMap({ lat: 800, lng: 300 }, { lat: 100, lng: 50 }, { lat: 900, lng: 700 });
    const { cx, cy, view } = readViewport(map, mapHeight);
    expect(cx).toBe(300);
    expect(cy).toBe(200); // 1000 - 800
    // sw.lat=100 (south) => maxY = 1000-100 = 900 ; ne.lat=900 (north) => minY = 1000-900 = 100
    expect(view).toEqual({ minX: 50, maxX: 700, minY: 100, maxY: 900 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/sound/readViewport.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/atlas/sound/readViewport.ts
import type { ViewRect } from "@/atlas/sound/resolveSoundscape";

interface LatLngLike { lat: number; lng: number }
export interface LeafletViewLike {
  getCenter(): LatLngLike;
  getBounds(): { getSouthWest(): LatLngLike; getNorthEast(): LatLngLike };
}

/** Convert Leaflet's flipped-lat view state into top-left-origin map coords. */
export function readViewport(map: LeafletViewLike, mapHeight: number): { cx: number; cy: number; view: ViewRect } {
  const c = map.getCenter();
  const cx = c.lng;
  const cy = mapHeight - c.lat;
  const b = map.getBounds();
  const sw = b.getSouthWest();
  const ne = b.getNorthEast();
  const view: ViewRect = {
    minX: sw.lng,
    maxX: ne.lng,
    minY: mapHeight - ne.lat, // north (max lat) → top (min y)
    maxY: mapHeight - sw.lat, // south (min lat) → bottom (max y)
  };
  return { cx, cy, view };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/test/sound/readViewport.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/atlas/sound/readViewport.ts src/test/sound/readViewport.test.ts
git commit -m "feat: readViewport — Leaflet flat-CRS extraction with y-flip"
```

---

## Phase B — Player runtime (state, audio, layer, control)

### Task 6: `soundPrefs` — localStorage store (mirrors playerNotes)

**Files:**
- Create: `src/atlas/sound/soundPrefs.ts`
- Test: `src/test/sound/soundPrefs.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/test/sound/soundPrefs.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { loadSoundPrefs, saveSoundPrefs, DEFAULT_PREFS, _resetSoundPrefsForTests } from "@/atlas/sound/soundPrefs";

describe("soundPrefs", () => {
  beforeEach(() => _resetSoundPrefsForTests());

  it("returns defaults when nothing is stored", () => {
    expect(loadSoundPrefs()).toEqual(DEFAULT_PREFS);
  });

  it("round-trips saved prefs", () => {
    saveSoundPrefs({ soundEnabled: true, muted: false, calmMode: true });
    expect(loadSoundPrefs()).toEqual({ soundEnabled: true, muted: false, calmMode: true });
  });

  it("degrades to defaults on a corrupt blob", () => {
    localStorage.setItem("atlas-player-sound-v1", "{not json");
    expect(loadSoundPrefs()).toEqual(DEFAULT_PREFS);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/sound/soundPrefs.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/atlas/sound/soundPrefs.ts
const STORAGE_KEY = "atlas-player-sound-v1";

export interface SoundPrefs {
  soundEnabled: boolean;
  muted: boolean;
  calmMode: boolean;
}

export const DEFAULT_PREFS: SoundPrefs = { soundEnabled: false, muted: false, calmMode: false };

function getStorage(): Storage | null {
  try {
    if (typeof window === "undefined") return null;
    const s = window.localStorage;
    const probe = "__atlas_probe__";
    s.setItem(probe, "1");
    s.removeItem(probe);
    return s;
  } catch {
    return null;
  }
}

export function loadSoundPrefs(): SoundPrefs {
  const s = getStorage();
  if (!s) return { ...DEFAULT_PREFS };
  try {
    const raw = s.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_PREFS };
    const p = JSON.parse(raw);
    if (!p || typeof p !== "object") return { ...DEFAULT_PREFS };
    return {
      soundEnabled: typeof p.soundEnabled === "boolean" ? p.soundEnabled : DEFAULT_PREFS.soundEnabled,
      muted: typeof p.muted === "boolean" ? p.muted : DEFAULT_PREFS.muted,
      calmMode: typeof p.calmMode === "boolean" ? p.calmMode : DEFAULT_PREFS.calmMode,
    };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function saveSoundPrefs(prefs: SoundPrefs): void {
  const s = getStorage();
  if (!s) return;
  try {
    s.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Quota/sandbox — drop silently; the viewer keeps working.
  }
}

export function _resetSoundPrefsForTests(): void {
  const s = getStorage();
  if (!s) return;
  try {
    s.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/test/sound/soundPrefs.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/atlas/sound/soundPrefs.ts src/test/sound/soundPrefs.test.ts
git commit -m "feat: soundPrefs localStorage store"
```

---

### Task 7: `AudioEngine` — gesture unlock, lazy decode + LRU, crossfade, suspend

**Files:**
- Create: `src/atlas/sound/AudioEngine.ts`
- Test: `src/test/sound/AudioEngine.test.ts`

The engine takes an injected `AudioContext` factory and `fetch`/`decode` functions so it is testable without real audio.

- [ ] **Step 1: Write the failing test**

```ts
// src/test/sound/AudioEngine.test.ts
import { describe, it, expect, vi } from "vitest";
import { AudioEngine } from "@/atlas/sound/AudioEngine";

function makeMockCtx() {
  const gainNode = () => ({
    gain: { value: 1, setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), cancelScheduledValues: vi.fn() },
    connect: vi.fn(),
    disconnect: vi.fn(),
  });
  const ctx: any = {
    state: "suspended",
    currentTime: 0,
    destination: {},
    createGain: vi.fn(gainNode),
    createBufferSource: vi.fn(() => ({
      buffer: null,
      loop: false,
      loopStart: 0,
      loopEnd: 0,
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
      disconnect: vi.fn(),
    })),
    resume: vi.fn(async () => { ctx.state = "running"; }),
    suspend: vi.fn(async () => { ctx.state = "suspended"; }),
    decodeAudioData: vi.fn(async () => ({ duration: 30 })),
  };
  return ctx;
}

const deps = (ctx: any) => ({
  createContext: () => ctx,
  fetchAudio: vi.fn(async () => new ArrayBuffer(8)),
  canPlay: () => true,
});

describe("AudioEngine", () => {
  it("creates no context until unlock()", () => {
    const ctx = makeMockCtx();
    const eng = new AudioEngine(deps(ctx));
    expect((eng as any).ctx).toBeNull();
  });

  it("unlock() creates and resumes the context", async () => {
    const ctx = makeMockCtx();
    const eng = new AudioEngine(deps(ctx));
    await eng.unlock();
    expect(ctx.resume).toHaveBeenCalled();
    expect(ctx.state).toBe("running");
  });

  it("crossfadeTo decodes and starts a source, and stops the previous one", async () => {
    const ctx = makeMockCtx();
    const d = deps(ctx);
    const eng = new AudioEngine(d);
    await eng.unlock();
    await eng.crossfadeTo({ id: "a", bed: { src: "a.ogg" } } as any);
    expect(d.fetchAudio).toHaveBeenCalledTimes(1);
    await eng.crossfadeTo({ id: "b", bed: { src: "b.ogg" } } as any);
    expect(d.fetchAudio).toHaveBeenCalledTimes(2);
  });

  it("caches decoded buffers (no second fetch for the same src)", async () => {
    const ctx = makeMockCtx();
    const d = deps(ctx);
    const eng = new AudioEngine(d);
    await eng.unlock();
    await eng.crossfadeTo({ id: "a", bed: { src: "a.ogg" } } as any);
    await eng.crossfadeTo({ id: "b", bed: { src: "b.ogg" } } as any);
    await eng.crossfadeTo({ id: "a", bed: { src: "a.ogg" } } as any);
    expect(d.fetchAudio).toHaveBeenCalledTimes(2); // a reused
  });

  it("resume() only resumes when suspended", async () => {
    const ctx = makeMockCtx();
    const eng = new AudioEngine(deps(ctx));
    await eng.unlock();
    ctx.resume.mockClear();
    await eng.resume(); // already running
    expect(ctx.resume).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/sound/AudioEngine.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```ts
// src/atlas/sound/AudioEngine.ts
import type { PreparedArea } from "@/atlas/sound/resolveSoundscape";

export interface AudioDeps {
  createContext: () => AudioContext;
  fetchAudio: (url: string) => Promise<ArrayBuffer>;
  /** true if the browser can decode the given src extension (Ogg probe etc.). */
  canPlay: (src: string) => boolean;
}

const CROSSFADE_S = 1.0;
const BUFFER_CAP = 4;

interface ActiveBed {
  id: string;
  source: AudioBufferSourceNode;
  gain: GainNode;
}

/** Resolve the asset URL for the player build. */
function audioUrl(src: string): string {
  return src.startsWith("/") || src.startsWith("http") ? src : `atlas/assets/audio/${src}`;
}

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private buffers = new Map<string, AudioBuffer>(); // keyed by chosen src
  private lru: string[] = [];
  private active: ActiveBed | null = null;
  private muted = false;
  private masterGain = 0.6;
  private decoding = new Map<string, Promise<AudioBuffer | null>>();

  constructor(private deps: AudioDeps) {}

  /** Must be called from a user-gesture handler. Idempotent. */
  async unlock(): Promise<void> {
    if (!this.ctx) {
      this.ctx = this.deps.createContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : this.masterGain;
      this.master.connect(this.ctx.destination);
    }
    await this.resume();
  }

  async resume(): Promise<void> {
    if (this.ctx && this.ctx.state === "suspended") await this.ctx.resume();
  }

  async suspend(): Promise<void> {
    if (this.ctx && this.ctx.state === "running") await this.ctx.suspend();
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.ctx && this.master) {
      this.master.gain.cancelScheduledValues(this.ctx.currentTime);
      this.master.gain.linearRampToValueAtTime(muted ? 0 : this.masterGain, this.ctx.currentTime + 0.2);
    }
  }

  setMasterGain(g: number): void {
    this.masterGain = Math.min(1, Math.max(0, g));
    if (!this.muted) this.setMuted(false);
  }

  /** Crossfade to the given area's bed, or to silence when area is null. */
  async crossfadeTo(area: PreparedArea | null): Promise<void> {
    if (!this.ctx || !this.master) return;
    const targetId = area?.id ?? null;
    if (this.active?.id === targetId) return;

    const out = this.active;
    this.active = null;
    if (out) this.fadeOutAndStop(out);

    if (!area) return;

    const src = this.deps.canPlay(area.bed.src) || !area.bed.srcFallback ? area.bed.src : area.bed.srcFallback;
    const buffer = await this.loadBuffer(src);
    if (!buffer || !this.ctx || !this.master) return;
    if (this.active) return; // a newer crossfade superseded us while decoding

    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    gain.connect(this.master);
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.loopStart = 0;
    source.loopEnd = buffer.duration; // avoids the Safari 1-sample loop click
    source.connect(gain);
    source.start();
    const peak = Math.min(1, area.bed.gain ?? 0.7);
    gain.gain.setValueAtTime(0, this.ctx.currentTime);
    gain.gain.linearRampToValueAtTime(peak, this.ctx.currentTime + CROSSFADE_S);
    this.active = { id: area.id, source, gain };
  }

  private fadeOutAndStop(bed: ActiveBed): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    bed.gain.gain.cancelScheduledValues(t);
    bed.gain.gain.linearRampToValueAtTime(0, t + CROSSFADE_S);
    try {
      bed.source.stop(t + CROSSFADE_S + 0.05);
    } catch {
      /* already stopped */
    }
    setTimeout(() => {
      try {
        bed.source.disconnect();
        bed.gain.disconnect();
      } catch {
        /* ignore */
      }
    }, (CROSSFADE_S + 0.1) * 1000);
  }

  private async loadBuffer(src: string): Promise<AudioBuffer | null> {
    const cached = this.buffers.get(src);
    if (cached) {
      this.touch(src);
      return cached;
    }
    const inflight = this.decoding.get(src);
    if (inflight) return inflight;
    const p = (async () => {
      try {
        const bytes = await this.deps.fetchAudio(audioUrl(src));
        const buf = await this.ctx!.decodeAudioData(bytes.slice(0));
        this.buffers.set(src, buf);
        this.touch(src);
        return buf;
      } catch {
        return null; // unsupported/missing — degrade to silence
      } finally {
        this.decoding.delete(src);
      }
    })();
    this.decoding.set(src, p);
    return p;
  }

  private touch(src: string): void {
    this.lru = this.lru.filter((s) => s !== src);
    this.lru.push(src);
    while (this.lru.length > BUFFER_CAP) {
      const evict = this.lru.shift()!;
      if (this.active && this.buffers.get(evict) === this.active.source.buffer) continue;
      this.buffers.delete(evict);
    }
  }

  dispose(): void {
    if (this.active) this.fadeOutAndStop(this.active);
    this.active = null;
    this.buffers.clear();
    this.lru = [];
    void this.ctx?.close?.();
    this.ctx = null;
    this.master = null;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/test/sound/AudioEngine.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add src/atlas/sound/AudioEngine.ts src/test/sound/AudioEngine.test.ts
git commit -m "feat: AudioEngine — gesture unlock, lazy decode+LRU, crossfade, suspend"
```

---

### Task 8: `SoundSettingsProvider` — context owning prefs + the engine

**Files:**
- Create: `src/atlas/sound/SoundSettingsProvider.tsx`
- Create: `src/atlas/sound/realAudioDeps.ts` (browser-backed `AudioDeps`)
- Test: `src/test/sound/SoundSettingsProvider.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/test/sound/SoundSettingsProvider.test.tsx
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { SoundSettingsProvider, useSoundSettings } from "@/atlas/sound/SoundSettingsProvider";
import { _resetSoundPrefsForTests, loadSoundPrefs } from "@/atlas/sound/soundPrefs";

function Probe() {
  const { calmMode, setCalmMode } = useSoundSettings();
  return (
    <button onClick={() => setCalmMode(!calmMode)}>{calmMode ? "calm-on" : "calm-off"}</button>
  );
}

describe("SoundSettingsProvider", () => {
  beforeEach(() => {
    _resetSoundPrefsForTests();
    document.documentElement.removeAttribute("data-calm");
  });

  it("starts from defaults and toggles calm mode, persisting + reflecting on <html>", () => {
    render(<SoundSettingsProvider><Probe /></SoundSettingsProvider>);
    expect(screen.getByRole("button").textContent).toBe("calm-off");
    act(() => screen.getByRole("button").click());
    expect(screen.getByRole("button").textContent).toBe("calm-on");
    expect(document.documentElement.getAttribute("data-calm")).toBe("true");
    expect(loadSoundPrefs().calmMode).toBe(true);
  });
});
```

(If `@testing-library/react` is not yet a dev dependency, install it: `npm i -D @testing-library/react @testing-library/dom` — check `package.json` first; the editor tests may already use it.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/sound/SoundSettingsProvider.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementations**

```ts
// src/atlas/sound/realAudioDeps.ts
import type { AudioDeps } from "@/atlas/sound/AudioEngine";

export const realAudioDeps: AudioDeps = {
  createContext: () => new (window.AudioContext || (window as any).webkitAudioContext)(),
  fetchAudio: (url) => fetch(url).then((r) => r.arrayBuffer()),
  canPlay: (src) => {
    if (!src.endsWith(".ogg")) return true;
    try {
      return new Audio().canPlayType('audio/ogg; codecs="vorbis"') !== "";
    } catch {
      return false;
    }
  },
};
```

```tsx
// src/atlas/sound/SoundSettingsProvider.tsx
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AudioEngine, type AudioDeps } from "@/atlas/sound/AudioEngine";
import { realAudioDeps } from "@/atlas/sound/realAudioDeps";
import { DEFAULT_PREFS, loadSoundPrefs, saveSoundPrefs, type SoundPrefs } from "@/atlas/sound/soundPrefs";

interface SoundSettings extends SoundPrefs {
  engine: AudioEngine;
  enableSound: () => void;        // call from a user gesture
  setMuted: (m: boolean) => void;
  setCalmMode: (c: boolean) => void;
}

const Ctx = createContext<SoundSettings | null>(null);

export function useSoundSettings(): SoundSettings {
  const v = useContext(Ctx);
  if (!v) throw new Error("useSoundSettings must be used within SoundSettingsProvider");
  return v;
}

export function SoundSettingsProvider({ children, deps = realAudioDeps }: { children: React.ReactNode; deps?: AudioDeps }) {
  const [prefs, setPrefs] = useState<SoundPrefs>(() => (typeof window === "undefined" ? DEFAULT_PREFS : loadSoundPrefs()));
  const engineRef = useRef<AudioEngine>();
  if (!engineRef.current) engineRef.current = new AudioEngine(deps);
  const engine = engineRef.current;

  const update = useCallback((patch: Partial<SoundPrefs>) => {
    setPrefs((prev) => {
      const next = { ...prev, ...patch };
      saveSoundPrefs(next);
      return next;
    });
  }, []);

  // Reflect calm mode onto <html> for the ocean CSS hook.
  useEffect(() => {
    const root = document.documentElement;
    if (prefs.calmMode) root.setAttribute("data-calm", "true");
    else root.removeAttribute("data-calm");
  }, [prefs.calmMode]);

  // Mirror mute/calm into the engine.
  useEffect(() => {
    engine.setMuted(prefs.muted || prefs.calmMode);
  }, [engine, prefs.muted, prefs.calmMode]);

  // iOS: resume on return to foreground; suspend on hide for battery.
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible") void engine.resume();
      else void engine.suspend();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [engine]);

  const enableSound = useCallback(() => {
    void engine.unlock();
    update({ soundEnabled: true });
  }, [engine, update]);

  const value = useMemo<SoundSettings>(
    () => ({
      ...prefs,
      engine,
      enableSound,
      setMuted: (m) => update({ muted: m }),
      setCalmMode: (c) => update({ calmMode: c }),
    }),
    [prefs, engine, enableSound, update],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/test/sound/SoundSettingsProvider.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/atlas/sound/SoundSettingsProvider.tsx src/atlas/sound/realAudioDeps.ts src/test/sound/SoundSettingsProvider.test.tsx
git commit -m "feat: SoundSettingsProvider — prefs context + engine + calm-mode html hook"
```

---

### Task 9: `SoundscapeLayer` — drive the engine from Leaflet view changes

**Files:**
- Create: `src/atlas/sound/SoundscapeLayer.tsx`
- Test: `src/test/sound/SoundscapeLayer.logic.test.ts` (tests the debounce-free selection step; the react-leaflet wiring is exercised manually in Task 14)

- [ ] **Step 1: Write the failing test (the pure step the layer calls)**

```ts
// src/test/sound/SoundscapeLayer.logic.test.ts
import { describe, it, expect } from "vitest";
import { computeActiveId } from "@/atlas/sound/SoundscapeLayer";
import { prepareAreas } from "@/atlas/sound/resolveSoundscape";
import type { MapDocument } from "@/atlas/content/schema";

const map = {
  id: "m", name: "M", width: 1000, height: 1000, layers: [],
  soundscape: { areas: [{ id: "s0", points: [[0, 0], [1000, 0], [1000, 1000], [0, 1000]], bed: { src: "a.ogg" } }] },
} as unknown as MapDocument;

const mockMap = (center: any, sw: any, ne: any) => ({
  getCenter: () => center,
  getBounds: () => ({ getSouthWest: () => sw, getNorthEast: () => ne }),
});

describe("computeActiveId", () => {
  it("returns the area id when zoomed in over it", () => {
    const prepared = prepareAreas(map);
    const leaflet = mockMap({ lat: 500, lng: 500 }, { lat: 100, lng: 100 }, { lat: 900, lng: 900 });
    expect(computeActiveId(prepared, leaflet as any, 1000, null)).toBe("s0");
  });

  it("returns null at overview-scale view (tiny coverage)", () => {
    const small = {
      ...map,
      soundscape: { areas: [{ id: "s0", points: [[490, 490], [510, 490], [510, 510], [490, 510]], bed: { src: "a.ogg" } }] },
    } as unknown as MapDocument;
    const prepared = prepareAreas(small);
    const leaflet = mockMap({ lat: 500, lng: 500 }, { lat: 0, lng: 0 }, { lat: 1000, lng: 1000 });
    expect(computeActiveId(prepared, leaflet as any, 1000, null)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/sound/SoundscapeLayer.logic.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```tsx
// src/atlas/sound/SoundscapeLayer.tsx
import { useEffect, useMemo, useRef } from "react";
import { useMap } from "react-leaflet";
import type { MapDocument } from "@/atlas/content/schema";
import { prepareAreas, selectActiveBed, type PreparedArea } from "@/atlas/sound/resolveSoundscape";
import { readViewport, type LeafletViewLike } from "@/atlas/sound/readViewport";
import { useSoundSettings } from "@/atlas/sound/SoundSettingsProvider";

const DEBOUNCE_MS = 150;

/** Pure: read the current view and pick the active area id. Exported for tests. */
export function computeActiveId(
  prepared: PreparedArea[],
  map: LeafletViewLike,
  mapHeight: number,
  prevId: string | null,
): string | null {
  const { cx, cy, view } = readViewport(map, mapHeight);
  return selectActiveBed(prepared, cx, cy, view, prevId);
}

export function SoundscapeLayer({ map: mapDoc }: { map: MapDocument }) {
  const leaflet = useMap();
  const { soundEnabled, engine } = useSoundSettings();
  const prepared = useMemo(() => prepareAreas(mapDoc), [mapDoc]);
  const activeId = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (mapDoc.soundscape?.enabled === false) return;
    engine.setMasterGain(mapDoc.soundscape?.masterGain ?? 0.6);
  }, [engine, mapDoc.soundscape?.enabled, mapDoc.soundscape?.masterGain]);

  useEffect(() => {
    if (!soundEnabled || mapDoc.soundscape?.enabled === false || prepared.length === 0) return;

    const settle = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        const next = computeActiveId(prepared, leaflet as unknown as LeafletViewLike, mapDoc.height, activeId.current);
        if (next === activeId.current) return;
        activeId.current = next;
        void engine.crossfadeTo(prepared.find((a) => a.id === next) ?? null);
      }, DEBOUNCE_MS);
    };

    settle(); // evaluate the current view immediately on enable
    leaflet.on("moveend", settle);
    leaflet.on("zoomend", settle);
    return () => {
      leaflet.off("moveend", settle);
      leaflet.off("zoomend", settle);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [leaflet, soundEnabled, prepared, engine, mapDoc.height, mapDoc.soundscape?.enabled]);

  // Stop sound when the player mutes-to-off by leaving the map's areas.
  useEffect(() => {
    return () => {
      activeId.current = null;
      void engine.crossfadeTo(null);
    };
  }, [engine, mapDoc.id]);

  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/test/sound/SoundscapeLayer.logic.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/atlas/sound/SoundscapeLayer.tsx src/test/sound/SoundscapeLayer.logic.test.ts
git commit -m "feat: SoundscapeLayer — drive crossfades from Leaflet view changes"
```

---

### Task 10: `SoundControl` — the invite → speaker/mute → calm UI

**Files:**
- Create: `src/atlas/sound/SoundControl.tsx`
- Test: `src/test/sound/SoundControl.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/test/sound/SoundControl.test.tsx
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { SoundSettingsProvider } from "@/atlas/sound/SoundSettingsProvider";
import { SoundControl } from "@/atlas/sound/SoundControl";
import { _resetSoundPrefsForTests } from "@/atlas/sound/soundPrefs";

const stubDeps = {
  createContext: () => ({ state: "suspended", currentTime: 0, destination: {}, createGain: () => ({ gain: { value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, cancelScheduledValues() {} }, connect() {}, disconnect() {} }), resume: async () => {}, suspend: async () => {} }) as any,
  fetchAudio: async () => new ArrayBuffer(8),
  canPlay: () => true,
};

const renderControl = () =>
  render(
    <SoundSettingsProvider deps={stubDeps as any}>
      <SoundControl />
    </SoundSettingsProvider>,
  );

describe("SoundControl", () => {
  beforeEach(() => _resetSoundPrefsForTests());

  it("shows the invite first, then the speaker after enabling", () => {
    renderControl();
    const invite = screen.getByRole("button", { name: /bring the world to life/i });
    expect(invite).toBeTruthy();
    act(() => invite.click());
    expect(screen.getByRole("button", { name: /mute|sound/i })).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/sound/SoundControl.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```tsx
// src/atlas/sound/SoundControl.tsx
import { useState } from "react";
import { useSoundSettings } from "@/atlas/sound/SoundSettingsProvider";

export function SoundControl() {
  const { soundEnabled, muted, calmMode, enableSound, setMuted, setCalmMode } = useSoundSettings();
  const [dismissed, setDismissed] = useState(false);

  return (
    <div className="absolute bottom-4 right-4 z-[1000] flex items-center gap-2">
      {!soundEnabled && !dismissed && (
        <div className="flex items-center gap-2 rounded-full border border-border bg-card px-3 py-2 shadow-sm">
          <button
            type="button"
            onClick={enableSound}
            className="flex items-center gap-2 text-sm"
          >
            <span aria-hidden>🔊</span>
            Tap to bring the world to life
          </button>
          <button type="button" aria-label="Dismiss" onClick={() => setDismissed(true)} className="text-muted-foreground">
            ✕
          </button>
        </div>
      )}

      {soundEnabled && (
        <button
          type="button"
          aria-label={muted ? "Unmute sound" : "Mute sound"}
          onClick={() => setMuted(!muted)}
          className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card shadow-sm"
        >
          <span aria-hidden>{muted ? "🔈" : "🔊"}</span>
        </button>
      )}

      <button
        type="button"
        aria-pressed={calmMode}
        onClick={() => setCalmMode(!calmMode)}
        className="rounded-full border border-border bg-card px-3 py-2 text-xs shadow-sm"
      >
        Calm mode {calmMode ? "on" : "off"}
      </button>
    </div>
  );
}
```

(Icons here are placeholders; if the project uses `lucide-react` like the rest of the UI, swap the emoji spans for `<Volume2 />`/`<VolumeX />`/`<X />` — check an existing component such as `OfflineMenu` for the icon import pattern before finalising. Keep the `aria-label`s exactly as the test expects.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/test/sound/SoundControl.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/atlas/sound/SoundControl.tsx src/test/sound/SoundControl.test.tsx
git commit -m "feat: SoundControl — invite, mute toggle, calm-mode switch"
```

---

### Task 11: Wire into `AtlasViewer` + calm-mode ocean CSS

**Files:**
- Modify: `src/pages/AtlasViewer.tsx` (wrap the return in `SoundSettingsProvider`; mount `SoundscapeLayer` inside `<MapContainer>`; mount `SoundControl` inside `<main>`)
- Modify: `src/atlas/ocean/OceanBackground.tsx` (add the `data-calm` stylesheet rule)

- [ ] **Step 1: Add the imports to `AtlasViewer.tsx`**

Near the other `@/atlas` imports (top of file, alongside the `OceanBackground` import on line 17):

```ts
import { SoundSettingsProvider } from "@/atlas/sound/SoundSettingsProvider";
import { SoundscapeLayer } from "@/atlas/sound/SoundscapeLayer";
import { SoundControl } from "@/atlas/sound/SoundControl";
```

- [ ] **Step 2: Wrap the component's returned JSX**

In `AtlasViewer()` (the `return (` for the main view), wrap the **outermost** returned element with `<SoundSettingsProvider> … </SoundSettingsProvider>`. (It must enclose both the `<MapContainer>` subtree and the `<main>` overlay so both `SoundscapeLayer` and `SoundControl` share one provider/engine.)

- [ ] **Step 3: Mount the layer + control**

Inside `<MapContainer>`, directly after `<ViewSyncController … />` (line ~488):

```tsx
            <SoundscapeLayer map={activeMap} />
```

Inside `<main id="atlas-main">`, after `</MapContainer>` and before `</main>` (line ~513):

```tsx
          <SoundControl />
```

- [ ] **Step 4: Add the calm-mode rule to the ocean stylesheet**

In `src/atlas/ocean/OceanBackground.tsx`, find the static `@media (prefers-reduced-motion: reduce)` block (~line 25 — the one that sets `.ocean-wave-1/2/3 { animation: none !important }`). Immediately after that block, in the same injected stylesheet string, add:

```css
:root[data-calm="true"] .ocean-wave-1,
:root[data-calm="true"] .ocean-wave-2,
:root[data-calm="true"] .ocean-wave-3 { animation: none !important; }
```

- [ ] **Step 5: Verify the build compiles + existing suites are green**

Run: `npx tsc --noEmit`
Expected: no type errors.
Run: `npx vitest run src/test/sound`
Expected: PASS (all sound tests).

- [ ] **Step 6: Commit**

```bash
git add src/pages/AtlasViewer.tsx src/atlas/ocean/OceanBackground.tsx
git commit -m "feat: mount soundscape layer + control in viewer; calm-mode ocean hook"
```

---

## Phase C — Build pipeline, secrecy & first real sound

### Task 12: YAML serialization (`soundscapeToYamlObject`) + parse

**Files:**
- Modify: `src/atlas/yaml/buildFullWorldYaml.ts` (add `soundscapeToYamlObject`; call it where `water` is serialized)
- Modify: `scripts/atlas/loadWorldConfig.ts` (parse `soundscape` if the loader is not a pure passthrough — verify first)
- Test: `src/test/sound/soundscapeYaml.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/test/sound/soundscapeYaml.test.ts
import { describe, it, expect } from "vitest";
import { soundscapeToYamlObject } from "@/atlas/yaml/buildFullWorldYaml";
import type { SoundscapeConfig } from "@/atlas/content/schema";

describe("soundscapeToYamlObject", () => {
  it("serializes areas and omits default-valued fields", () => {
    const sc: SoundscapeConfig = {
      enabled: true,
      masterGain: 0.6, // default → omitted
      areas: [
        { id: "s0", regionId: "brackenfjall", name: "Brackenfjall", bed: { src: "fjord.ogg", srcFallback: "fjord.mp3", gain: 0.7 } },
        { id: "s1", points: [[0, 0], [10, 0], [10, 10]], visibility: "player", bed: { src: "city.ogg", gain: 0.5 } },
      ],
    };
    const out = soundscapeToYamlObject(sc) as any;
    expect(out.masterGain).toBeUndefined(); // default omitted
    expect(out.areas).toHaveLength(2);
    expect(out.areas[0]).toMatchObject({ id: "s0", regionId: "brackenfjall", name: "Brackenfjall" });
    expect(out.areas[0].bed).toMatchObject({ src: "fjord.ogg", srcFallback: "fjord.mp3" });
    expect(out.areas[0].bed.gain).toBeUndefined(); // 0.7 is the default
    expect(out.areas[1].bed.gain).toBe(0.5);       // non-default kept
    expect(out.areas[1].points).toHaveLength(3);
  });

  it("returns undefined for an empty soundscape", () => {
    expect(soundscapeToYamlObject({ areas: [] })).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/sound/soundscapeYaml.test.ts`
Expected: FAIL — `soundscapeToYamlObject` not exported.

- [ ] **Step 3: Write the serializer**

Add to `src/atlas/yaml/buildFullWorldYaml.ts` (near `waterToYamlObject`):

```ts
import type { SoundscapeConfig, SoundArea, SoundBed } from "@/atlas/content/schema";

const DEFAULT_MASTER_GAIN = 0.6;
const DEFAULT_BED_GAIN = 0.7;

function bedToYaml(b: SoundBed): Record<string, unknown> {
  const out: Record<string, unknown> = { src: b.src };
  if (b.srcFallback) out.srcFallback = b.srcFallback;
  if (b.gain !== undefined && b.gain !== DEFAULT_BED_GAIN) out.gain = b.gain;
  return out;
}

function areaToYaml(a: SoundArea): Record<string, unknown> {
  const out: Record<string, unknown> = { id: a.id, bed: bedToYaml(a.bed) };
  if (a.regionId) out.regionId = a.regionId;
  if (a.points) out.points = a.points;
  if (a.visibility) out.visibility = a.visibility;
  if (a.name) out.name = a.name;
  return out;
}

export function soundscapeToYamlObject(sc: SoundscapeConfig): Record<string, unknown> | undefined {
  const areas = sc.areas ?? [];
  if (areas.length === 0) return undefined;
  const out: Record<string, unknown> = {};
  if (sc.enabled === false) out.enabled = false;
  if (sc.masterGain !== undefined && sc.masterGain !== DEFAULT_MASTER_GAIN) out.masterGain = sc.masterGain;
  out.areas = areas.map(areaToYaml);
  return out;
}
```

Then, where the map's `water` is written into the YAML object (look for `waterToYamlObject(m.water)`), add directly below it:

```ts
  if (m.soundscape) {
    const sc = soundscapeToYamlObject(m.soundscape);
    if (sc) out.soundscape = sc;
  }
```

- [ ] **Step 4: Confirm the read path**

Open `scripts/atlas/loadWorldConfig.ts`. If maps are parsed by spreading/passing through unknown keys (as `water` is), `soundscape` already round-trips — no change. If each field is explicitly picked, add `soundscape: rawMap.soundscape` alongside `water`. (Verify by searching the file for `water`.)

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/test/sound/soundscapeYaml.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/atlas/yaml/buildFullWorldYaml.ts scripts/atlas/loadWorldConfig.ts src/test/sound/soundscapeYaml.test.ts
git commit -m "feat: soundscape YAML serialization + parse"
```

---

### Task 13: Player-build secrecy filter (drop/strip/neutralise, in place)

**Files:**
- Create: `scripts/atlas/filterSoundscape.ts` (pure)
- Test: `src/test/sound/filterSoundscape.test.ts`
- Modify: `scripts/build-atlas.ts` (call it in place on each map before serialization — wired in Step 4)

- [ ] **Step 1: Write the failing test**

```ts
// src/test/sound/filterSoundscape.test.ts
import { describe, it, expect } from "vitest";
import { filterSoundscapeForPlayer } from "../../scripts/atlas/filterSoundscape";
import type { MapDocument } from "@/atlas/content/schema";

const isRegionVisible = (id: string) => id === "public-region"; // only this region survives
const stripName = (s: string) => s.replace(/%%.*?%%/g, "").trim();
const isVisibilityPlayer = (v?: string) => v === "player" || v === "rumor" || v === undefined;

const map = (areas: any[]): MapDocument =>
  ({ id: "m", name: "M", width: 10, height: 10, layers: [], soundscape: { enabled: true, areas } } as unknown as MapDocument);

describe("filterSoundscapeForPlayer", () => {
  it("drops a ride-on area whose region is not player-visible", () => {
    const sc = filterSoundscapeForPlayer(map([{ id: "s0", regionId: "dm-region", bed: { src: "x.ogg" } }]), { isRegionVisible, isVisibilityPlayer, stripName });
    expect(sc).toBeUndefined(); // no areas survived → whole key dropped
  });

  it("keeps a ride-on area on a player-visible region and neutralises its id", () => {
    const sc = filterSoundscapeForPlayer(map([{ id: "war-room-sound", regionId: "public-region", name: "%%War room%% Cove", bed: { src: "x.ogg" } }]), { isRegionVisible, isVisibilityPlayer, stripName });
    expect(sc!.areas).toHaveLength(1);
    expect(sc!.areas![0].id).toBe("s0");         // neutralised
    expect(sc!.areas![0].name).toBe("Cove");     // stripped
  });

  it("drops a sound-only area with dm visibility but keeps player ones", () => {
    const sc = filterSoundscapeForPlayer(
      map([
        { id: "a", points: [[0, 0], [1, 0], [1, 1]], visibility: "dm", bed: { src: "secret.ogg" } },
        { id: "b", points: [[0, 0], [1, 0], [1, 1]], visibility: "player", bed: { src: "ok.ogg" } },
      ]),
      { isRegionVisible, isVisibilityPlayer, stripName },
    );
    expect(sc!.areas).toHaveLength(1);
    expect(sc!.areas![0].id).toBe("s0");
    expect(sc!.areas![0].bed.src).toBe("ok.ogg");
  });

  it("returns undefined when soundscape is absent", () => {
    expect(filterSoundscapeForPlayer({ id: "m", name: "M", width: 1, height: 1, layers: [] } as any, { isRegionVisible, isVisibilityPlayer, stripName })).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/sound/filterSoundscape.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the pure filter**

```ts
// scripts/atlas/filterSoundscape.ts
import type { MapDocument, SoundscapeConfig, SoundArea } from "../../src/atlas/content/schema";

export interface FilterDeps {
  isRegionVisible: (regionId: string) => boolean;
  isVisibilityPlayer: (v: string | undefined) => boolean;
  stripName: (s: string) => string;
}

/** Produce the player-safe soundscape for a map, or undefined to drop the key. */
export function filterSoundscapeForPlayer(map: MapDocument, deps: FilterDeps): SoundscapeConfig | undefined {
  const sc = map.soundscape;
  if (!sc || !(sc.areas?.length)) return undefined;

  const kept: SoundArea[] = [];
  for (const a of sc.areas) {
    if (a.regionId) {
      if (!deps.isRegionVisible(a.regionId)) continue; // excluded region → drop the whole area
    } else {
      if (!deps.isVisibilityPlayer(a.visibility)) continue; // sound-only dm/hidden → drop
    }
    const next: SoundArea = { ...a, id: `s${kept.length}` }; // neutralise id
    if (next.name) next.name = deps.stripName(next.name);
    kept.push(next);
  }

  if (kept.length === 0) return undefined;
  const out: SoundscapeConfig = { areas: kept };
  if (sc.enabled === false) out.enabled = false;
  if (sc.masterGain !== undefined) out.masterGain = sc.masterGain;
  return out;
}
```

- [ ] **Step 4: Wire it into `build-atlas.ts`**

In `scripts/build-atlas.ts`, find the per-map player-build transform (the region filter around L621–641 that calls `PLAYER_VISIBLE` + `stripDmFromShippingString`). After regions are filtered for a map `m`, replace `m.soundscape` in place:

```ts
import { filterSoundscapeForPlayer } from "./atlas/filterSoundscape";

// inside the per-map player transform, after region filtering produces `playerRegions`:
const visibleRegionIds = new Set(playerRegions.map((r) => r.id));
const filteredSoundscape = filterSoundscapeForPlayer(
  { ...m, regions: playerRegions, soundscape: m.soundscape },
  {
    isRegionVisible: (id) => visibleRegionIds.has(id),
    isVisibilityPlayer: (v) => PLAYER_VISIBLE.has(v as any),
    stripName: (s) => stripDmFromShippingString(s) ?? s,
  },
);
if (filteredSoundscape) m.soundscape = filteredSoundscape;
else delete m.soundscape; // drop empty/all-DM
```

(Match the exact local variable names used in `build-atlas.ts` for the filtered regions and the visibility set; the names above are illustrative — read the surrounding block first.)

- [ ] **Step 5: Run tests + a real build**

Run: `npx vitest run src/test/sound/filterSoundscape.test.ts`
Expected: PASS.
Run: `npm run atlas:build:player`
Expected: build succeeds (no soundscape data yet → no-op on the current world).

- [ ] **Step 6: Commit**

```bash
git add scripts/atlas/filterSoundscape.ts scripts/build-atlas.ts src/test/sound/filterSoundscape.test.ts
git commit -m "feat: player-build soundscape secrecy filter (drop/strip/neutralise in place)"
```

---

### Task 14: Content-hash audio filenames for the player build

**Files:**
- Create: `scripts/atlas/hashAudioAssets.ts` (pure hash helper + a copy/rewrite function)
- Test: `src/test/sound/hashAudioAssets.test.ts`
- Modify: `scripts/build-atlas.ts` (invoke after the soundscape filter; verify against the asset-copy step)

- [ ] **Step 1: Write the failing test**

```ts
// src/test/sound/hashAudioAssets.test.ts
import { describe, it, expect } from "vitest";
import { hashedName, rewriteSoundscapeSrcs } from "../../scripts/atlas/hashAudioAssets";

describe("hashAudioAssets", () => {
  it("derives a stable neutral name from bytes + extension", () => {
    const a = hashedName(Buffer.from("hello"), "fjord-secret.ogg");
    const b = hashedName(Buffer.from("hello"), "anything.ogg");
    expect(a).toBe(b);          // same bytes+ext → same neutral name
    expect(a).toMatch(/^[a-f0-9]{16}\.ogg$/); // no original (secret) name survives
  });

  it("rewrites src/srcFallback via a provided name map", () => {
    const sc = { areas: [{ id: "s0", bed: { src: "fjord.ogg", srcFallback: "fjord.mp3" } }] } as any;
    const map = new Map([["fjord.ogg", "aaaa1111.ogg"], ["fjord.mp3", "bbbb2222.mp3"]]);
    rewriteSoundscapeSrcs(sc, map);
    expect(sc.areas[0].bed.src).toBe("aaaa1111.ogg");
    expect(sc.areas[0].bed.srcFallback).toBe("bbbb2222.mp3");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/sound/hashAudioAssets.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the helper**

```ts
// scripts/atlas/hashAudioAssets.ts
import { createHash } from "node:crypto";
import type { SoundscapeConfig } from "../../src/atlas/content/schema";

export function hashedName(bytes: Buffer, originalName: string): string {
  const ext = originalName.slice(originalName.lastIndexOf(".")); // includes the dot
  const hash = createHash("sha1").update(bytes).digest("hex").slice(0, 16);
  return `${hash}${ext}`;
}

/** Rewrite every bed src/srcFallback through a (original → hashed) name map. */
export function rewriteSoundscapeSrcs(sc: SoundscapeConfig, nameMap: Map<string, string>): void {
  for (const a of sc.areas ?? []) {
    const m = nameMap.get(a.bed.src);
    if (m) a.bed.src = m;
    if (a.bed.srcFallback) {
      const mf = nameMap.get(a.bed.srcFallback);
      if (mf) a.bed.srcFallback = mf;
    }
  }
}
```

- [ ] **Step 4: Wire into `build-atlas.ts`**

After the soundscape filter (Task 13) for the player build, for each surviving bed `src`/`srcFallback`: read the file from `public/atlas/assets/audio/<src>`, compute `hashedName(bytes, src)`, copy it into the player output's audio dir under the hashed name, accumulate a `Map<original, hashed>`, then call `rewriteSoundscapeSrcs(m.soundscape, nameMap)`. (Locate the existing asset-copy step in `build-atlas.ts` and add the audio copy alongside it. If the player build copies `public/` wholesale, additionally remove the original-named audio files from the player output so descriptive names don't ship.)

- [ ] **Step 5: Run tests**

Run: `npx vitest run src/test/sound/hashAudioAssets.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add scripts/atlas/hashAudioAssets.ts scripts/build-atlas.ts src/test/sound/hashAudioAssets.test.ts
git commit -m "feat: content-hash audio filenames in the player build (no descriptive-name leak)"
```

---

### Task 15: Build-time secrecy assertion

**Files:**
- Create: `scripts/atlas/checkSoundscapeSecrecy.ts` (pure)
- Test: `src/test/sound/checkSoundscapeSecrecy.test.ts`
- Modify: `scripts/check-artifact-shape.ts` (call the assertion; fail the build on any finding)

- [ ] **Step 1: Write the failing test**

```ts
// src/test/sound/checkSoundscapeSecrecy.test.ts
import { describe, it, expect } from "vitest";
import { findSoundscapeLeaks } from "../../scripts/atlas/checkSoundscapeSecrecy";

const atlas = (maps: any[]) => ({ maps });

describe("findSoundscapeLeaks", () => {
  it("passes a clean player atlas", () => {
    const a = atlas([{ id: "m", regions: [{ id: "r1" }], soundscape: { areas: [{ id: "s0", regionId: "r1", bed: { src: "aa.ogg" } }] } }]);
    expect(findSoundscapeLeaks(a, [])).toEqual([]);
  });

  it("flags a dm-visibility sound area", () => {
    const a = atlas([{ id: "m", regions: [], soundscape: { areas: [{ id: "s0", visibility: "dm", points: [], bed: { src: "x.ogg" } }] } }]);
    expect(findSoundscapeLeaks(a, [])).toHaveLength(1);
  });

  it("flags a ride-on regionId that does not resolve", () => {
    const a = atlas([{ id: "m", regions: [{ id: "r1" }], soundscape: { areas: [{ id: "s0", regionId: "ghost", bed: { src: "x.ogg" } }] } }]);
    expect(findSoundscapeLeaks(a, [])).toHaveLength(1);
  });

  it("flags a derived-secret substring in a name or src", () => {
    const a = atlas([{ id: "m", regions: [], soundscape: { areas: [{ id: "s0", points: [], name: "Nepheth's Tomb", bed: { src: "ok.ogg" } }] } }]);
    expect(findSoundscapeLeaks(a, ["Nepheth's Tomb"])).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/sound/checkSoundscapeSecrecy.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the assertion**

```ts
// scripts/atlas/checkSoundscapeSecrecy.ts
interface AtlasLike {
  maps?: Array<{
    id: string;
    regions?: Array<{ id: string }>;
    soundscape?: { areas?: Array<{ id: string; regionId?: string; visibility?: string; name?: string; bed: { src: string; srcFallback?: string } }> };
  }>;
}

const FORBIDDEN_VISIBILITY = new Set(["dm", "hidden", "unknown"]);

/** Returns a list of human-readable leak descriptions; empty = clean. */
export function findSoundscapeLeaks(atlas: AtlasLike, derivedSecretNames: string[]): string[] {
  const problems: string[] = [];
  for (const m of atlas.maps ?? []) {
    const regionIds = new Set((m.regions ?? []).map((r) => r.id));
    for (const a of m.soundscape?.areas ?? []) {
      if (a.visibility && FORBIDDEN_VISIBILITY.has(a.visibility))
        problems.push(`map ${m.id}: sound area ${a.id} has visibility "${a.visibility}"`);
      if (a.regionId && !regionIds.has(a.regionId))
        problems.push(`map ${m.id}: sound area ${a.id} references missing region "${a.regionId}"`);
      const haystack = [a.name ?? "", a.bed.src, a.bed.srcFallback ?? ""].join(" ");
      for (const secret of derivedSecretNames) {
        if (secret && haystack.includes(secret))
          problems.push(`map ${m.id}: sound area ${a.id} leaks DM name "${secret}"`);
      }
    }
  }
  return problems;
}
```

- [ ] **Step 4: Wire into `check-artifact-shape.ts`**

In `scripts/check-artifact-shape.ts`, after the atlas JSON is parsed, add:

```ts
import { findSoundscapeLeaks } from "./atlas/checkSoundscapeSecrecy";

// derivedSecretNames: reuse the same DM-name list that check-derived-secrets builds
// (import its exported collector, or pass [] if names aren't available in this script).
const soundLeaks = findSoundscapeLeaks(atlas, derivedSecretNames ?? []);
if (soundLeaks.length > 0) {
  console.error("Soundscape secrecy violations:\n" + soundLeaks.map((p) => "  - " + p).join("\n"));
  process.exit(1);
}
```

(If `check-artifact-shape.ts` doesn't already have the derived-name list, wire `[]` for now and leave a `// TODO` to share `check-derived-secrets`'s name collector; the structural checks (visibility + dangling regionId) still run.)

- [ ] **Step 5: Run tests + scans**

Run: `npx vitest run src/test/sound/checkSoundscapeSecrecy.test.ts`
Expected: PASS.
Run: `npm run atlas:publish`
Expected: build + all scans pass (no soundscape data yet).

- [ ] **Step 6: Commit**

```bash
git add scripts/atlas/checkSoundscapeSecrecy.ts scripts/check-artifact-shape.ts src/test/sound/checkSoundscapeSecrecy.test.ts
git commit -m "feat: build-time soundscape secrecy assertion"
```

---

### Task 16: Workbox audio caching + offline

**Files:**
- Modify: `vite.config.ts` (the existing `atlas-assets` runtime-cache rule, ~L99)

- [ ] **Step 1: Modify the existing rule**

In `vite.config.ts`, find the workbox `runtimeCaching` entry whose `urlPattern` matches `/atlas/assets/` (~line 99, `handler: "CacheFirst"`). Do **not** add a new rule (it would be shadowed). Update this rule's `options` to add range-request support and 206 caching:

```ts
{
  urlPattern: ({ url }) => url.pathname.includes("/atlas/assets/"),
  handler: "CacheFirst",
  options: {
    cacheName: "atlas-assets", // keep the existing name
    rangeRequests: true,       // workbox sugar for RangeRequestsPlugin (audio seek/replay)
    cacheableResponse: { statuses: [0, 200, 206] },
    expiration: { maxEntries: 200 }, // keep/adjust to the existing value if present
  },
},
```

(Use whatever existing `cacheName`/`expiration` the rule already has; only add `rangeRequests` and `cacheableResponse`. If the project pins `vite-plugin-pwa`'s generateSW, `rangeRequests: true` is the supported shorthand; if it uses injectManifest, add `new RangeRequestsPlugin()` to the rule's `plugins` instead.)

- [ ] **Step 2: Verify the build**

Run: `npm run build`
Expected: build succeeds; the generated service worker includes the updated rule (grep `dist/sw.js` for `206` or `RangeRequests`).

- [ ] **Step 3: Commit**

```bash
git add vite.config.ts
git commit -m "feat: workbox range-request caching for /atlas/assets audio (offline)"
```

---

### Task 17: First real sound — hand-authored Brackenfjall area + credits + manual verify

**Files:**
- Create: `public/atlas/assets/audio/.gitkeep` and place real loop files there (`brackenfjall.ogg` + `brackenfjall.mp3`)
- Create: `content/<world>/_atlas/credits.yaml`
- Modify: `content/<world>/_atlas/world.yaml` (add a `soundscape` with one Brackenfjall area; first draw a `brackenfjall` region if none exists)
- Modify: `scripts/build-atlas.ts` or a new `scripts/check-audio-credits.ts` (warn on uncredited audio — warning only until N3)

- [ ] **Step 1: Add audio assets + credits**

Create `public/atlas/assets/audio/` and add two seamless loop files (CC0/credited): `brackenfjall.ogg` and `brackenfjall.mp3` (~20–40 s, a few hundred KB). Create `content/<world>/_atlas/credits.yaml`:

```yaml
audio:
  - file: brackenfjall.ogg
    title: Coastal wind and surf
    source: <url>
    licence: CC0
    url: <url>
```

- [ ] **Step 2: Author one sound area in `world.yaml`**

Under the `astrath-deeprealm-overview` map, add (drawing a `brackenfjall` region polygon first if one doesn't exist — or use a sound-only `points` polygon over the Brackenfjall area of the map):

```yaml
    soundscape:
      areas:
        - id: s0
          points: [[X1, Y1], [X2, Y1], [X2, Y2], [X1, Y2]]   # Brackenfjall bounds in map coords
          visibility: player
          name: Brackenfjall
          bed:
            src: brackenfjall.ogg
            srcFallback: brackenfjall.mp3
            gain: 0.7
```

- [ ] **Step 3: Add the uncredited-audio warning**

Add a check (in `scripts/build-atlas.ts` after the soundscape filter, or a small `scripts/check-audio-credits.ts` called by `atlas:publish`) that, for every shipped `bed.src`, looks up a matching entry in `credits.yaml` and `console.warn`s if missing. Keep it a **warning** (not a failure) until the N3 credits page lands.

- [ ] **Step 4: Build + manual verification in the browser**

Run: `npm run dev`
Then use the preview workflow:
- Load the viewer; confirm **silence** at world overview and **no** network request for `.ogg` (preview_network).
- Confirm the "bring the world to life" invite is visible (preview_snapshot).
- Click it (preview_click); zoom into Brackenfjall; confirm the bed fades in (preview_network shows the audio fetch only now; preview_console_logs clean).
- Toggle mute and calm mode; confirm sound stops and (calm) the ocean motion stops too.
- Reload; confirm the mute/calm choice persisted.

- [ ] **Step 5: Full publish gate**

Run: `npm run atlas:publish`
Expected: build + `atlas:check-secrets` + `atlas:check-derived` + the new soundscape assertion all pass.
Run the sound suite: `npx vitest run src/test/sound`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add public/atlas/assets/audio/ content/ scripts/
git commit -m "feat: first Brackenfjall soundscape area + audio credits + manual-verified playback"
```

---

## Self-review (run before handing off)

**Spec coverage** — every spec section maps to a task:
- §6 activation (coverage gate, innermost-wins, hysteresis, y-flip) → Tasks 1, 3, 4, 5, 9.
- §7 autoplay / control / calm mode → Tasks 8, 10, 11.
- §8 perf (lazy decode, LRU, loop points, suspend/resume, workbox) → Tasks 7, 8, 16.
- §9 secrecy (drop/strip/neutralise, content-hash, assertion) + credits → Tasks 13, 14, 15, 17.
- §10 architecture (schema, resolver, layer, provider, build) → Tasks 2, 3–9, 12.
- §10.6 `enabled:false` → Task 9 (guards) + Task 12 (serialize).
- §12 testing (resolver, extraction glue, prefs, engine mock, build fixtures) → covered per task.
- §15 acceptance → verified end-to-end in Task 17.

**Out of scope (correctly deferred):** DM authoring UI (Phase 1b — `useSoundAreaDraft`, `MapSettingsPanel` section), weather/time-of-day/flourishes/cover page (Phases 2–5), the credits **page** (N3; metadata + warning only here).

**Type consistency:** `PreparedArea`, `ViewRect`/`BBox`, `selectActiveBed(areas, cx, cy, view, prevId)`, `prepareAreas(map)`, `readViewport(map, mapHeight)`, `AudioEngine.crossfadeTo(area|null)`/`unlock()`/`resume()`/`suspend()`/`setMuted()`/`setMasterGain()`, `SoundscapeConfig`/`SoundArea`/`SoundBed`, `filterSoundscapeForPlayer`, `findSoundscapeLeaks`, `soundscapeToYamlObject` — names are used identically across all tasks.

**Open items to confirm during execution (not blockers):**
- `loadWorldConfig.ts` passthrough vs explicit-pick (Task 12 Step 4).
- Exact local variable names in `build-atlas.ts` region-filter block (Tasks 13–14).
- Whether `@testing-library/react` is already a dev dep (Task 8).
- The real Brackenfjall polygon coords + sourced audio (Task 17).
