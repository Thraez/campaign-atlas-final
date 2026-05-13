/**
 * Route + fog draft logic tests.
 */
import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useRouteDraft, routeToYamlObject } from "@/atlas/routes/useRouteDraft";
import { useFogDraft, fogToYamlObject } from "@/atlas/fog/useFogDraft";
import type { AtlasProject, MapDocument } from "@/atlas/content/schema";

const map: MapDocument = {
  id: "world", worldId: "w", name: "World", width: 1000, height: 1000, layers: [],
  routes: [
    { id: "kings-road", mapId: "world", name: "King's Road", visibility: "player",
      waypoints: [[10, 10], [200, 200], { entityId: "thornhold" }] },
  ],
  fog: { mapId: "world", enabled: true, color: "rgba(0,0,0,0.5)", reveals: [[[1,1],[5,1],[5,5],[1,5]]] },
};

const project: AtlasProject = {
  version: "1", publishedAt: "now", worlds: [{ id: "w", name: "W" }],
  maps: [map],
  entities: [
    { id: "thornhold", title: "Thornhold", type: "settlement", visibility: "player", aliases: [], tags: [], summary: "", body: "", contentPath: "" } as never,
    { id: "lair", title: "Lair", type: "dungeon", visibility: "dm", aliases: [], tags: [], summary: "", body: "", contentPath: "" } as never,
  ],
  placements: [{ entityId: "thornhold", mapId: "world", x: 500, y: 500 }],
  assets: [],
};

describe("useRouteDraft", () => {
  const opts = { entityIds: new Set(["thornhold", "lair"]), dmEntityIds: new Set(["lair"]) };

  it("draws and finalizes a route (≥2 waypoints)", () => {
    const { result } = renderHook(() => useRouteDraft(project, map, opts));
    act(() => result.current.startDraw());
    act(() => result.current.addDraftPoint([10, 10]));
    let id: string | null = null;
    act(() => { id = result.current.finishDraw(); });
    expect(id).toBeNull(); // need 2
    act(() => result.current.startDraw());
    act(() => result.current.addDraftPoint([10, 10]));
    act(() => result.current.addDraftPoint([20, 20]));
    act(() => { id = result.current.finishDraw(); });
    expect(id).toBeTruthy();
  });

  it("flags spoiler-leak when player route uses DM entity", () => {
    const { result } = renderHook(() => useRouteDraft(project, map, opts));
    act(() => result.current.patch("kings-road", { waypoints: [[1,1], { entityId: "lair" }] }));
    expect(result.current.issues.find((i) => i.code === "spoiler-leak")).toBeTruthy();
  });

  it("warns when entity waypoint has no placement on map", () => {
    const { result } = renderHook(() => useRouteDraft(project, map, opts));
    act(() => result.current.patch("kings-road", { waypoints: [[1,1], { entityId: "lair" }] }));
    expect(result.current.issues.some((i) => i.code === "route-entity-no-placement")).toBe(true);
  });

  it("resolveRoute drops unresolved entity refs", () => {
    const { result } = renderHook(() => useRouteDraft(project, map, opts));
    const r = result.current.effective[0];
    expect(result.current.resolveRoute(r)).toEqual([[10,10],[200,200],[500,500]]);
  });

  it("yaml strips defaults but keeps mode/dashed/description", () => {
    const y = routeToYamlObject({
      id: "r", mapId: "world", name: "R", visibility: "dm",
      waypoints: [[1.6, 2.4], { entityId: "thornhold" }], mode: "horse", dashed: true, description: "scenic",
    });
    expect(y).toMatchObject({ mode: "horse", dashed: true, description: "scenic" });
    expect((y.waypoints as unknown[])[0]).toEqual([2, 2]);
  });
});

describe("useFogDraft", () => {
  it("toggles enabled and tracks dirty", () => {
    const { result } = renderHook(() => useFogDraft(map));
    expect(result.current.dirty).toBe(false);
    act(() => result.current.setEnabled(false));
    expect(result.current.dirty).toBe(true);
    expect(result.current.fog.enabled).toBe(false);
  });

  it("draws a polygon reveal (≥3 points)", () => {
    const { result } = renderHook(() => useFogDraft(map));
    act(() => result.current.setTool("polygon"));
    act(() => result.current.addDraftPoint([1,1]));
    act(() => result.current.addDraftPoint([10,1]));
    let ok = false;
    act(() => { ok = result.current.finishDraftPolygon(); });
    expect(ok).toBe(false); // need 3
    act(() => result.current.addDraftPoint([5,10]));
    act(() => { ok = result.current.finishDraftPolygon(); });
    expect(ok).toBe(true);
    expect(result.current.fog.reveals.length).toBe(2);
  });

  it("circle reveal becomes polygon approximation", () => {
    const { result } = renderHook(() => useFogDraft(map));
    act(() => result.current.setTool("circle"));
    act(() => result.current.addDraftPoint([500, 500]));
    let ok = false;
    act(() => { ok = result.current.finishDraftCircle(50); });
    expect(ok).toBe(true);
    const last = result.current.fog.reveals[result.current.fog.reveals.length - 1];
    expect(last.length).toBeGreaterThan(8);
  });

  it("warns on out-of-bounds reveal", () => {
    const { result } = renderHook(() => useFogDraft(map));
    act(() => result.current.setTool("polygon"));
    act(() => result.current.addDraftPoint([-50, -50]));
    act(() => result.current.addDraftPoint([10, -50]));
    act(() => result.current.addDraftPoint([10, 10]));
    act(() => { result.current.finishDraftPolygon(); });
    expect(result.current.issues.some((i) => i.code === "fog-reveal-out-of-bounds")).toBe(true);
  });

  it("yaml round-trips reveals with rounded ints", () => {
    const y = fogToYamlObject({ mapId: "world", enabled: true, color: "#000", reveals: [[[1.4,2.6],[3,3],[5,5]]] });
    expect(y).toEqual({ mapId: "world", enabled: true, color: "#000", reveals: [[[1,3],[3,3],[5,5]]] });
  });
});
