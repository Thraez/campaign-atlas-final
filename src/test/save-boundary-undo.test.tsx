/**
 * B0 save-boundary undo: simulates the editor flow where a save clears
 * local drafts. The save-boundary undo entry must restore the pre-save
 * state in one Cmd+Z, matching spec §I:
 *   "puts the editor back into the prior in-memory state and flips the
 *    chip back to Unsaved."
 *
 * Full editor mount is too heavy to wire in vitest (react-leaflet +
 * atlas.json loader), so this exercises the same flow via the hook APIs
 * the editor uses: snapshot before cleanup, apply cleared state, push
 * one undo entry that restores everything.
 */
import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useMapLayers } from "@/atlas/useMapLayers";
import { useRegionDraft } from "@/atlas/regions/useRegionDraft";
import { useUndoStack } from "@/atlas/useUndoStack";
import type { MapDocument, Region } from "@/atlas/content/schema";

const baseMap: MapDocument = {
  id: "m1",
  worldId: "w1",
  name: "Test",
  width: 1000,
  height: 1000,
  layers: [
    { id: "base", src: "atlas/assets/maps/base.png", x: 0, y: 0, width: 1000, height: 1000, opacity: 1, zIndex: 10 },
  ],
  regions: [
    { id: "r1", mapId: "m1", name: "Existing", points: [[0, 0], [100, 0], [100, 100]], visibility: "dm" } as Region,
  ],
  routes: [],
};

describe("save-boundary undo", () => {
  it("snapshot + applySnapshot round-trip restores layer state", () => {
    const { result } = renderHook(() => {
      const undoStack = useUndoStack();
      const layers = useMapLayers(baseMap, undoStack);
      return { undoStack, layers };
    });

    // Make a dirty edit.
    act(() => result.current.layers.editBuiltinLayer("base"));
    act(() => result.current.layers.updateLayer("base", { x: 250 }));
    expect(result.current.layers.localLayers[0].x).toBe(250);

    // Capture snapshot, clear, then restore — what the save-boundary entry does.
    const snap = result.current.layers.snapshot();
    act(() => result.current.layers.applySnapshot({}));
    expect(result.current.layers.localLayers).toHaveLength(0);

    act(() => result.current.layers.applySnapshot(snap));
    expect(result.current.layers.localLayers[0].x).toBe(250);
  });

  it("applySnapshot bypasses the undo stack (no entries recorded)", () => {
    const { result } = renderHook(() => {
      const undoStack = useUndoStack();
      const layers = useMapLayers(baseMap, undoStack);
      return { undoStack, layers };
    });
    act(() => result.current.layers.editBuiltinLayer("base"));
    act(() => result.current.layers.updateLayer("base", { x: 100 }));
    act(() => result.current.undoStack.clear());

    // applySnapshot must NOT push an undo entry — only the explicit
    // save-boundary entry should ever record across-save undo.
    act(() => result.current.layers.applySnapshot({}));
    expect(result.current.undoStack.canUndo).toBe(false);
    expect(result.current.undoStack.pastSize).toBe(0);
  });

  it("save-boundary entry undo() restores pre-save state across multiple hooks", () => {
    const { result } = renderHook(() => {
      const undoStack = useUndoStack();
      const layers = useMapLayers(baseMap, undoStack);
      const region = useRegionDraft(baseMap, {}, undoStack);
      return { undoStack, layers, region };
    });

    // Build a "pre-save" world: dirty layer + dirty region.
    act(() => result.current.layers.editBuiltinLayer("base"));
    act(() => result.current.layers.updateLayer("base", { x: 300, y: 400 }));
    act(() => result.current.region.patch("r1", { name: "Renamed" }));

    // Snapshot the dirty state.
    const preLayers = result.current.layers.snapshot();
    const preRegion = result.current.region.snapshot();

    // Simulate save cleanup with applySnapshot (bypassing undo).
    act(() => result.current.layers.applySnapshot({}));
    act(() => result.current.region.applySnapshot({ edits: {}, added: [], deleted: [] }));

    // Clear undo stack — the editor would push pre-existing entries during
    // mutation, but the save-boundary entry below is the one we're testing.
    act(() => result.current.undoStack.clear());

    // Push the save-boundary entry.
    act(() => result.current.undoStack.push({
      label: "save (cleared local drafts)",
      undo: () => {
        result.current.layers.applySnapshot(preLayers);
        result.current.region.applySnapshot(preRegion);
      },
      redo: () => {
        result.current.layers.applySnapshot({});
        result.current.region.applySnapshot({ edits: {}, added: [], deleted: [] });
      },
    }));

    // Verify cleared state.
    expect(result.current.layers.localLayers).toHaveLength(0);
    expect(result.current.region.effective.find((r) => r.id === "r1")?.name).toBe("Existing");

    // Cmd+Z → restore both.
    act(() => result.current.undoStack.undo());
    expect(result.current.layers.localLayers[0].x).toBe(300);
    expect(result.current.region.effective.find((r) => r.id === "r1")?.name).toBe("Renamed");
  });
});
