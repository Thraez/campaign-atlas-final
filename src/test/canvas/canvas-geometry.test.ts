// R-31: the canvas's pure helpers: sea style lookup and ocean geometry.
import { describe, expect, it } from "vitest";
import { seaStyle, seaStyleName } from "@/atlas/canvas/seaStyle";
import {
  boxBounds,
  boxOf,
  fromLatLng,
  oceanMapSvg,
  placementCorners,
  toLatLng,
} from "@/atlas/canvas/canvasGeometry";
import { mapToOcean, type MapTreeNode } from "@/atlas/ocean/mapTree";
import type { MapDocument, OceanPlacement } from "@/atlas/content/schema";

describe("sea style", () => {
  it.each([
    ["default", "default"],
    [undefined, "default"],
    ["stormy", "default"],
    ["__proto__", "default"],
    ["constructor", "default"],
    ["toString", "default"],
    [42, "default"],
    ['x" onload="y', "default"],
  ])("%s → %s", (sea, name) => {
    expect(seaStyleName(sea)).toBe(name);
    expect(seaStyle(sea)).toEqual({});
  });
});

const MAP = {
  id: "m",
  name: "M",
  width: 600,
  height: 400,
  layers: [
    { id: "top", src: "atlas/b.png", x: 0, y: 0, width: 600, height: 400, zIndex: 2, opacity: 0.5 },
    { id: "base", src: "atlas/a.png", x: 10, y: 20, width: 300, height: 200, zIndex: 1 },
  ],
} as unknown as MapDocument;

describe("ocean geometry", () => {
  const place: OceanPlacement = { map: "m", x: 200, y: 300, scale: 2, rotation: 15 };

  it("corners are mapToOcean's, clockwise from top-left", () => {
    const corners = placementCorners(place, MAP);
    const want = [
      [0, 0],
      [600, 0],
      [600, 400],
      [0, 400],
    ].map((p) => mapToOcean(place, MAP, p as [number, number]));
    expect(corners).toEqual(want);
  });

  it("the svg box holds the rotated corners; layers are scaled and in zIndex order", () => {
    const node = { map: MAP, placement: place, children: [] } as unknown as MapTreeNode;
    const svg = oceanMapSvg(node)!;
    expect(svg.box).toEqual(boxOf(placementCorners(place, MAP)));
    expect(svg.rotation).toBe(15);
    expect(svg.centre).toEqual([800, 700]);
    expect(svg.layers.map((l) => [l.id, l.x, l.y, l.w, l.h])).toEqual([
      ["base", 220, 340, 600, 400],
      ["top", 200, 300, 1200, 800],
    ]);
  });

  it("lat/lng round-trips and boxes become Leaflet bounds", () => {
    expect(fromLatLng(2000, { lat: 1700, lng: 50 })).toEqual([50, 300]);
    expect(toLatLng(2000, [50, 300])).toEqual([1700, 50]);
    expect(boxBounds(2000, { minX: 10, minY: 20, maxX: 110, maxY: 220 })).toEqual([
      [1780, 10],
      [1980, 110],
    ]);
  });
});
