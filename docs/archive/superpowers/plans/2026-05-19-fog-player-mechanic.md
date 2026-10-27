# Fog Player Mechanic — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a fog-enabled map an enforced player secret — no map pixels, pins, routes, regions, or nav targets outside the revealed area ever reach the published player site.

**Architecture:** One pure geometry module (`effectiveLit`) is the single source of truth for "is this point visible." Authoring gains conceal ("draw fog") shapes + a soft-edge value. The player build masks every layer image to the revealed shape with a feathered alpha (via `sharp`), ships only the redacted PNGs, strips fog geometry from the player atlas, and a new scan independently re-verifies the boundary. Phases A–E; D+E ship in the same release.

**Tech Stack:** TypeScript, Vitest, React + react-leaflet (editor only), `sharp` (new build-only devDependency), tsx build scripts.

Spec: `docs/superpowers/specs/2026-05-19-fog-player-mechanic-design.md` — read it before starting. Re-read the "Build-time redaction" and "Scan assertion" sections before Phase D/E.

**Project gates (every commit):** `npm test` green except the 2 known-unrelated `fake-indexeddb` files; `npm run lint` clean except the 1 known-unrelated `AtlasPlacementEditor.tsx:986`; for Phase C+ also `npm run atlas:publish` scans clean. Generated artifacts (`public/atlas/*`, `.local-atlas/`, `dist/`) are NEVER committed.

---

## Phase A — Geometry + data model

No behavior change. Pure additions.

### Task A1: Extend `FogOverlay` schema

**Files:**
- Modify: `src/atlas/content/schema.ts` (the `FogOverlay` interface, ~line 117)

- [ ] **Step 1: Add the two optional fields**

```ts
export interface FogOverlay {
  mapId: string;
  enabled: boolean;
  color?: string;
  reveals: Point[][];
  conceals?: Point[][];   // "fog" polygons; subtract from reveals
  featherPx?: number;     // soft-edge band width, default applied by consumers
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc -p tsconfig.json --noEmit`
Expected: PASS (optional fields are backward compatible).

- [ ] **Step 3: Commit**

```bash
git add src/atlas/content/schema.ts
git commit -m "feat(fog): conceals + featherPx on FogOverlay schema"
```

### Task A2: `effectiveLit` pure module — point test

**Files:**
- Create: `src/atlas/fog/effectiveLit.ts`
- Test: `src/test/fog/effectiveLit.test.ts`

Reuse the existing point-in-polygon helper if one is exported; otherwise implement a standard ray-cast locally in this module (do NOT add a dependency). Check `src/pages/AtlasPlacementEditor.tsx` for `pointInPolygon` — if exported, import it; if not, add a local `pointInPolygon(x, y, poly)` in `effectiveLit.ts` and leave the editor copy alone (do not refactor unrelated code).

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { isLit } from "@/atlas/fog/effectiveLit";
import type { FogOverlay } from "@/atlas/content/schema";

const sq = (x0:number,y0:number,x1:number,y1:number) =>
  [[x0,y0],[x1,y0],[x1,y1],[x0,y1]] as [number,number][];

describe("effectiveLit.isLit", () => {
  it("point inside a reveal is lit", () => {
    const fog: FogOverlay = { mapId:"m", enabled:true, reveals:[sq(0,0,100,100)] };
    expect(isLit(50,50,fog)).toBe(true);
  });
  it("point outside all reveals is not lit", () => {
    const fog: FogOverlay = { mapId:"m", enabled:true, reveals:[sq(0,0,100,100)] };
    expect(isLit(200,200,fog)).toBe(false);
  });
  it("conceal overrides reveal (conceal wins)", () => {
    const fog: FogOverlay = { mapId:"m", enabled:true,
      reveals:[sq(0,0,100,100)], conceals:[sq(40,40,60,60)] };
    expect(isLit(50,50,fog)).toBe(false);
    expect(isLit(10,10,fog)).toBe(true);
  });
  it("degenerate polygon (<3 pts) is ignored", () => {
    const fog: FogOverlay = { mapId:"m", enabled:true, reveals:[[[1,1],[2,2]] as never] };
    expect(isLit(1.5,1.5,fog)).toBe(false);
  });
  it("enabled:false → everything lit", () => {
    const fog: FogOverlay = { mapId:"m", enabled:false, reveals:[] };
    expect(isLit(999,999,fog)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npx vitest run src/test/fog/effectiveLit.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `effectiveLit.ts`**

```ts
import type { FogOverlay, Point } from "@/atlas/content/schema";

export const DEFAULT_FEATHER_PX = 16;

function pointInPolygon(x: number, y: number, poly: Point[]): boolean {
  if (poly.length < 3) return false;
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    const hit = (yi > y) !== (yj > y) &&
      x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (hit) inside = !inside;
  }
  return inside;
}

/** A point is lit iff fog is disabled, OR it is inside some reveal and
 *  inside no conceal. Geometry uses the strict boundary — feather is
 *  visual only (see redactFogMap). */
export function isLit(x: number, y: number, fog: FogOverlay): boolean {
  if (!fog.enabled) return true;
  const inReveal = fog.reveals.some((p) => pointInPolygon(x, y, p));
  if (!inReveal) return false;
  const inConceal = (fog.conceals ?? []).some((p) => pointInPolygon(x, y, p));
  return !inConceal;
}

export { pointInPolygon };
```

- [ ] **Step 4: Run test, verify pass**

Run: `npx vitest run src/test/fog/effectiveLit.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/atlas/fog/effectiveLit.ts src/test/fog/effectiveLit.test.ts
git commit -m "feat(fog): effectiveLit point test (reveal minus conceal)"
```

### Task A3: `effectivePolygons` for masking

**Files:**
- Modify: `src/atlas/fog/effectiveLit.ts`
- Test: `src/test/fog/effectiveLit.test.ts` (add a describe block)

`effectivePolygons` returns the raw reveal and conceal polygon sets (filtered to ≥3 points) for the build mask step. We do NOT compute boolean polygon clipping here — the mask is rasterized in `redactFogMap` (fill reveals opaque, then punch conceals transparent). This keeps geometry dependency-free.

- [ ] **Step 1: Failing test**

```ts
import { effectivePolygons } from "@/atlas/fog/effectiveLit";

describe("effectivePolygons", () => {
  it("returns reveals and conceals filtered to >=3 points", () => {
    const r = effectivePolygons({ mapId:"m", enabled:true,
      reveals:[sq(0,0,10,10), [[0,0],[1,1]] as never],
      conceals:[sq(2,2,4,4)] });
    expect(r.reveals.length).toBe(1);
    expect(r.conceals.length).toBe(1);
  });
});
```

- [ ] **Step 2: Run, verify fail** — `npx vitest run src/test/fog/effectiveLit.test.ts` → FAIL (export missing).

- [ ] **Step 3: Implement**

```ts
export function effectivePolygons(fog: FogOverlay): {
  reveals: Point[][]; conceals: Point[][];
} {
  const ok = (p: Point[]) => p.length >= 3;
  return {
    reveals: fog.reveals.filter(ok),
    conceals: (fog.conceals ?? []).filter(ok),
  };
}
```

- [ ] **Step 4: Run, verify pass.**

- [ ] **Step 5: Commit**

```bash
git add src/atlas/fog/effectiveLit.ts src/test/fog/effectiveLit.test.ts
git commit -m "feat(fog): effectivePolygons accessor for mask raster"
```

---

## Phase B — Authoring (DM editor)

### Task B1: `useFogDraft` conceal authoring

**Files:**
- Modify: `src/atlas/fog/useFogDraft.ts`
- Test: `src/test/atlas-routes-fog.test.ts` (extend the existing `useFogDraft` describe — follow its renderHook/act style)

- [ ] **Step 1: Failing tests** (add to the existing `describe("useFogDraft", …)`)

```ts
it("draws a conceal polygon into conceals", () => {
  const { result } = renderHook(() => useFogDraft(map));
  act(() => result.current.setTool("fog-polygon"));
  act(() => result.current.addDraftPoint([1,1]));
  act(() => result.current.addDraftPoint([10,1]));
  act(() => result.current.addDraftPoint([5,10]));
  let ok = false;
  act(() => { ok = result.current.finishDraftPolygon(); });
  expect(ok).toBe(true);
  expect(result.current.fog.conceals?.length).toBe(1);
  expect(result.current.fog.reveals.length).toBe(1); // base map's existing reveal untouched
});

it("setFeatherPx records on the overlay and is dirty", () => {
  const { result } = renderHook(() => useFogDraft(map));
  act(() => result.current.setFeatherPx(24));
  expect(result.current.dirty).toBe(true);
  expect(result.current.fog.featherPx).toBe(24);
});
```

- [ ] **Step 2: Run, verify fail** — `npx vitest run src/test/atlas-routes-fog.test.ts` → FAIL.

- [ ] **Step 3: Implement**

In `useFogDraft.ts`:
- Extend `FogTool`: `"polygon" | "circle" | "fog-polygon" | "fog-circle" | null`. (Keep `"polygon"`/`"circle"` meaning *reveal* for backward compatibility with existing tests/FogLayer; the two `fog-*` values mean conceal.)
- Add `setFeatherPx: (n: number) => void` → `mutate({ featherPx: n })`.
- In `addReveal`, branch on the active tool: `fog-*` tools append to `conceals` (init `[]` if absent) via `mutate({ conceals: [...(fog.conceals ?? []), poly] })`; reveal tools keep current behavior.
- Add `removeConceal(index)`, `clearConceals()` mirroring `removeReveal`/`clearReveals`.
- `fogToYamlObject`: also emit `conceals` (when non-empty) and `featherPx` (when set), same int-rounding as `reveals`.
- Extend the `FogDraftAPI` interface with the new members.

- [ ] **Step 4: Run, verify pass.** Also run `npx vitest run src/test/atlas-routes-fog.test.ts src/test/world-yaml-serialize.test.ts` — fix any YAML round-trip expectation that needs `conceals`/`featherPx`.

- [ ] **Step 5: Commit**

```bash
git add src/atlas/fog/useFogDraft.ts src/test/atlas-routes-fog.test.ts
git commit -m "feat(fog): conceal (draw-fog) authoring + featherPx in useFogDraft"
```

### Task B2: Fog tab UI — fog tools + lists

**Files:**
- Modify: `src/atlas/tabs/FogTab.tsx` (read it first; mirror the existing reveal-tool buttons + reveal list)
- Test: find the existing FogTab test via `src/test/**/*FogTab*` or the tab's render test; if none, create `src/test/tabs/FogTab.test.tsx` (RTL, mirror `FormatToolbar.test.tsx` style)

- [ ] **Step 1: Failing RTL test** — asserts a "Draw fog" control exists, a "Fog shapes" list renders one entry after a conceal is present, and a feather input reflects/sets `featherPx`. (Write concrete assertions against `FogTab`'s real props — read the component to get exact prop names; do not invent.)

- [ ] **Step 2: Run, verify fail.**

- [ ] **Step 3: Implement** — add a parallel "Draw fog" polygon/circle tool group calling `api.setTool("fog-polygon"|"fog-circle")`, a "Fog shapes" list bound to `api.fog.conceals` with per-row remove (`api.removeConceal(i)`), and a number input bound to `api.fog.featherPx ?? DEFAULT_FEATHER_PX` calling `api.setFeatherPx`. Match existing Tailwind classes in the file.

- [ ] **Step 4: Run, verify pass.**

- [ ] **Step 5: Commit**

```bash
git add src/atlas/tabs/FogTab.tsx src/test/tabs/FogTab.test.tsx
git commit -m "feat(fog): Fog tab — draw-fog tool, fog list, feather control"
```

### Task B3: `FogLayer` renders effective area + feather preview

**Files:**
- Modify: `src/atlas/fog/FogLayer.tsx`
- Test: `src/test/**` — add a focused test if FogLayer has one; otherwise rely on B1/A2 + the browser smoke in Phase D. (FogLayer is react-leaflet; prefer a small logic extraction over brittle DOM tests.)

- [ ] **Step 1:** Extract the "outer rect + holes" position math so conceals are added back as solid (un-revealed) polygons on top of reveals, and the DM dim uses the effective shape. Keep `playerMode` cosmetic only (real enforcement is the build, Phase D).
- [ ] **Step 2:** Manual: `npm run dev`, open a map, draw a reveal then a fog shape inside it — confirm the bite is re-fogged in the DM preview.
- [ ] **Step 3: Commit**

```bash
git add src/atlas/fog/FogLayer.tsx
git commit -m "feat(fog): FogLayer previews reveal-minus-conceal"
```

---

## Phase C — Player projection (data filtering only; safe to ship alone)

### Task C1: Extend `projectMapForPlayer` for routes/regions/nav

**Files:**
- Modify: `src/atlas/content/projectMapForPlayer.ts`
- Test: `src/test/content/projectMapForPlayer.test.ts` (extend; mirror existing `isFogged` fixture style)

The function already takes `isFogged(x,y)`. Callers will pass
`(x,y) => fog.enabled && !isLit(x,y,fog)` (wired in C2). This task adds the
route/region exclusion using the existing `isFogged`.

- [ ] **Step 1: Failing tests**

```ts
it("drops a route with any point in fog", () => {
  const routes = [{ id:"t1", visibility:"player",
    resolvedPoints:[[10,10],[90,90]] }] as never[]; // (90,90) is fogged
  const r = projectMapForPlayer({ placements:[], regions:[], routes,
    entitiesById, isFogged });
  expect(r.routes.length).toBe(0);
});
it("keeps a route entirely in the lit area", () => {
  const routes = [{ id:"t2", visibility:"player",
    resolvedPoints:[[10,10],[20,20]] }] as never[];
  const r = projectMapForPlayer({ placements:[], regions:[], routes,
    entitiesById, isFogged });
  expect(r.routes.map(x=>x.id)).toEqual(["t2"]);
});
it("drops a region with any vertex in fog", () => {
  const regions = [{ id:"r1", visibility:"player",
    points:[[10,10],[90,90],[10,90]] }] as never[];
  const r = projectMapForPlayer({ placements:[], regions, routes:[],
    entitiesById, isFogged });
  expect(r.regions.length).toBe(0);
});
```

- [ ] **Step 2: Run, verify fail** — `npx vitest run src/test/content/projectMapForPlayer.test.ts`.

- [ ] **Step 3: Implement** — after the existing visibility filter, also drop any route whose `resolvedPoints` (or resolved waypoints) has a point with `isFogged` true, and any region with any `points` vertex `isFogged`. Keep `foggedEntityIds` behavior. Use the route's resolved point list already present in the player pipeline (check the call site in `build-atlas.ts` for the exact field).

- [ ] **Step 4: Run, verify pass.**

- [ ] **Step 5: Commit**

```bash
git add src/atlas/content/projectMapForPlayer.ts src/test/content/projectMapForPlayer.test.ts
git commit -m "feat(fog): exclude routes/regions touching fog from player build"
```

### Task C2: Wire `isLit` into the build's `isFogged`

**Files:**
- Modify: `scripts/build-atlas.ts` (the player map projection call — grep `isFogged` / `projectMapForPlayer`)
- Test: `src/test/**` build-level fog test (extend `atlas-routes-fog.test.ts` or the build programmatic test)

- [ ] **Step 1: Failing test** — a player build of a fixture vault whose map has `fog.enabled` + one reveal: assert a player-visible pin outside the reveal is absent and `foggedEntityIds` contains it; a route crossing the fog is absent.

- [ ] **Step 2: Run, verify fail.**

- [ ] **Step 3: Implement** — at the player projection call, build `const fog = map.fog; const isFogged = (x,y) => !!fog?.enabled && !isLit(x,y,fog);` and pass it. Import `isLit` from `@/atlas/fog/effectiveLit`.

- [ ] **Step 4: Run, verify pass + `npm run atlas:publish` scans clean.**

- [ ] **Step 5: Commit**

```bash
git add scripts/build-atlas.ts src/test/atlas-routes-fog.test.ts
git commit -m "feat(fog): player build uses effective-lit for fog exclusion"
```

---

## Phase D — Build redaction + viewer (D and E ship together)

### Task D1: Add `sharp` build-only dependency

**Files:**
- Modify: `package.json` (`devDependencies`)

- [ ] **Step 1:** `npm install --save-dev sharp`
- [ ] **Step 2:** Verify it is under `devDependencies`, not `dependencies` (it must never enter the client bundle — it is only used in `scripts/`).
- [ ] **Step 3:** `npm run build` → confirm the player bundle still builds and `grep -r sharp dist/` returns nothing.
- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "build(fog): add sharp as build-only devDependency"
```

### Task D2: `redactFogMap` — mask one layer image

**Files:**
- Create: `scripts/atlas/redactFogMap.ts`
- Test: `src/test/fog/redactFogMap.test.ts` (uses `sharp` to read output alpha; dev env has it after D1)

- [ ] **Step 1: Failing test** — build a 100×100 solid-red PNG buffer via `sharp`, a fog with one reveal `sq(20,20,60,60)` and `featherPx:8`; call `redactLayer(buffer, {width:100,height:100}, fog, layerRect)`; assert: pixel (40,40) alpha ≈ 255 (lit), pixel (5,5) alpha === 0 (fogged), a pixel ~`featherPx` outside the reveal edge has 0 < alpha < 255 (soft band). (Read pixels with `sharp(out).raw().toBuffer`.)

- [ ] **Step 2: Run, verify fail** — module missing.

- [ ] **Step 3: Implement** — `redactLayer(imageBuffer, map:{width,height}, fog, layer:{x,y,width,height})`:
  - Build an SVG mask sized to the map: `<rect>` background black; each reveal polygon filled white; each conceal polygon filled black (painted after reveals); apply a Gaussian blur of radius `featherPx/2` to the mask so the edge feathers across ~`featherPx`.
  - Rasterize the mask with `sharp`, extract the region corresponding to `layer` rect, and use it as the alpha channel of the layer image (`sharp(image).joinChannel(maskAlpha)` / `.ensureAlpha()` then composite with `dest-in`).
  - Return a PNG buffer.
  - Throw `FogRedactionError` if `layer` is tiled (caller checks `tileSrc` and refuses earlier, but assert here too).

- [ ] **Step 4: Run, verify pass.**

- [ ] **Step 5: Commit**

```bash
git add scripts/atlas/redactFogMap.ts src/test/fog/redactFogMap.test.ts
git commit -m "feat(fog): redactLayer — feathered alpha mask via sharp"
```

### Task D3: Wire redaction into the player build

**Files:**
- Modify: `scripts/build-atlas.ts` (asset emit + map layer emit for player mode)
- Test: `src/test/fog/redactFogMap.test.ts` or a build-level test — assert the player build of a fog-enabled fixture writes `*.fog.png` assets, the player `atlas.json` map layer `src` points to them, the original layer file is absent from the output, and `reveals/conceals/featherPx/color` are stripped from that map's fog object (only `enabled:true` remains).

- [ ] **Step 1: Failing test.**
- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement** — in player mode, for each `map.fog?.enabled` map: for each raster layer, read source image, `redactLayer(...)`, write `<name>.fog.png` to the player asset dir, rewrite the player atlas layer `src`; do NOT copy the original layer image for these maps; tiled layer → fail the build with a clear message; strip geometry fields from the player fog object. Leave non-fog maps untouched.
- [ ] **Step 4: Run, verify pass + `npm run atlas:publish`.**
- [ ] **Step 5: Commit**

```bash
git add scripts/build-atlas.ts src/test/fog/redactFogMap.test.ts
git commit -m "feat(fog): player build ships redacted layers, strips fog geometry"
```

### Task D4: Player viewer — ocean fill + no toggle for fog-enabled maps

**Files:**
- Modify: the player map view (grep `oceanColor` and the published fog "eye"/toggle control; likely `src/atlas/AtlasViewer*` or the player map component)
- Test: extend the relevant viewer test (e.g. `src/test/content/projectMapForPlayer.test.ts` is data-only — add a viewer RTL test if a player map component test exists)

- [ ] **Step 1: Failing test** — for a fog-enabled map the published toggle control is not rendered; `oceanColor` is applied as the map background.
- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement** — when `map.fog?.enabled` in a player/published context, render `oceanColor` behind the (already-redacted) layers and do not render the fog toggle. Editor preview path unchanged.
- [ ] **Step 4: Run, verify pass.**
- [ ] **Step 5: Commit**

```bash
git commit -m "feat(fog): player viewer paints ocean, removes fog toggle when enabled"
```

---

## Phase E — Scan (ship with D)

### Task E1: `check-fog-safety` scanner

**Files:**
- Create: `scripts/check-fog-safety.ts` (mirror `scripts/check-derived-secrets.ts`: shebang, arg = artifact dir, exit codes, walk + read `atlas.json`)
- Modify: `package.json` scripts (`atlas:check-fog`) + the `atlas:publish` chain
- Test: `src/test/fog/check-fog-safety.test.ts` (fixture artifact dirs)

- [ ] **Step 1: Failing tests** — given a fixture player artifact: (a) clean fog-enabled map → exit 0; (b) original layer filename present in assets → non-zero with a fog-leak code; (c) `reveals` present in `atlas.json` for an enabled map → non-zero; (d) a player placement/route/region point inside fog (re-derived from DM source fog) → non-zero; (e) redacted PNG opaque at a known-fogged corner → non-zero.

- [ ] **Step 2: Run, verify fail.**

- [ ] **Step 3: Implement** the four assertions from the spec "Scan assertion" section. Choose distinct exit codes (e.g. 13 image-leak, 14 geometry-leak, 15 in-fog-content, 16 alpha-leak), documented in the file header like `check-no-secrets.ts`. Use `sharp` to sample alpha.

- [ ] **Step 4: Run, verify pass.**

- [ ] **Step 5: Wire into publish** — add `atlas:check-fog` to `package.json` and append it to the `atlas:publish` chain after `atlas:check-derived`. Run `npm run atlas:publish` → all scans clean.

- [ ] **Step 6: Commit**

```bash
git add scripts/check-fog-safety.ts package.json src/test/fog/check-fog-safety.test.ts
git commit -m "feat(fog): check-fog-safety scan wired into atlas:publish"
```

### Task E2: Docs + browser smoke + non-goal softening

**Files:**
- Modify: `docs/NON_GOALS.md` (soften per-party fog row to "deferred — see fog design"), `README.md` fog section, `docs/WORKFLOWS.md` fog row
- Modify: `docs/MARKDOWN_PARITY.md` — n/a (unrelated; do not touch)

- [ ] **Step 1:** Update docs to describe enforced fog + draw-fog + soft edge; soften the per-party non-goal to "deferred."
- [ ] **Step 2: Browser smoke (B4.5 — required, automated gates do not prove render):** `npm run atlas:build` (DM atlas) so the dev server serves editable content; `npm run dev`; in the editor draw a reveal + a fog bite + set feather; then build the player site and load it: confirm fog-enabled map shows ocean + soft-edged island, no eye toggle, fogged pin/route absent; confirm a fog-disabled map is unchanged. Do not Save test geometry into a real vault entity (use a throwaway map or discard).
- [ ] **Step 3: Commit**

```bash
git add docs/NON_GOALS.md README.md docs/WORKFLOWS.md
git commit -m "docs(fog): enforced fog mechanic, draw-fog, soft edge; soften per-party non-goal"
```

---

## Self-review (completed)

- **Spec coverage:** schema (A1), effective-lit incl. conceal-wins + feather-as-fogged (A2/A3), authoring incl. conceals + featherPx + YAML (B1/B2), DM preview (B3), routes/regions/nav exclusion (C1/C2), sharp dep (D1), feathered redaction (D2), build wiring + geometry strip + original-not-shipped (D3), ocean + no toggle (D4), four scan assertions + publish wiring (E1), docs + browser smoke + non-goal softening (E2). All spec sections mapped.
- **Placeholder scan:** UI tasks (B2/B3/C2/D4) intentionally instruct the executor to read the real component and assert against real prop names rather than fabricate component code that would drift from live types — concrete interfaces, file paths, test intents, and the non-obvious algorithms (effective-lit, redactLayer mask, scan) are given in full. Non-negotiable algorithm code is complete.
- **Type consistency:** `isLit`, `effectivePolygons`, `DEFAULT_FEATHER_PX`, `redactLayer`, `FogRedactionError`, `conceals`, `featherPx`, tool values `fog-polygon`/`fog-circle`, `setFeatherPx`, `removeConceal`/`clearConceals` consistent across tasks.
- **Ordering:** A→B→C independently shippable; D depends on A/C; E ships with D; the spec's "D+E same release, no insecure intermediate" rule is preserved (the published site's fog behavior changes only in D4).
