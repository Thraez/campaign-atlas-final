/**
 * Region draft logic tests — drawing finalize, edits, deletes, validation.
 */
import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useRegionDraft, regionToYamlObject } from "@/atlas/regions/useRegionDraft";
import type { MapDocument, Region } from "@/atlas/content/schema";

const baseMap: MapDocument = {
  id: "world",
  worldId: "w",
  name: "World",
  width: 1000,
  height: 1000,
  layers: [],
  regions: [
    {
      id: "thornhold",
      mapId: "world",
      name: "Thornhold",
      visibility: "player",
      points: [[10, 10], [100, 10], [100, 100], [10, 100]],
    },
  ],
};

describe("useRegionDraft", () => {
  it("draws and finalizes a polygon", () => {
    const { result } = renderHook(() => useRegionDraft(baseMap));
    act(() => result.current.startDraw());
    act(() => result.current.addDraftPoint([200, 200]));
    act(() => result.current.addDraftPoint([300, 200]));
    act(() => result.current.addDraftPoint([300, 300]));
    let id: string | null = null;
    act(() => { id = result.current.finishDraw(); });
    expect(id).toBeTruthy();
    expect(result.current.draft.added).toHaveLength(1);
    expect(result.current.effective).toHaveLength(2);
  });

  it("refuses fewer than 3 points", () => {
    const { result } = renderHook(() => useRegionDraft(baseMap));
    act(() => result.current.startDraw());
    act(() => result.current.addDraftPoint([1, 1]));
    act(() => result.current.addDraftPoint([2, 2]));
    let id: string | null = null;
    act(() => { id = result.current.finishDraw(); });
    expect(id).toBeNull();
  });

  it("edits an existing region without touching others", () => {
    const { result } = renderHook(() => useRegionDraft(baseMap));
    act(() => result.current.patch("thornhold", { name: "Thornhold Reach" }));
    expect(result.current.effective.find((r) => r.id === "thornhold")?.name).toBe("Thornhold Reach");
    expect(result.current.draft.edits.thornhold?.name).toBe("Thornhold Reach");
  });

  it("deletes existing regions and removes added in-place", () => {
    const { result } = renderHook(() => useRegionDraft(baseMap));
    act(() => result.current.startDraw());
    act(() => result.current.addDraftPoint([1, 1]));
    act(() => result.current.addDraftPoint([2, 1]));
    act(() => result.current.addDraftPoint([2, 2]));
    let newId: string | null = null;
    act(() => { newId = result.current.finishDraw(); });
    act(() => result.current.remove(newId!));
    expect(result.current.draft.added).toHaveLength(0);
    act(() => result.current.remove("thornhold"));
    expect(result.current.draft.deleted).toContain("thornhold");
    expect(result.current.effective.find((r) => r.id === "thornhold")).toBeUndefined();
  });

  it("vertex ops respect minimum-3 invariant", () => {
    const { result } = renderHook(() => useRegionDraft(baseMap));
    act(() => result.current.movePoint("thornhold", 1, [200, 10]));
    expect(result.current.effective[0].points[1]).toEqual([200, 10]);
    act(() => result.current.insertPointAfter("thornhold", 0, [50, 10]));
    expect(result.current.effective[0].points).toHaveLength(5);
    // Try to delete down past 3 — should stop at 3.
    act(() => result.current.deletePoint("thornhold", 0));
    act(() => result.current.deletePoint("thornhold", 0));
    expect(result.current.effective[0].points).toHaveLength(3);
    act(() => result.current.deletePoint("thornhold", 0));
    expect(result.current.effective[0].points).toHaveLength(3);
  });

  it("flags spoiler-leak for player region linked to DM entity", () => {
    const { result } = renderHook(() =>
      useRegionDraft(baseMap, {
        entityIds: new Set(["secret"]),
        dmEntityIds: new Set(["secret"]),
      })
    );
    act(() => result.current.patch("thornhold", { entityId: "secret" }));
    const leak = result.current.issues.find((i) => i.code === "spoiler-leak");
    expect(leak).toBeDefined();
    expect(leak?.severity).toBe("blocking");
  });

  it("flags out-of-bounds points as warning", () => {
    const { result } = renderHook(() => useRegionDraft(baseMap));
    act(() => result.current.movePoint("thornhold", 0, [-50, 10]));
    const oob = result.current.issues.find((i) => i.code === "region-out-of-bounds");
    expect(oob?.severity).toBe("warning");
  });

  it("regionToYamlObject strips undefined and rounds points", () => {
    const r: Region = {
      id: "r1",
      mapId: "world",
      name: "R1",
      visibility: "player",
      points: [[1.4, 2.6], [3.5, 4.5], [5, 5]],
      color: "#abc",
    };
    const y = regionToYamlObject(r);
    expect(y).toEqual({
      id: "r1",
      mapId: "world",
      name: "R1",
      visibility: "player",
      points: [[1, 3], [4, 5], [5, 5]],
      color: "#abc",
    });
    expect("entityId" in y).toBe(false);
  });
});
