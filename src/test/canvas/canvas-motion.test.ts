/**
 * P-06: the canvas's wheel speed and the breadcrumb glide's start camera
 * (canvasMotion.ts). One notch zooms the same on every platform, and a level
 * of the tree (about 2 zoom levels) takes 4-5 notches.
 */
import { describe, expect, it } from "vitest";
import type { AtlasProject } from "@/atlas/content/schema";
import { buildMapTree } from "@/atlas/ocean/mapTree";
import {
  NOTCH_DELTA_Y,
  ZOOM_PER_NOTCH,
  ancestorCamera,
  canvasWheelPxPerZoomLevel,
  leafletWheelPxFactor,
  wheelBatchZoom,
} from "@/atlas/canvas/canvasMotion";

describe("wheel speed (P-06)", () => {
  it("copies Leaflet's platform factor", () => {
    expect(leafletWheelPxFactor({ mac: true }, 2)).toBe(6);
    expect(leafletWheelPxFactor({ mac: true }, 1)).toBe(3);
    expect(leafletWheelPxFactor({ linux: true, chrome: true }, 1)).toBe(1);
    expect(leafletWheelPxFactor({}, 1)).toBe(2);
    expect(leafletWheelPxFactor({}, 1.5)).toBe(3);
  });

  it("matches Leaflet's default curve (a Mac notch at 60 px a level: 0.387, as measured in Chromium)", () => {
    expect(wheelBatchZoom(100 / 3, 60)).toBeCloseTo(0.387, 3);
    expect(wheelBatchZoom(-100 / 3, 60)).toBeCloseTo(-0.387, 3);
    expect(wheelBatchZoom(1e6, 60)).toBeCloseTo(4, 9);
  });

  it("one notch zooms the same on a retina Mac, a Mac, Windows and Linux", () => {
    for (const factor of [6, 3, 2, 1, 1.5]) {
      const z = wheelBatchZoom(NOTCH_DELTA_Y / factor, canvasWheelPxPerZoomLevel(factor));
      expect(z).toBeCloseTo(ZOOM_PER_NOTCH, 9);
    }
    expect(ZOOM_PER_NOTCH).toBeGreaterThan(0.45);
    expect(ZOOM_PER_NOTCH).toBeLessThan(0.5);
  });

  it("a level of 1.6 to 2.39 zoom levels takes 4-5 notches (was 8-12 on a retina Mac)", () => {
    const notches = (span: number, perNotch: number) => Math.ceil(span / perNotch - 1e-9);
    // Leaflet's default on a retina Mac: 100/6 wheel px a notch, 60 px a level
    const retinaDefault = wheelBatchZoom(100 / 6, 60);
    for (const span of [1.6, 1.8, 2, 2.2, 2.39]) {
      const n = notches(span, ZOOM_PER_NOTCH);
      expect(n).toBeGreaterThanOrEqual(4);
      expect(n).toBeLessThanOrEqual(5);
      expect(notches(span, retinaDefault)).toBeGreaterThanOrEqual(8);
    }
  });

  it("a fast trackpad flick still flattens (at most about 1.3 levels for 300 px)", () => {
    const factor = 6;
    expect(wheelBatchZoom(300 / factor, canvasWheelPxPerZoomLevel(factor))).toBeLessThan(1.35);
  });
});

describe("ancestorCamera: where a crumb's glide starts (P-06)", () => {
  // ocean 3000x2000; isle 600x400 at (200,300) scale 1; cove 400x300 in the
  // isle's frame (0,0)-(100,75), so cove zoom = isle zoom - 2.
  const tree = buildMapTree({
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
        frame: { x: 0, y: 0, width: 100, height: 75, rotation: 0 },
        enterZoom: 2,
      },
      { id: "far", name: "Far", width: 100, height: 100, layers: [] },
    ],
    ocean: {
      width: 3000,
      height: 2000,
      sea: "default",
      onOcean: [{ map: "isle", x: 200, y: 300, scale: 1, rotation: 0 }],
    },
  } as unknown as AtlasProject);
  const cam = { center: [200, 150] as [number, number], zoom: 1 };

  it("maps a child camera up to its parent: same ground, zoom less the frame's offset", () => {
    const r = ancestorCamera(tree, { kind: "map", mapId: "cove" }, cam, {
      kind: "map",
      mapId: "isle",
    });
    expect(r!.center[0]).toBeCloseTo(50, 9);
    expect(r!.center[1]).toBeCloseTo(37.5, 9);
    expect(r!.zoom).toBeCloseTo(3, 9);
  });

  it("maps two levels up to the ocean", () => {
    const r = ancestorCamera(tree, { kind: "map", mapId: "cove" }, cam, { kind: "ocean" });
    expect(r!.center[0]).toBeCloseTo(250, 9);
    expect(r!.center[1]).toBeCloseTo(337.5, 9);
    expect(r!.zoom).toBeCloseTo(3, 9);
  });

  it("is null for a view that is not an ancestor (that change jumps)", () => {
    const isle = { kind: "map", mapId: "isle" } as const;
    expect(ancestorCamera(tree, isle, cam, { kind: "map", mapId: "cove" })).toBeNull();
    expect(ancestorCamera(tree, { kind: "ocean" }, cam, isle)).toBeNull();
    // a root map that is not on the ocean
    expect(ancestorCamera(tree, { kind: "map", mapId: "far" }, cam, { kind: "ocean" })).toBeNull();
  });
});
