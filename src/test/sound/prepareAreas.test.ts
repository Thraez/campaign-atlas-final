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
