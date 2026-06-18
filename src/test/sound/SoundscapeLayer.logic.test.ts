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
