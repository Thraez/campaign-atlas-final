// src/test/shell/useEditorKeyboardShortcuts.test.ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useEditorKeyboardShortcuts } from "@/atlas/shell/useEditorKeyboardShortcuts";
import type { UndoStackAPI } from "@/atlas/useUndoStack";

function fakeUndoStack(): UndoStackAPI {
  return {
    push: vi.fn(),
    undo: vi.fn(),
    redo: vi.fn(),
    clear: vi.fn(),
    canUndo: false,
    canRedo: false,
    pastSize: 0,
    futureSize: 0,
  };
}

function dispatchKey(init: KeyboardEventInit, target?: EventTarget) {
  const event = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });
  if (target) {
    Object.defineProperty(event, "target", { value: target, configurable: true });
  }
  window.dispatchEvent(event);
}

describe("useEditorKeyboardShortcuts", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("Escape cancels pending placement when pendingId is set", () => {
    const undoStack = fakeUndoStack();
    const setPendingId = vi.fn();
    renderHook(() =>
      useEditorKeyboardShortcuts({ undoStack, pendingId: "entity-1", setPendingId }),
    );
    dispatchKey({ key: "Escape" });
    expect(setPendingId).toHaveBeenCalledWith(null);
  });

  it("Escape does nothing when pendingId is null", () => {
    const undoStack = fakeUndoStack();
    const setPendingId = vi.fn();
    renderHook(() => useEditorKeyboardShortcuts({ undoStack, pendingId: null, setPendingId }));
    dispatchKey({ key: "Escape" });
    expect(setPendingId).not.toHaveBeenCalled();
  });

  it("Ctrl+Z triggers undo", () => {
    const undoStack = fakeUndoStack();
    const setPendingId = vi.fn();
    renderHook(() =>
      useEditorKeyboardShortcuts({ undoStack, pendingId: null, setPendingId }),
    );
    dispatchKey({ key: "z", ctrlKey: true });
    expect(undoStack.undo).toHaveBeenCalledTimes(1);
    expect(undoStack.redo).not.toHaveBeenCalled();
  });

  it("Ctrl+Shift+Z triggers redo", () => {
    const undoStack = fakeUndoStack();
    const setPendingId = vi.fn();
    renderHook(() =>
      useEditorKeyboardShortcuts({ undoStack, pendingId: null, setPendingId }),
    );
    dispatchKey({ key: "z", ctrlKey: true, shiftKey: true });
    expect(undoStack.redo).toHaveBeenCalledTimes(1);
    expect(undoStack.undo).not.toHaveBeenCalled();
  });

  it("Ctrl+Y triggers redo (Windows alternate)", () => {
    const undoStack = fakeUndoStack();
    const setPendingId = vi.fn();
    renderHook(() =>
      useEditorKeyboardShortcuts({ undoStack, pendingId: null, setPendingId }),
    );
    dispatchKey({ key: "y", ctrlKey: true });
    expect(undoStack.redo).toHaveBeenCalledTimes(1);
    expect(undoStack.undo).not.toHaveBeenCalled();
  });

  it("skips undo/redo when the event target is an editable element (input)", () => {
    const undoStack = fakeUndoStack();
    const setPendingId = vi.fn();
    renderHook(() =>
      useEditorKeyboardShortcuts({ undoStack, pendingId: null, setPendingId }),
    );
    const input = document.createElement("input");
    document.body.appendChild(input);
    dispatchKey({ key: "z", ctrlKey: true }, input);
    document.body.removeChild(input);
    expect(undoStack.undo).not.toHaveBeenCalled();
  });

  it("does nothing on a bare key without a modifier", () => {
    const undoStack = fakeUndoStack();
    const setPendingId = vi.fn();
    renderHook(() =>
      useEditorKeyboardShortcuts({ undoStack, pendingId: null, setPendingId }),
    );
    dispatchKey({ key: "z" });
    expect(undoStack.undo).not.toHaveBeenCalled();
    expect(undoStack.redo).not.toHaveBeenCalled();
  });

  it("removes its listeners on unmount", () => {
    const undoStack = fakeUndoStack();
    const setPendingId = vi.fn();
    const { unmount } = renderHook(() =>
      useEditorKeyboardShortcuts({ undoStack, pendingId: "entity-1", setPendingId }),
    );
    unmount();
    dispatchKey({ key: "Escape" });
    dispatchKey({ key: "z", ctrlKey: true });
    expect(setPendingId).not.toHaveBeenCalled();
    expect(undoStack.undo).not.toHaveBeenCalled();
  });
});
