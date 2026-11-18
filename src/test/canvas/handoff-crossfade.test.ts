/**
 * P-05, the soft handoff's placement maths (pure): at a zoom handoff the
 * child map's picture lands exactly where its frame was on screen (zooming in
 * by the centre or by the zoom's anchor), the parent's picture lands around
 * the child on the way out, and the ghost (the old screen, placed in the new
 * view's pixels) covers exactly the screen at the handed-over camera and stays
 * registered with the new view's pictures if Leaflet clamps the zoom.
 */
import { describe, expect, it } from "vitest";
import type { AtlasProject } from "@/atlas/content/schema";
import { buildMapTree } from "@/atlas/ocean/mapTree";
import { nextView, type ViewCamera } from "@/atlas/ocean/zoomHandoff";
import { ghostBox, screenRect } from "@/atlas/canvas/handoffGhost";
import { anchoredHandoff, zoomAnchor } from "@/atlas/canvas/zoomAnchor";
import type { Box } from "@/atlas/canvas/canvasGeometry";

// The isle (600x400 at ocean (200,300), scale 1) holds the cove (400x300) in
// the frame (150,100)-(250,175): the cove is 4x denser, so cove zoom = isle - 2.
const PROJECT = {
  schemaVersion: 2,
  maps: [
    { id: "isle", name: "Isle", width: 600, height: 400, layers: [] },
    {
      id: "cove",
      name: "Cove",
      width: 400,
      height: 300,
      layers: [],
      parent: "isle",
      frame: { x: 150, y: 100, width: 100, height: 75, rotation: 0 },
      enterZoom: 2,
    },
  ],
  ocean: {
    width: 3000,
    height: 2000,
    sea: "default",
    onOcean: [{ map: "isle", x: 200, y: 300, scale: 1, rotation: 0 }],
  },
} as unknown as AtlasProject;
const tree = buildMapTree(PROJECT);
const SIZE = { x: 800, y: 600 };
const VP = { width: SIZE.x, height: SIZE.y };
const ISLE = { kind: "map", mapId: "isle" } as const;
const COVE = { kind: "map", mapId: "cove" } as const;
const OCEAN = { kind: "ocean" } as const;
const FRAME: Box = { minX: 150, minY: 100, maxX: 250, maxY: 175 };
const COVE_BOX: Box = { minX: 0, minY: 0, maxX: 400, maxY: 300 };
const ISLE_BOX: Box = { minX: 0, minY: 0, maxX: 600, maxY: 400 };
const ISLE_ON_OCEAN: Box = { minX: 200, minY: 300, maxX: 800, maxY: 700 };

const expectRect = (a: number[], b: number[]) => {
  expect(a).toHaveLength(4);
  a.forEach((v, i) => expect(v).toBeCloseTo(b[i], 6));
};

function handoff(
  view: typeof ISLE | typeof COVE | typeof OCEAN,
  camera: ViewCamera,
  dir: "in" | "out",
) {
  const r = nextView(tree, view, camera, VP, { direction: dir, minZoom: -6, maxZoom: 4 });
  if (r.kind !== "handoff") throw new Error("expected a handoff");
  return r;
}

describe("P-05 placement: the new picture lands where the old one showed it", () => {
  it("zooming in by the centre, the cove's picture covers its frame's screen rect", () => {
    const isleCam = { center: [210, 140] as [number, number], zoom: 2.2 };
    const r = handoff(ISLE, isleCam, "in");
    expect(r.view).toEqual(COVE);
    expectRect(screenRect(COVE_BOX, r.camera, SIZE), screenRect(FRAME, isleCam, SIZE));
  });

  it("zooming in by the anchor (centre outside the frame), the cove still lands on its frame", () => {
    // A wheel step about the screen point 250,180 px left of / above the centre.
    const offset: [number, number] = [-250, -180];
    const before = { center: [300, 200] as [number, number], zoom: 1.9 };
    const z1 = 2.3;
    const p: [number, number] = [
      before.center[0] + offset[0] * 2 ** -before.zoom,
      before.center[1] + offset[1] * 2 ** -before.zoom,
    ];
    const after: [number, number] = [p[0] - offset[0] * 2 ** -z1, p[1] - offset[1] * 2 ** -z1];
    const anchor = zoomAnchor(before.center, before.zoom, after, z1, SIZE)!;
    expect(anchor.point[0]).toBeCloseTo(p[0], 6);
    // The anchor is in the frame, the new centre is not.
    expect(p[1]).toBeLessThan(FRAME.maxY);
    expect(after[1]).toBeGreaterThan(FRAME.maxY);
    const a = anchoredHandoff(tree, ISLE, anchor, z1, SIZE, {
      direction: "in",
      minZoom: -6,
      maxZoom: 4,
    })!;
    expect(a.view).toEqual(COVE);
    const isleCam = { center: after, zoom: z1 };
    expectRect(screenRect(COVE_BOX, a.camera, SIZE), screenRect(FRAME, isleCam, SIZE));
  });

  it("zooming out of the cove, the frame on the isle covers the cove's screen rect", () => {
    const coveCam = { center: [120, 90] as [number, number], zoom: -0.8 };
    const r = handoff(COVE, coveCam, "out");
    expect(r.view).toEqual(ISLE);
    expectRect(screenRect(FRAME, r.camera, SIZE), screenRect(COVE_BOX, coveCam, SIZE));
  });

  it("from the ocean, the isle's picture lands on its placement", () => {
    const oceanCam = { center: [500, 500] as [number, number], zoom: 0.7 };
    const r = handoff(OCEAN, oceanCam, "in");
    expect(r.view).toEqual(ISLE);
    expectRect(screenRect(ISLE_BOX, r.camera, SIZE), screenRect(ISLE_ON_OCEAN, oceanCam, SIZE));
  });
});

describe("P-05 placement: the ghost", () => {
  it("covers exactly the screen at the handed-over camera", () => {
    const r = handoff(ISLE, { center: [210, 140], zoom: 2.2 }, "in");
    expectRect(screenRect(ghostBox(r.camera, SIZE), r.camera, SIZE), [0, 0, SIZE.x, SIZE.y]);
  });

  it("stays registered with the new pictures when Leaflet clamps the zoom (centre kept)", () => {
    const isleCam = { center: [210, 140] as [number, number], zoom: 2.2 };
    const r = handoff(ISLE, isleCam, "in");
    const ghost = ghostBox(r.camera, SIZE);
    const clamped = { center: r.camera.center, zoom: r.camera.zoom + 0.7 };
    const g = screenRect(ghost, clamped, SIZE);
    const c = screenRect(COVE_BOX, clamped, SIZE);
    const f = screenRect(FRAME, isleCam, SIZE);
    // The cove sits inside the ghost where the frame sat on the old screen.
    const s = g[2] / SIZE.x;
    expectRect(c, [g[0] + f[0] * s, g[1] + f[1] * s, f[2] * s, f[3] * s]);
  });
});
