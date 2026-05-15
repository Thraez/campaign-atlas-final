import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useRegionDraft } from "@/atlas/regions/useRegionDraft";
import { useRouteDraft } from "@/atlas/routes/useRouteDraft";
import { useFogDraft } from "@/atlas/fog/useFogDraft";
import { useUndoStack } from "@/atlas/useUndoStack";
import type { MapDocument, Region, Route } from "@/atlas/content/schema";

const baseMap: MapDocument = {
  id: "m1",
  worldId: "w1",
  name: "Test",
  width: 1000,
  height: 1000,
  layers: [],
  regions: [
    { id: "r1", mapId: "m1", name: "Existing", points: [[0, 0], [100, 0], [100, 100]], visibility: "dm" } as Region,
  ],
  routes: [
    { id: "rt1", mapId: "m1", name: "Existing route", waypoints: [[0, 0], [100, 100]], visibility: "dm" } as Route,
  ],
};

describe("useRegionDraft + undo", () => {
  it("patch records undo that reverts to prior region values", () => {
    const { result } = renderHook(() => {
      const undoStack = useUndoStack();
      const region = useRegionDraft(baseMap, {}, undoStack);
      return { undoStack, region };
    });

    act(() => result.current.region.patch("r1", { name: "Renamed" }));
    expect(result.current.region.effective.find((r) => r.id === "r1")?.name).toBe("Renamed");
    expect(result.current.undoStack.canUndo).toBe(true);

    act(() => result.current.undoStack.undo());
    expect(result.current.region.effective.find((r) => r.id === "r1")?.name).toBe("Existing");
  });

  it("remove + undo restores the region", () => {
    const { result } = renderHook(() => {
      const undoStack = useUndoStack();
      const region = useRegionDraft(baseMap, {}, undoStack);
      return { undoStack, region };
    });
    act(() => result.current.region.remove("r1"));
    expect(result.current.region.effective.length).toBe(0);
    act(() => result.current.undoStack.undo());
    expect(result.current.region.effective.find((r) => r.id === "r1")).toBeTruthy();
  });

  it("translate + undo returns points to their prior offset", () => {
    const { result } = renderHook(() => {
      const undoStack = useUndoStack();
      const region = useRegionDraft(baseMap, {}, undoStack);
      return { undoStack, region };
    });
    act(() => result.current.region.translate("r1", 50, 50));
    const moved = result.current.region.effective.find((r) => r.id === "r1");
    expect(moved?.points[0]).toEqual([50, 50]);
    act(() => result.current.undoStack.undo());
    const reverted = result.current.region.effective.find((r) => r.id === "r1");
    expect(reverted?.points[0]).toEqual([0, 0]);
  });
});

describe("useRouteDraft + undo", () => {
  it("patch records undo that reverts route fields", () => {
    const { result } = renderHook(() => {
      const undoStack = useUndoStack();
      const route = useRouteDraft(null, baseMap, {}, undoStack);
      return { undoStack, route };
    });

    act(() => result.current.route.patch("rt1", { name: "Renamed route" }));
    expect(result.current.route.effective.find((r) => r.id === "rt1")?.name).toBe("Renamed route");

    act(() => result.current.undoStack.undo());
    expect(result.current.route.effective.find((r) => r.id === "rt1")?.name).toBe("Existing route");
  });

  it("remove + undo restores the route", () => {
    const { result } = renderHook(() => {
      const undoStack = useUndoStack();
      const route = useRouteDraft(null, baseMap, {}, undoStack);
      return { undoStack, route };
    });
    act(() => result.current.route.remove("rt1"));
    expect(result.current.route.effective.length).toBe(0);
    act(() => result.current.undoStack.undo());
    expect(result.current.route.effective.find((r) => r.id === "rt1")).toBeTruthy();
  });
});

describe("useFogDraft + undo", () => {
  it("setEnabled records undo that reverts to prior flag", () => {
    const { result } = renderHook(() => {
      const undoStack = useUndoStack();
      const fog = useFogDraft(baseMap, undoStack);
      return { undoStack, fog };
    });

    expect(result.current.fog.fog.enabled).toBe(false);
    act(() => result.current.fog.setEnabled(true));
    expect(result.current.fog.fog.enabled).toBe(true);
    expect(result.current.undoStack.canUndo).toBe(true);

    act(() => result.current.undoStack.undo());
    expect(result.current.fog.fog.enabled).toBe(false);
  });

  it("addReveal (via finishDraftCircle) + undo removes the reveal", () => {
    const { result } = renderHook(() => {
      const undoStack = useUndoStack();
      const fog = useFogDraft(baseMap, undoStack);
      return { undoStack, fog };
    });
    act(() => result.current.fog.setTool("circle"));
    act(() => result.current.fog.addDraftPoint([50, 50]));
    act(() => result.current.fog.finishDraftCircle(20));
    expect(result.current.fog.fog.reveals.length).toBe(1);
    act(() => result.current.undoStack.undo());
    expect(result.current.fog.fog.reveals.length).toBe(0);
  });
});
