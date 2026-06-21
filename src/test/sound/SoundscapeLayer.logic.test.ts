import { describe, it, expect } from "vitest";
import { computeActiveId } from "@/atlas/sound/SoundscapeLayer";
import { prepareAreas, FILL_MIN, HYSTERESIS } from "@/atlas/sound/resolveSoundscape";
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

  it("returns prevId unchanged when it is still the sole eligible winner", () => {
    // prevId="s0" is already the smallest eligible area — `prevId !== smallest.id` is false
    // so smallest.id (= prevId) is returned without entering the stability branch.
    const prepared = prepareAreas(map);
    const leaflet = mockMap({ lat: 500, lng: 500 }, { lat: 100, lng: 100 }, { lat: 900, lng: 900 });
    expect(computeActiveId(prepared, leaflet as any, 1000, "s0")).toBe("s0");
  });

  it("hysteresis dead-band: keeps prevId when coverage is just below FILL_MIN but above FILL_MIN×HYSTERESIS", () => {
    // Area [0,450]×[0,1000] covers 45 % of a full 1000×1000 viewport — below FILL_MIN (0.5)
    // but above FILL_MIN×HYSTERESIS (0.425), so prevId is kept; null prevId returns null.
    const narrow = {
      ...map,
      soundscape: { areas: [{ id: "s0", points: [[0, 0], [450, 0], [450, 1000], [0, 1000]], bed: { src: "a.ogg" } }] },
    } as unknown as MapDocument;
    const prepared = prepareAreas(narrow);
    // center lng=225 → cx=225 (inside the 0-450 area); lat=500 → cy=500
    const leaflet = mockMap({ lat: 500, lng: 225 }, { lat: 0, lng: 0 }, { lat: 1000, lng: 1000 });
    const coverage = 450 / 1000; // 0.45
    expect(coverage).toBeGreaterThanOrEqual(FILL_MIN * HYSTERESIS);
    expect(coverage).toBeLessThan(FILL_MIN);
    expect(computeActiveId(prepared, leaflet as any, 1000, "s0")).toBe("s0");  // hysteresis keeps it
    expect(computeActiveId(prepared, leaflet as any, 1000, null)).toBeNull();  // no hysteresis without prevId
  });

  it("switches to a strictly smaller nested area when the viewport is centred on it", () => {
    // outer s0 (bbox 1000×1000) and inner s1 (bbox 200×200).  Both eligible when viewport is
    // zoomed in to the inner square.  selectActiveBed sorts by bboxArea asc → s1 wins.
    // The stability branch (keep prevId) only fires when smallest.bboxArea >= prev.bboxArea,
    // which is false here (40 000 < 1 000 000), so s1 is returned even when prevId="s0".
    const nested = {
      ...map,
      soundscape: {
        areas: [
          { id: "s0", points: [[0, 0], [1000, 0], [1000, 1000], [0, 1000]], bed: { src: "outer.ogg" } },
          { id: "s1", points: [[400, 400], [600, 400], [600, 600], [400, 600]], bed: { src: "inner.ogg" } },
        ],
      },
    } as unknown as MapDocument;
    const prepared = prepareAreas(nested);
    // Viewport exactly around the 200×200 inner square.
    // readViewport: cx=500, cy=500; view={minX:400,maxX:600,minY:400,maxY:600}
    const leaflet = mockMap({ lat: 500, lng: 500 }, { lat: 400, lng: 400 }, { lat: 600, lng: 600 });
    expect(computeActiveId(prepared, leaflet as any, 1000, "s0")).toBe("s1");
  });
});
