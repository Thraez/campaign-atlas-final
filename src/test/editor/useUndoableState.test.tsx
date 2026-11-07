import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useUndoStack } from "@/atlas/useUndoStack";
import { useUndoableState } from "@/atlas/useUndoableState";

// eval-47: the calendar and world settings drafts go through this, so their
// edits are undoable and the session can still set them without recording.
function useHarness() {
  const undoStack = useUndoStack();
  const draft = useUndoableState<{ value: string } | null>(null, undoStack);
  return { undoStack, draft };
}

describe("useUndoableState", () => {
  it("records an edit that undo reverts and redo re-applies", () => {
    const { result } = renderHook(() => useHarness());
    act(() => result.current.draft.update(() => ({ value: "Frost" }), "calendar"));
    expect(result.current.draft.value).toEqual({ value: "Frost" });
    expect(result.current.draft.ref.current).toEqual({ value: "Frost" });

    act(() => {
      result.current.undoStack.undo();
    });
    expect(result.current.draft.value).toBeNull();
    expect(result.current.draft.ref.current).toBeNull();

    act(() => {
      result.current.undoStack.redo();
    });
    expect(result.current.draft.value).toEqual({ value: "Frost" });
  });

  it("set replaces the value without recording an undo entry", () => {
    const { result } = renderHook(() => useHarness());
    act(() => result.current.draft.set({ value: "Thaw" }));
    expect(result.current.draft.value).toEqual({ value: "Thaw" });
    expect(result.current.undoStack.canUndo).toBe(false);
  });

  it("records nothing when the edit returns the same value", () => {
    const { result } = renderHook(() => useHarness());
    act(() => result.current.draft.update((prev) => prev, "calendar"));
    expect(result.current.undoStack.canUndo).toBe(false);
  });
});
