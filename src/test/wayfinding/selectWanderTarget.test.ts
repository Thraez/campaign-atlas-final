import { it, expect } from "vitest";
import { selectWanderTarget } from "@/atlas/wander/selectWanderTarget";
import type { MapPlacement } from "@/atlas/content/schema";

const P = (entityId: string, mapId = "m1", x = 0, y = 0): MapPlacement =>
  ({ id: `${entityId}@${mapId}`, entityId, mapId, x, y, visibility: "player" } as MapPlacement);

it("returns an unvisited placement, never a visited one", () => {
  const placements = [P("a"), P("b"), P("c")];
  const visited = new Set(["a", "b"]);
  const t = selectWanderTarget(placements, visited, () => 0);
  expect(t).toEqual({ entityId: "c", mapId: "m1", x: 0, y: 0 });
});

it("de-duplicates by entity (one entity pinned twice counts once)", () => {
  const placements = [P("a", "m1"), P("a", "m2")];
  const picked = selectWanderTarget(placements, new Set(), () => 0);
  expect(picked?.entityId).toBe("a");
});

it("returns null when every placed entity is visited", () => {
  expect(selectWanderTarget([P("a")], new Set(["a"]), () => 0)).toBeNull();
});

it("uses rand to index into the candidate list", () => {
  const placements = [P("a"), P("b"), P("c")];
  expect(selectWanderTarget(placements, new Set(), () => 0.999)?.entityId).toBe("c");
});
