// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  breadcrumb,
  buildMapTree,
  childToParent,
  frameOutline,
  mapToOcean,
  oceanToMap,
  oceanZoomOffset,
  parentToChild,
  zoomOffset,
  type MapTree,
  type MapTreeNode,
} from "@/atlas/ocean/mapTree";
import type {
  AtlasProject,
  MapFrame,
  MapDocument,
  OceanPlacement,
  Point,
} from "@/atlas/content/schema";
import { makeMap, makeProject } from "../helpers/makeProject";

const frame = (over: Partial<MapFrame> = {}): MapFrame => ({
  x: 100,
  y: 50,
  width: 200,
  height: 100,
  rotation: 0,
  ...over,
});
const place = (map: string, over: Partial<OceanPlacement> = {}): OceanPlacement => ({
  map,
  x: 0,
  y: 0,
  scale: 1,
  rotation: 0,
  ...over,
});
const m = (id: string, over: Partial<MapDocument> = {}) =>
  makeMap({ id, name: id, width: 400, height: 200, ...over });

function v2(maps: MapDocument[], onOcean: OceanPlacement[]): AtlasProject {
  return makeProject({ maps, ocean: { width: 5000, height: 4000, sea: "default", onOcean } });
}
const ids = (nodes: MapTreeNode[]) => nodes.map((n) => n.map.id);

describe("buildMapTree: shape", () => {
  it("v2: roots in onOcean order, children in maps order, lookup by id", () => {
    const tree = buildMapTree(
      v2(
        [
          m("a"),
          m("c1", { parent: "a", frame: frame() }),
          m("b"),
          m("c2", { parent: "a", frame: frame() }),
          m("g", { parent: "c1", frame: frame() }),
        ],
        [place("b", { x: 7 }), place("a")],
      ),
    );
    expect(tree.ocean).toEqual({ width: 5000, height: 4000, sea: "default" });
    expect(ids(tree.roots)).toEqual(["b", "a"]);
    expect(tree.roots[0].placement?.x).toBe(7);
    expect(ids(tree.byId.get("a")!.children)).toEqual(["c1", "c2"]);
    expect(ids(tree.byId.get("c1")!.children)).toEqual(["g"]);
    expect(tree.byId.get("g")!.parentId).toBe("c1");
    expect(tree.byId.get("c1")!.placement).toBeNull();
    expect(tree.dropped).toEqual([]);
    expect(tree.warnings).toEqual([]);
  });

  it("v1: no ocean, every map top-level in maps order", () => {
    const tree = buildMapTree(makeProject({ maps: [m("z"), m("a"), m("q", { parent: "z" })] }));
    expect(tree.ocean).toBeNull();
    expect(ids(tree.roots)).toEqual(["z", "a", "q"]);
    expect(tree.roots.every((r) => r.placement === null && r.children.length === 0)).toBe(true);
    expect(tree.dropped).toEqual([]);
  });
});

describe("buildMapTree: fails closed, never throws", () => {
  const dropped = (p: AtlasProject) => buildMapTree(p).dropped;

  it("drops a map whose parent is not in the project, with its subtree", () => {
    const p = v2(
      [
        m("a"),
        m("orphan", { parent: "ghost", frame: frame() }),
        m("kid", { parent: "orphan", frame: frame() }),
      ],
      [place("a")],
    );
    const tree = buildMapTree(p);
    expect(tree.dropped).toEqual(["orphan", "kid"]);
    expect(tree.byId.has("orphan")).toBe(false);
  });

  it("drops a child with no frame, with its subtree", () => {
    const p = v2(
      [m("a"), m("c", { parent: "a" }), m("g", { parent: "c", frame: frame() })],
      [place("a")],
    );
    expect(dropped(p)).toEqual(["c", "g"]);
  });

  it.each([
    ["zero width", { width: 0 }],
    ["negative height", { height: -5 }],
    ["NaN x", { x: NaN }],
    ["infinite rotation", { rotation: Infinity }],
  ])("drops a child whose frame frameQuads rejects (%s)", (_n, bad) => {
    const p = v2([m("a"), m("c", { parent: "a", frame: frame(bad) })], [place("a")]);
    expect(dropped(p)).toEqual(["c"]);
  });

  it("drops a cycle (never reached from the ocean)", () => {
    const p = v2(
      [
        m("a"),
        m("x", { parent: "y", frame: frame() }),
        m("y", { parent: "x", frame: frame() }),
        m("self", { parent: "self", frame: frame() }),
      ],
      [place("a")],
    );
    expect(dropped(p)).toEqual(["x", "y", "self"]);
  });

  it("drops a v2 top-level map missing from onOcean, with its subtree", () => {
    const p = v2([m("a"), m("lost"), m("c", { parent: "lost", frame: frame() })], [place("a")]);
    expect(dropped(p)).toEqual(["lost", "c"]);
  });

  it("ignores an onOcean entry naming an unknown map (not reported)", () => {
    const tree = buildMapTree(v2([m("a")], [place("ghost"), place("a")]));
    expect(ids(tree.roots)).toEqual(["a"]);
    expect(tree.dropped).toEqual([]);
  });

  it("ignores a repeated onOcean entry (first wins) and an entry naming a child", () => {
    const p = v2(
      [m("a"), m("c", { parent: "a", frame: frame() })],
      [place("a", { x: 1 }), place("a", { x: 2 }), place("c")],
    );
    const tree = buildMapTree(p);
    expect(ids(tree.roots)).toEqual(["a"]);
    expect(tree.roots[0].placement?.x).toBe(1);
    expect(tree.byId.get("c")!.placement).toBeNull();
  });

  it("drops a top-level map with an unusable placement or size", () => {
    const p = v2(
      [m("a"), m("b"), m("flat", { width: 0 })],
      [place("a", { scale: 0 }), place("b"), place("flat")],
    );
    expect(dropped(p)).toEqual(["a", "flat"]);
  });

  it("drops a map reusing an id", () => {
    const p = v2([m("a"), m("a", { name: "second" })], [place("a")]);
    const tree = buildMapTree(p);
    expect(tree.byId.get("a")!.map.name).toBe("a");
    expect(tree.dropped).toEqual(["a"]);
  });
});

describe("buildMapTree: aspect warnings", () => {
  it("warns when frame and child aspect differ by more than 1%", () => {
    const p = v2(
      [m("a"), m("c", { parent: "a", frame: frame({ width: 200, height: 120 }) })],
      [place("a")],
    );
    const tree = buildMapTree(p);
    expect(tree.warnings).toHaveLength(1);
    expect(tree.warnings[0]).toMatchObject({ mapId: "c", kind: "aspect-mismatch" });
    expect(ids(tree.byId.get("a")!.children)).toEqual(["c"]); // kept
  });

  it("does not warn within 1%", () => {
    const p = v2(
      [m("a"), m("c", { parent: "a", frame: frame({ width: 200, height: 100.5 }) })],
      [place("a")],
    );
    expect(buildMapTree(p).warnings).toEqual([]);
  });
});

describe("breadcrumb", () => {
  const tree: MapTree = buildMapTree(
    v2(
      [m("a"), m("c", { parent: "a", frame: frame() }), m("g", { parent: "c", frame: frame() })],
      [place("a")],
    ),
  );
  const label = (items: ReturnType<typeof breadcrumb>) =>
    items.map((i) => (i.kind === "ocean" ? "ocean" : i.map.id));

  it("v2: ocean > top-level > ... > map", () => {
    expect(label(breadcrumb(tree, "g"))).toEqual(["ocean", "a", "c", "g"]);
    expect(label(breadcrumb(tree, "a"))).toEqual(["ocean", "a"]);
  });
  it("v1: no ocean", () => {
    expect(label(breadcrumb(buildMapTree(makeProject({ maps: [m("a")] })), "a"))).toEqual(["a"]);
  });
  it("an id not in the tree gives an empty chain", () => {
    expect(breadcrumb(tree, "nope")).toEqual([]);
  });
});

const close = (a: Point, b: Point) => {
  expect(a[0]).toBeCloseTo(b[0], 6);
  expect(a[1]).toBeCloseTo(b[1], 6);
};
const POINTS: Point[] = [
  [0, 0],
  [400, 200],
  [123.5, 77.25],
  [-30, 260],
];

describe("frame geometry", () => {
  const child = { width: 400, height: 200 };

  it("unrotated: corners land on the frame corners", () => {
    const f = frame();
    close(childToParent(f, child, [0, 0]), [100, 50]);
    close(childToParent(f, child, [400, 200]), [300, 150]);
    close(childToParent(f, child, [200, 100]), [200, 100]);
  });

  it("rotation is clockwise on screen about the frame centre", () => {
    const f = frame({ rotation: 90 });
    // centre (200,100); child's right-middle (400,100) is 100 right of centre -> 100 below centre... in frame px: (300,100)
    close(childToParent(f, child, [200, 100]), [200, 100]);
    close(childToParent(f, child, [400, 100]), [200, 200]);
    close(childToParent(f, child, [0, 100]), [200, 0]);
  });

  it.each([0, 30, 90, 180, -45, 359])("round trip at rotation %i", (rotation) => {
    const f = frame({ rotation });
    for (const p of POINTS) {
      close(parentToChild(f, child, childToParent(f, child, p)), p);
      close(childToParent(f, child, parentToChild(f, child, p)), p);
    }
  });

  it("round trip with a non-uniform scale (aspect mismatch)", () => {
    const f = frame({ width: 200, height: 120, rotation: 20 });
    for (const p of POINTS) close(parentToChild(f, child, childToParent(f, child, p)), p);
  });

  it("frameOutline: the centre-pivot quad, equal to the mapped child corners", () => {
    for (const rotation of [0, 25, 90]) {
      const f = frame({ rotation });
      const out = frameOutline(f)!;
      expect(out).toHaveLength(4);
      const corners: Point[] = [
        [0, 0],
        [400, 0],
        [400, 200],
        [0, 200],
      ];
      corners.forEach((c, i) => close(out[i], childToParent(f, child, c)));
    }
  });

  it("frameOutline: null for a frame the resolver rejects", () => {
    expect(frameOutline(frame({ width: 0 }))).toBeNull();
  });

  it("zoomOffset: log2 of the frame width over the child width", () => {
    expect(zoomOffset(child, frame({ width: 200 }))).toBeCloseTo(-1);
    expect(zoomOffset(child, frame({ width: 800 }))).toBeCloseTo(1);
    expect(zoomOffset(child, frame({ width: 400 }))).toBeCloseTo(0);
    // aspect mismatch: width ratio still wins
    expect(zoomOffset(child, frame({ width: 200, height: 999 }))).toBeCloseTo(-1);
  });

  it("zoomOffset agrees with the point maths: 1 child px = 2^offset parent px inverse", () => {
    const f = frame({ width: 100, height: 50, rotation: 33 });
    const a = childToParent(f, child, [0, 0]);
    const b = childToParent(f, child, [1, 0]);
    const parentPxPerChildPx = Math.hypot(b[0] - a[0], b[1] - a[1]);
    expect(Math.log2(parentPxPerChildPx)).toBeCloseTo(zoomOffset(child, f));
  });
});

describe("rotated fixtures: a frame at 30 degrees", () => {
  const child = { width: 400, height: 200 };
  const f = frame({ x: 100, y: 50, width: 200, height: 100, rotation: 30 });
  const c = [200, 100] as Point; // frame centre
  const r = Math.PI / 6;

  it("the child's corners are the unrotated frame corners turned 30 deg clockwise about the centre", () => {
    const out = frameOutline(f)!;
    const rect: Point[] = [
      [100, 50],
      [300, 50],
      [300, 150],
      [100, 150],
    ];
    rect.forEach(([x, y], i) => {
      const dx = x - c[0];
      const dy = y - c[1];
      close(out[i], [
        c[0] + dx * Math.cos(r) - dy * Math.sin(r),
        c[1] + dx * Math.sin(r) + dy * Math.cos(r),
      ]);
    });
    // clockwise on screen: the top-right corner moves down
    expect(out[1][1]).toBeGreaterThan(50);
  });

  it("round trips every sample point and matches the outline corners", () => {
    for (const p of POINTS) close(parentToChild(f, child, childToParent(f, child, p)), p);
    close(childToParent(f, child, [0, 0]), frameOutline(f)![0]);
    close(childToParent(f, child, [400, 200]), frameOutline(f)![2]);
    close(childToParent(f, child, [200, 100]), c);
  });
});

describe("rotated fixtures: an ocean placement at 15 degrees", () => {
  const map = { width: 400, height: 200 };
  const pl = place("a", { x: 500, y: 300, scale: 2, rotation: 15 });

  it("the map's centre stays at the scaled rectangle's centre; the top-left turns clockwise about it", () => {
    close(mapToOcean(pl, map, [200, 100]), [900, 500]);
    const r = Math.PI / 12;
    const dx = -400;
    const dy = -200;
    close(mapToOcean(pl, map, [0, 0]), [
      900 + dx * Math.cos(r) - dy * Math.sin(r),
      500 + dx * Math.sin(r) + dy * Math.cos(r),
    ]);
  });

  it("round trips every sample point", () => {
    for (const p of POINTS) close(oceanToMap(pl, map, mapToOcean(pl, map, p)), p);
  });

  it("a map inside a rotated frame inside a rotated ocean placement composes and inverts", () => {
    const f = frame({ rotation: 30 });
    const child = { width: 400, height: 200 };
    for (const p of POINTS) {
      const onOcean = mapToOcean(pl, map, childToParent(f, child, p));
      close(parentToChild(f, child, oceanToMap(pl, map, onOcean)), p);
    }
  });
});

describe("ocean geometry", () => {
  const map = { width: 400, height: 200 };

  it("unrotated: top-left of the scaled map, scale multiplies pixels", () => {
    const pl = place("a", { x: 1000, y: 500, scale: 2 });
    close(mapToOcean(pl, map, [0, 0]), [1000, 500]);
    close(mapToOcean(pl, map, [400, 200]), [1800, 900]);
  });

  it("rotation is clockwise about the scaled map's centre", () => {
    const pl = place("a", { x: 0, y: 0, scale: 2, rotation: 90 });
    // scaled 800x400, centre (400,200); map right-middle (400,100) -> scaled (800,200) -> 400 right of centre -> below centre
    close(mapToOcean(pl, map, [200, 100]), [400, 200]);
    close(mapToOcean(pl, map, [400, 100]), [400, 600]);
  });

  it.each([0, 30, 90, -120, 270])("round trip at rotation %i", (rotation) => {
    const pl = place("a", { x: 321, y: -45, scale: 1.5, rotation });
    for (const p of POINTS) {
      close(oceanToMap(pl, map, mapToOcean(pl, map, p)), p);
      close(mapToOcean(pl, map, oceanToMap(pl, map, p)), p);
    }
  });

  it("oceanZoomOffset: log2 of scale", () => {
    expect(oceanZoomOffset(map, place("a", { scale: 2 }))).toBeCloseTo(1);
    expect(oceanZoomOffset(map, place("a", { scale: 0.25 }))).toBeCloseTo(-2);
    expect(oceanZoomOffset(map, place("a", { scale: 1 }))).toBeCloseTo(0);
  });
});
