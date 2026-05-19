import { describe, it, expect } from "vitest";
import { isLit, effectivePolygons } from "@/atlas/fog/effectiveLit";
import type { FogOverlay } from "@/atlas/content/schema";

const sq = (x0: number, y0: number, x1: number, y1: number) =>
  [[x0, y0], [x1, y0], [x1, y1], [x0, y1]] as [number, number][];

describe("effectiveLit.isLit", () => {
  it("point inside a reveal is lit", () => {
    const fog: FogOverlay = { mapId: "m", enabled: true, reveals: [sq(0, 0, 100, 100)] };
    expect(isLit(50, 50, fog)).toBe(true);
  });
  it("point outside all reveals is not lit", () => {
    const fog: FogOverlay = { mapId: "m", enabled: true, reveals: [sq(0, 0, 100, 100)] };
    expect(isLit(200, 200, fog)).toBe(false);
  });
  it("conceal overrides reveal (conceal wins)", () => {
    const fog: FogOverlay = { mapId: "m", enabled: true,
      reveals: [sq(0, 0, 100, 100)], conceals: [sq(40, 40, 60, 60)] };
    expect(isLit(50, 50, fog)).toBe(false);
    expect(isLit(10, 10, fog)).toBe(true);
  });
  it("degenerate polygon (<3 pts) is ignored", () => {
    const fog: FogOverlay = { mapId: "m", enabled: true, reveals: [[[1, 1], [2, 2]] as never] };
    expect(isLit(1.5, 1.5, fog)).toBe(false);
  });
  it("enabled:false → everything lit", () => {
    const fog: FogOverlay = { mapId: "m", enabled: false, reveals: [] };
    expect(isLit(999, 999, fog)).toBe(true);
  });
});

describe("effectivePolygons", () => {
  it("returns reveals and conceals filtered to >=3 points", () => {
    const r = effectivePolygons({ mapId: "m", enabled: true,
      reveals: [sq(0, 0, 10, 10), [[0, 0], [1, 1]] as never],
      conceals: [sq(2, 2, 4, 4)] });
    expect(r.reveals.length).toBe(1);
    expect(r.conceals.length).toBe(1);
  });
});
