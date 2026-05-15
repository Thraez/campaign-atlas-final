import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useMapLayers } from "@/atlas/useMapLayers";
import { useUndoStack } from "@/atlas/useUndoStack";
import type { MapDocument } from "@/atlas/content/schema";

const testMap: MapDocument = {
  id: "test-map",
  worldId: "test-world",
  name: "Test",
  width: 2000,
  height: 1500,
  layers: [
    { id: "builtin-1", src: "atlas/assets/maps/base.png", x: 0, y: 0, width: 2000, height: 1500, opacity: 1, zIndex: 10 },
  ],
  regions: [],
  routes: [],
};

beforeEach(() => {
  // Each test gets a clean localStorage so the hook's persistence layer doesn't
  // bleed between cases.
  localStorage.clear();
  // Stub the image-size sniff so addUrl resolves quickly without hitting the DOM.
  (globalThis as { Image: unknown }).Image = class {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    naturalWidth = 100;
    naturalHeight = 100;
    set src(_v: string) { setTimeout(() => this.onload && this.onload(), 0); }
  };
});

describe("useMapLayers + undo", () => {
  it("updateLayer pushes an undo entry that reverts the geometry change", () => {
    const { result } = renderHook(() => {
      const undoStack = useUndoStack();
      const layers = useMapLayers(testMap, undoStack);
      return { undoStack, layers };
    });

    // Seed: convert built-in to an editable local layer override.
    act(() => result.current.layers.editBuiltinLayer("builtin-1"));
    // editBuiltinLayer itself is undoable; clear that entry to isolate the test.
    act(() => result.current.undoStack.clear());

    act(() => result.current.layers.updateLayer("builtin-1", { x: 500, y: 300 }));
    expect(result.current.undoStack.canUndo).toBe(true);
    expect(result.current.layers.localLayers.find((l) => l.id === "builtin-1")?.x).toBe(500);

    act(() => result.current.undoStack.undo());
    expect(result.current.layers.localLayers.find((l) => l.id === "builtin-1")?.x).toBe(0);
    expect(result.current.undoStack.canRedo).toBe(true);
  });

  it("redo re-applies the updateLayer mutation", () => {
    const { result } = renderHook(() => {
      const undoStack = useUndoStack();
      const layers = useMapLayers(testMap, undoStack);
      return { undoStack, layers };
    });

    act(() => result.current.layers.editBuiltinLayer("builtin-1"));
    act(() => result.current.undoStack.clear());
    act(() => result.current.layers.updateLayer("builtin-1", { x: 500 }));
    act(() => result.current.undoStack.undo());
    act(() => result.current.undoStack.redo());
    expect(result.current.layers.localLayers.find((l) => l.id === "builtin-1")?.x).toBe(500);
  });

  it("editBuiltinLayer pushes an undo entry that removes the override", () => {
    const { result } = renderHook(() => {
      const undoStack = useUndoStack();
      const layers = useMapLayers(testMap, undoStack);
      return { undoStack, layers };
    });

    act(() => result.current.layers.editBuiltinLayer("builtin-1"));
    expect(result.current.layers.localLayers).toHaveLength(1);
    expect(result.current.undoStack.canUndo).toBe(true);

    act(() => result.current.undoStack.undo());
    expect(result.current.layers.localLayers).toHaveLength(0);
  });

  it("removeLayer pushes an undo entry that restores the layer", () => {
    const { result } = renderHook(() => {
      const undoStack = useUndoStack();
      const layers = useMapLayers(testMap, undoStack);
      return { undoStack, layers };
    });

    act(() => result.current.layers.editBuiltinLayer("builtin-1"));
    act(() => result.current.layers.updateLayer("builtin-1", { x: 99 }));
    act(() => result.current.undoStack.clear());

    act(() => result.current.layers.removeLayer("builtin-1"));
    expect(result.current.layers.localLayers).toHaveLength(0);

    act(() => result.current.undoStack.undo());
    expect(result.current.layers.localLayers).toHaveLength(1);
    expect(result.current.layers.localLayers[0].x).toBe(99);
  });

  it("works without an undoStack (back-compat)", () => {
    const { result } = renderHook(() => useMapLayers(testMap));
    act(() => result.current.editBuiltinLayer("builtin-1"));
    act(() => result.current.updateLayer("builtin-1", { x: 42 }));
    expect(result.current.localLayers[0].x).toBe(42);
  });

  it("two sequential updateLayer calls produce two undo entries (each one undone separately)", () => {
    const { result } = renderHook(() => {
      const undoStack = useUndoStack();
      const layers = useMapLayers(testMap, undoStack);
      return { undoStack, layers };
    });
    act(() => result.current.layers.editBuiltinLayer("builtin-1"));
    act(() => result.current.undoStack.clear());
    act(() => result.current.layers.updateLayer("builtin-1", { x: 100 }));
    act(() => result.current.layers.updateLayer("builtin-1", { x: 200 }));
    expect(result.current.undoStack.pastSize).toBe(2);

    act(() => result.current.undoStack.undo());
    expect(result.current.layers.localLayers[0].x).toBe(100);
    act(() => result.current.undoStack.undo());
    expect(result.current.layers.localLayers[0].x).toBe(0);
  });

  it("mergedLayers preserves original map.layers index when every layer becomes an edit override", () => {
    // Six layers all sharing the same zIndex. After editing them in arbitrary
    // order, mergedLayers must still emit them in the canonical map.layers
    // order so the world.yaml save doesn't shuffle the block ordering on
    // every touch-up edit. (Same-zIndex ties resolve to array order via the
    // stable sort, so the array ORDER is the contract here.)
    const sixLayerMap: MapDocument = {
      id: "test-map",
      worldId: "test-world",
      name: "Test",
      width: 2000,
      height: 1500,
      layers: [
        { id: "L1", src: "atlas/assets/maps/a.png", x: 0, y: 0, width: 100, height: 100, opacity: 1, zIndex: 20 },
        { id: "L2", src: "atlas/assets/maps/b.png", x: 0, y: 0, width: 100, height: 100, opacity: 1, zIndex: 20 },
        { id: "L3", src: "atlas/assets/maps/c.png", x: 0, y: 0, width: 100, height: 100, opacity: 1, zIndex: 20 },
        { id: "L4", src: "atlas/assets/maps/d.png", x: 0, y: 0, width: 100, height: 100, opacity: 1, zIndex: 20 },
        { id: "L5", src: "atlas/assets/maps/e.png", x: 0, y: 0, width: 100, height: 100, opacity: 1, zIndex: 20 },
        { id: "L6", src: "atlas/assets/maps/f.png", x: 0, y: 0, width: 100, height: 100, opacity: 1, zIndex: 20 },
      ],
      regions: [],
      routes: [],
    };
    const { result } = renderHook(() => useMapLayers(sixLayerMap));
    // Touch the layers in a non-canonical order.
    act(() => result.current.editBuiltinLayer("L3"));
    act(() => result.current.editBuiltinLayer("L6"));
    act(() => result.current.editBuiltinLayer("L5"));
    act(() => result.current.editBuiltinLayer("L4"));
    act(() => result.current.editBuiltinLayer("L1"));
    act(() => result.current.editBuiltinLayer("L2"));
    expect(result.current.mergedLayers.map((l) => l.id)).toEqual(["L1", "L2", "L3", "L4", "L5", "L6"]);
  });

  it("mergedLayers places upload/url additions after the canon block", async () => {
    // Adds (origin = "upload" / "url") never had a canonical slot, so they
    // belong at the end of the array — preserving canon order for the rest.
    const m: MapDocument = {
      id: "test-map",
      worldId: "test-world",
      name: "Test",
      width: 2000,
      height: 1500,
      layers: [
        { id: "L1", src: "atlas/assets/maps/a.png", x: 0, y: 0, width: 100, height: 100, opacity: 1, zIndex: 20 },
        { id: "L2", src: "atlas/assets/maps/b.png", x: 0, y: 0, width: 100, height: 100, opacity: 1, zIndex: 20 },
      ],
      regions: [],
      routes: [],
    };
    const { result } = renderHook(() => useMapLayers(m));
    // Edit the canon layers in reverse order.
    act(() => result.current.editBuiltinLayer("L2"));
    act(() => result.current.editBuiltinLayer("L1"));
    // Add a URL layer. The image-size sniff resolves via a microtask, so
    // wrap the whole flush in act() to catch the post-resolve state update.
    await act(async () => {
      await result.current.addUrl("https://example.com/x.png");
      await new Promise((r) => setTimeout(r, 5));
    });
    expect(result.current.mergedLayers.slice(0, 2).map((l) => l.id)).toEqual(["L1", "L2"]);
    expect(result.current.mergedLayers).toHaveLength(3);
  });
});
