import { it, expect } from "vitest";
import { discoveryMeter } from "@/atlas/wander/discoveryMeter";
import type { MapPlacement } from "@/atlas/content/schema";

const P = (entityId: string, mapId = "m1"): MapPlacement =>
  ({ id: `${entityId}@${mapId}`, entityId, mapId, x: 0, y: 0, visibility: "player" } as MapPlacement);

it("counts distinct placed entities as the total, visited-among-them as discovered", () => {
  const placements = [P("a", "m1"), P("a", "m2"), P("b"), P("c")];
  expect(discoveryMeter(placements, new Set(["a", "z"]))).toEqual({ discovered: 1, total: 3 });
});

it("is 0 of 0 with no placements", () => {
  expect(discoveryMeter([], new Set(["a"]))).toEqual({ discovered: 0, total: 0 });
});
