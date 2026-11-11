// @vitest-environment node
/**
 * R-32: the zoom handoff rule on small trees. The test world runs in
 * mapTree-build.test.ts.
 *
 * Tree (viewport 800 x 600 unless a test says otherwise):
 * - ocean 5000 x 4000; top-level `a` (400 x 200, zoom -3..3) at (1000, 1000),
 *   scale 2: offset +1, entered from the ocean by the fill rule at
 *   log2(600 / 400) = 0.585 (ocean zoom).
 * - `c` in `a`: frame 200 x 100 at (100, 50), map 400 x 200 (offset -1),
 *   enterZoom 3, zoom -1..3. Lands at zoom 2. (A fill entry from the ocean
 *   lands on `a` at 1.585, so c's enter zoom is clamped to at least 2.085.)
 * - `g` in `c`: frame 100 x 50 at (150, 75), map 400 x 200 (offset -2), no
 *   enterZoom (fill rule: log2(600 / 50) = 3.585 on c, landing 1.585) and no
 *   zoom range.
 */
import { describe, expect, it } from "vitest";
import { buildMapTree, childToParent, mapToOcean, type MapTree } from "@/atlas/ocean/mapTree";
import {
  HANDOFF_MARGIN,
  enterZoom,
  leaveZoom,
  nextView,
  type TreeView,
  type ViewCamera,
  type Viewport,
} from "@/atlas/ocean/zoomHandoff";
import type {
  AtlasProject,
  MapDocument,
  MapFrame,
  OceanPlacement,
  Point,
} from "@/atlas/content/schema";
import { makeMap, makeProject } from "../helpers/makeProject";
import { start, zoomBy, zoomUntil } from "../helpers/zoomDriver";

const VP: Viewport = { width: 800, height: 600 };
const M = HANDOFF_MARGIN;
const OCEAN: TreeView = { kind: "ocean" };
const at = (mapId: string): TreeView => ({ kind: "map", mapId });

const m = (id: string, over: Partial<MapDocument> = {}) =>
  makeMap({ id, name: id, width: 400, height: 200, ...over });
const frame = (over: Partial<MapFrame> = {}): MapFrame => ({
  x: 100,
  y: 50,
  width: 200,
  height: 100,
  rotation: 0,
  ...over,
});
const placeA: OceanPlacement = { map: "a", x: 1000, y: 1000, scale: 2, rotation: 0 };

function project(
  over: { a?: Partial<MapDocument>; c?: Partial<MapDocument>; g?: Partial<MapDocument> } = {},
  placement: OceanPlacement = placeA,
): AtlasProject {
  return makeProject({
    maps: [
      m("a", { zoom: { min: -3, max: 3 }, ...over.a }),
      m("c", { parent: "a", frame: frame(), enterZoom: 3, zoom: { min: -1, max: 3 }, ...over.c }),
      m("g", { parent: "c", frame: frame({ x: 150, y: 75, width: 100, height: 50 }), ...over.g }),
    ],
    ocean: { width: 5000, height: 4000, sea: "default", onOcean: [placement] },
  });
}
const tree = (...args: Parameters<typeof project>) => buildMapTree(project(...args));

const cam = (center: Point, zoom: number): ViewCamera => ({ center, zoom });
const stays = (t: MapTree, v: TreeView, c: ViewCamera, vp = VP) =>
  nextView(t, v, c, vp).kind === "stay";

/** The handoff's view and camera; fails the test on "stay". */
function handoff(t: MapTree, v: TreeView, c: ViewCamera, vp = VP) {
  const r = nextView(t, v, c, vp);
  if (r.kind !== "handoff") throw new Error("expected a handoff");
  return r;
}

// Ocean point of c's centre (c-centre in a: frame centre (200, 100)).
const A_C_CENTRE: Point = [200, 100];
const oceanOf = (p: Point): Point => mapToOcean(placeA, { width: 400, height: 200 }, p);

describe("nextView: entering", () => {
  it("enters a child at its enterZoom with the centre in its frame, on the same ground", () => {
    const t = tree();
    expect(stays(t, at("a"), cam(A_C_CENTRE, 2.99))).toBe(true);
    const r = handoff(t, at("a"), cam(A_C_CENTRE, 3));
    expect(r.view).toEqual(at("c"));
    expect(r.camera.zoom).toBeCloseTo(2, 12); // 3 + log2(200 / 400)
    expect(r.camera.center[0]).toBeCloseTo(200, 9);
    expect(r.camera.center[1]).toBeCloseTo(100, 9);
    // Centre outside the frame: no matter how far in.
    expect(stays(t, at("a"), cam([50, 20], 3))).toBe(true);
  });

  it("enters a child with no enterZoom when its frame fills the viewport's shorter side", () => {
    const t = tree();
    const fill = Math.log2(600 / 50);
    expect(enterZoom(t, t.byId.get("g")!, VP)).toBeCloseTo(fill, 12);
    expect(stays(t, at("c"), cam(A_C_CENTRE, fill - 0.01))).toBe(true);
    const r = handoff(t, at("c"), cam(A_C_CENTRE, fill));
    expect(r.view).toEqual(at("g"));
    expect(r.camera.zoom).toBeCloseTo(fill - 2, 12);
    // A portrait viewport: its shorter side is the width.
    expect(enterZoom(t, t.byId.get("g")!, { width: 500, height: 900 })).toBeCloseTo(
      Math.log2(500 / 50),
      12,
    );
  });

  it("enters a top-level map from the ocean by the fill rule (the ocean has no enterZoom)", () => {
    const t = tree();
    const fill = Math.log2(600 / 400); // a is 800 x 400 on the ocean
    const p = oceanOf([300, 150]);
    expect(stays(t, OCEAN, cam(p, fill - 0.01))).toBe(true);
    const r = handoff(t, OCEAN, cam(p, fill));
    expect(r.view).toEqual(at("a"));
    expect(r.camera.zoom).toBeCloseTo(fill + 1, 12);
    expect(r.camera.center[0]).toBeCloseTo(300, 9);
    expect(r.camera.center[1]).toBeCloseTo(150, 9);
    // Off the map, on open sea: stays on the ocean.
    expect(stays(t, OCEAN, cam([100, 100], 4))).toBe(true);
  });

  it("clamps a child's enter zoom to M above where a zoom entry lands on its parent", () => {
    // c says 1, but a zoom entry from the ocean lands on a at 1.585: entering c
    // at 1 would skip a on the way in.
    const t = tree({ c: { enterZoom: 1 } });
    const landingOnA = Math.log2(600 / 200);
    expect(enterZoom(t, t.byId.get("c")!, VP)).toBeCloseTo(landingOnA + M, 12);
    const r = handoff(t, OCEAN, cam(oceanOf(A_C_CENTRE), Math.log2(600 / 400)));
    expect(r.view).toEqual(at("a"));
    expect(stays(t, r.view, r.camera)).toBe(true);
    expect(stays(t, at("a"), cam(A_C_CENTRE, landingOnA + M - 0.01))).toBe(true);
    expect(handoff(t, at("a"), cam(A_C_CENTRE, landingOnA + M)).view).toEqual(at("c"));
  });

  it("chains one big zoom through several levels, and the landing is left alone", () => {
    const t = tree();
    const p = oceanOf([200, 100]); // the centre of c and of g
    const r = handoff(t, OCEAN, cam(p, 5));
    expect(r.view).toEqual(at("g"));
    expect(r.camera.zoom).toBeCloseTo(5 + 1 - 1 - 2, 12);
    expect(stays(t, r.view, r.camera)).toBe(true);
  });
});

describe("nextView: leaving", () => {
  it("leaves to the parent below zoom.min, and to the ocean from a top-level map", () => {
    const t = tree();
    expect(leaveZoom(t, t.byId.get("c")!, VP)).toBe(-1);
    expect(stays(t, at("c"), cam([200, 100], -1))).toBe(true);
    const up = handoff(t, at("c"), cam([200, 100], -1.01));
    expect(up.view).toEqual(at("a"));
    expect(up.camera.zoom).toBeCloseTo(-0.01, 12);
    expect(up.camera.center).toEqual(
      childToParent(frame(), { width: 400, height: 200 }, [200, 100]),
    );

    expect(leaveZoom(t, t.byId.get("a")!, VP)).toBe(-3);
    const out = handoff(t, at("a"), cam([300, 150], -3.5));
    expect(out.view).toEqual(OCEAN);
    expect(out.camera.zoom).toBeCloseTo(-4.5, 12);
    expect(out.camera.center[0]).toBeCloseTo(oceanOf([300, 150])[0], 9);
    expect(out.camera.center[1]).toBeCloseTo(oceanOf([300, 150])[1], 9);
  });

  it("with no zoom range, leaves half a level below the fitted zoom", () => {
    const t = tree();
    const fit = Math.log2(Math.min(800 / 400, 600 / 200)); // 1
    expect(leaveZoom(t, t.byId.get("g")!, VP)).toBeCloseTo(fit - M, 12);
    expect(stays(t, at("g"), cam([200, 100], fit - M))).toBe(true);
    expect(handoff(t, at("g"), cam([200, 100], fit - M - 0.01)).view).toEqual(at("c"));
  });

  it("an authored zoom.min above the enter landing is clamped: the leave moves down", () => {
    // g entered at 2.6 lands at 0.6 (below its fit, 1) but says min 0.4: the
    // viewer leaves only below 0.6 - M.
    const t = tree({ g: { enterZoom: 2.6, zoom: { min: 0.4, max: 3 } } });
    expect(leaveZoom(t, t.byId.get("g")!, VP)).toBeCloseTo(0.6 - M, 12);
    const r = handoff(t, at("c"), cam([200, 100], 2.6));
    expect(r.view).toEqual(at("g"));
    expect(r.camera.zoom).toBeCloseTo(0.6, 12);
    expect(stays(t, r.view, cam(r.camera.center, 0.6 - M + 0.01))).toBe(true);
  });

  it("a zoom.min above the fitted zoom is clamped too, so a click enter (fitted) stays", () => {
    const t = tree({ c: { zoom: { min: 2, max: 3 }, enterZoom: 4 } });
    const fit = Math.log2(Math.min(800 / 400, 600 / 200));
    expect(leaveZoom(t, t.byId.get("c")!, VP)).toBeCloseTo(fit - M, 12);
    expect(stays(t, at("c"), cam([200, 100], fit))).toBe(true);
  });

  it("a v1 tree (no ocean) never leaves its top-level map", () => {
    const t = buildMapTree(makeProject({ maps: [m("a", { zoom: { min: 0, max: 3 } })] }));
    expect(t.ocean).toBeNull();
    expect(leaveZoom(t, t.byId.get("a")!, VP)).toBe(-Infinity);
    expect(stays(t, at("a"), cam([200, 100], -40))).toBe(true);
    expect(stays(t, at("a"), cam([200, 100], 40))).toBe(true);
    expect(stays(t, OCEAN, cam([200, 100], 0))).toBe(true);
  });
});

describe("nextView: hysteresis", () => {
  it("no flapping: wiggling a quarter level at each threshold hands off once", () => {
    const t = tree();
    const p = oceanOf([200, 100]);
    let s = start(OCEAN, cam(p, -2));
    const wiggle = () => {
      const before = s.handoffs;
      for (let i = 0; i < 6; i++) s = zoomBy(t, s, i % 2 ? 0.25 : -0.25, VP);
      for (let i = 0; i < 6; i++) s = zoomBy(t, s, i % 2 ? -0.25 : 0.25, VP);
      expect(s.handoffs, `wiggle at ${s.trail.at(-1)}`).toBe(before);
    };
    for (const target of ["a", "c", "g"]) {
      const n = s.handoffs;
      s = zoomUntil(t, s, 0.05, VP, (d) => d.handoffs > n);
      expect(s.trail.at(-1)).toBe(target);
      wiggle();
    }
    for (const target of ["c", "a", "ocean"]) {
      const n = s.handoffs;
      s = zoomUntil(t, s, -0.05, VP, (d) => d.handoffs > n);
      expect(s.trail.at(-1)).toBe(target);
      wiggle();
    }
    expect(s.trail).toEqual(["ocean", "a", "c", "g", "c", "a", "ocean"]);
    expect(s.handoffs).toBe(6);
  });

  it("every handoff lands strictly inside the new view: at least M from the way back", () => {
    const t = tree();
    const check = (v: TreeView, c: ViewCamera) => {
      const r = handoff(t, v, c);
      expect(stays(t, r.view, r.camera)).toBe(true);
      if (r.view.kind === "map") {
        const node = t.byId.get(r.view.mapId)!;
        // Entered: at least M above the leave zoom.
        if (v.kind === "ocean" || node.parentId === (v.kind === "map" ? v.mapId : null)) {
          expect(r.camera.zoom - leaveZoom(t, node, VP)).toBeGreaterThanOrEqual(M - 1e-9);
        }
      }
      return r;
    };
    check(OCEAN, cam(oceanOf([200, 100]), Math.log2(1.5)));
    check(at("a"), cam(A_C_CENTRE, 3));
    check(at("c"), cam([200, 100], Math.log2(12)));
    // Leaving lands more than M below the child's enter zoom.
    const up = check(at("c"), cam([200, 100], -1.01));
    expect(enterZoom(t, t.byId.get("c")!, VP)! - up.camera.zoom).toBeGreaterThan(M);
  });
});

describe("nextView: rotation", () => {
  it("enters a rotated frame by its outline, not its unrotated box", () => {
    // Turned 90 degrees about its centre (200, 100): it spans x 150..250, y 0..200.
    const t = tree({ c: { frame: frame({ rotation: 90 }) } });
    const r = handoff(t, at("a"), cam([200, 20], 3));
    expect(r.view).toEqual(at("c"));
    expect(stays(t, at("a"), cam([120, 100], 3))).toBe(true); // in the box, outside the turn
    // Same ground: back to the parent lands on the same parent point.
    const back = handoff(t, r.view, cam(r.camera.center, -2));
    expect(back.camera.center[0]).toBeCloseTo(200, 9);
    expect(back.camera.center[1]).toBeCloseTo(20, 9);
  });

  it("enters a rotated ocean placement by its outline", () => {
    const placed = { ...placeA, rotation: 90 };
    const t = tree({}, placed);
    // a is 800 x 400 on the ocean, centre (1400, 1200); turned it spans x 1200..1600, y 800..1600.
    expect(nextView(t, OCEAN, cam([1400, 850], 2), VP)).toMatchObject({
      kind: "handoff",
      view: at("a"),
    });
    expect(stays(t, OCEAN, cam([1050, 1200], 2))).toBe(true);
  });
});

describe("nextView: a click enter, direction and zoom limits (R-32 review)", () => {
  // The review's repro: b is 1000 x 1000 in a 200 x 200 frame on a 2000 x 2000
  // root, enterZoom -1; c is a child of b over b's centre, enterZoom -1.
  // A click enter lands b fitted (log2(800 / 1000) = -0.32 on 800 x 800).
  const VP8: Viewport = { width: 800, height: 800 };
  const big = () =>
    buildMapTree(
      makeProject({
        maps: [
          m("r", { width: 2000, height: 2000 }),
          m("b", {
            parent: "r",
            width: 1000,
            height: 1000,
            frame: frame({ x: 900, y: 900, width: 200, height: 200 }),
            enterZoom: -1,
          }),
          m("c", {
            parent: "b",
            width: 1000,
            height: 1000,
            frame: frame({ x: 400, y: 400, width: 200, height: 200 }),
            enterZoom: -1,
          }),
        ],
        ocean: {
          width: 5000,
          height: 5000,
          sea: "default",
          onOcean: [{ map: "r", x: 0, y: 0, scale: 1, rotation: 0 }],
        },
      }),
    );

  it("clamps a child's enter zoom to M above its parent's fitted zoom too", () => {
    const t = big();
    const fitB = Math.log2(800 / 1000);
    expect(enterZoom(t, t.byId.get("c")!, VP8)).toBeCloseTo(fitB + M, 9);
  });

  it("click-enter, then zoom out a step: stays (the review's repro)", () => {
    const t = big();
    const fitB = Math.log2(800 / 1000);
    const c = cam([500, 500], -0.5);
    expect(c.zoom).toBeLessThan(fitB);
    expect(stays(t, at("b"), c, VP8)).toBe(true);
    expect(nextView(t, at("b"), c, VP8, { direction: "out" }).kind).toBe("stay");
  });

  it("a zoom out never enters and a zoom in never leaves", () => {
    const t = tree();
    // Past c's enter zoom with the centre in c's frame, but going out.
    const inC = cam([200, 100], 3.5);
    expect(nextView(t, at("a"), inC, VP).kind).toBe("handoff");
    expect(nextView(t, at("a"), inC, VP, { direction: "out" }).kind).toBe("stay");
    // Below c's leave zoom, but going in.
    const low = cam([200, 100], -5);
    expect(nextView(t, at("c"), low, VP).kind).toBe("handoff");
    expect(nextView(t, at("c"), low, VP, { direction: "in" }).kind).toBe("stay");
  });

  it("the canvas's zoom limits: an enter past the max zoom is lowered to it", () => {
    const t = tree({ c: { enterZoom: 6 } });
    const c = t.byId.get("c")!;
    expect(enterZoom(t, c, VP)).toBe(6);
    expect(enterZoom(t, c, VP, { maxZoom: 4 })).toBe(4);
    const r = nextView(t, at("a"), cam([200, 100], 4), VP, { maxZoom: 4 });
    expect(r.kind === "handoff" && r.view).toEqual(at("c"));
  });

  it("the canvas's zoom limits: a leave below the min zoom is raised just above it", () => {
    const t = tree({ c: { zoom: { min: -9, max: 3 } } });
    const c = t.byId.get("c")!;
    expect(leaveZoom(t, c, VP)).toBe(-9);
    const lifted = leaveZoom(t, c, VP, { minZoom: -6 });
    expect(lifted).toBeGreaterThan(-6);
    expect(lifted).toBeLessThan(-5.99);
    expect(nextView(t, at("c"), cam([200, 100], -6), VP, { minZoom: -6 }).kind).toBe("handoff");
    // A map that can't be left stays unleavable.
    const v1 = buildMapTree(makeProject({ maps: [m("solo")] }));
    expect(leaveZoom(v1, v1.byId.get("solo")!, VP, { minZoom: -6 })).toBe(-Infinity);
  });
});

describe("nextView: what it can't show stays", () => {
  it("an unknown map, a map left out of the tree, a bad camera or an empty viewport", () => {
    const t = buildMapTree(
      makeProject({
        maps: [
          m("a", { zoom: { min: -3, max: 3 } }),
          m("lost", { parent: "nowhere", frame: frame(), enterZoom: 0 }),
        ],
        ocean: { width: 5000, height: 4000, sea: "default", onOcean: [placeA] },
      }),
    );
    expect(t.dropped).toEqual(["lost"]);
    expect(stays(t, at("ghost"), cam([0, 0], -10))).toBe(true);
    expect(stays(t, at("lost"), cam([0, 0], -10))).toBe(true);
    expect(stays(t, at("a"), cam([NaN, 0], -10))).toBe(true);
    expect(stays(t, at("a"), cam([0, 0], Infinity))).toBe(true);
    expect(stays(t, at("a"), cam([0, 0], -10), { width: 0, height: 600 })).toBe(true);
    // A child left out of the tree is never entered.
    const full = tree();
    const noC = buildMapTree({
      ...project(),
      maps: project().maps.filter((x) => x.id !== "c"),
    });
    expect(handoff(full, at("a"), cam(A_C_CENTRE, 3)).view).toEqual(at("c"));
    expect(stays(noC, at("a"), cam(A_C_CENTRE, 5))).toBe(true);
  });
});
