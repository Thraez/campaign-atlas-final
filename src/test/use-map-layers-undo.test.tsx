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
});
