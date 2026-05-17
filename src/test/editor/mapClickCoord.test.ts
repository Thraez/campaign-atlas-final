import { describe, it, expect } from "vitest";
import { mapClickToAtlasCoord } from "@/atlas/editor/mapClickCoord";

describe("mapClickToAtlasCoord", () => {
  it("rounds lng→x and flips lat against map height for y", () => {
    expect(mapClickToAtlasCoord(120.4, 80.6, 1000)).toEqual({ x: 120, y: 919 });
  });
  it("origin click maps to (0, height)", () => {
    expect(mapClickToAtlasCoord(0, 0, 1000)).toEqual({ x: 0, y: 1000 });
  });
});
