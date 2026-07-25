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
  const preventDefault = vi.spyOn(event, "preventDefault");
  if (target) {
    Object.defineProperty(event, "target", { value: target, configurable: true });
  }
  window.dispatchEvent(event);
  return preventDefault;
}

describe("useEditorKeyboardShortcuts", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("Escape cancels pending placement when pendingId is set", () => {
    const undoStack = fakeUndoStack();
    const setPendingId = vi.fn();
    const onSave = vi.fn();
    renderHook(() =>
      useEditorKeyboardShortcuts({
        undoStack,
        pendingId: "entity-1",
        setPendingId,
        onSave,
        canSave: true,
      }),
    );
    dispatchKey({ key: "Escape" });
    expect(setPendingId).toHaveBeenCalledWith(null);
  });

  it("Escape does nothing when pendingId is null", () => {
    const undoStack = fakeUndoStack();
    const setPendingId = vi.fn();
    const onSave = vi.fn();
    renderHook(() =>
      useEditorKeyboardShortcuts({ undoStack, pendingId: null, setPendingId, onSave, canSave: true }),
    );
    dispatchKey({ key: "Escape" });
    expect(setPendingId).not.toHaveBeenCalled();
  });

  it("Ctrl+Z triggers undo", () => {
    const undoStack = fakeUndoStack();
    const setPendingId = vi.fn();
    const onSave = vi.fn();
    renderHook(() =>
      useEditorKeyboardShortcuts({ undoStack, pendingId: null, setPendingId, onSave, canSave: true }),
    );
    dispatchKey({ key: "z", ctrlKey: true });
    expect(undoStack.undo).toHaveBeenCalledTimes(1);
    expect(undoStack.redo).not.toHaveBeenCalled();
  });

  it("Ctrl+Shift+Z triggers redo", () => {
    const undoStack = fakeUndoStack();
    const setPendingId = vi.fn();
    const onSave = vi.fn();
    renderHook(() =>
      useEditorKeyboardShortcuts({ undoStack, pendingId: null, setPendingId, onSave, canSave: true }),
    );
    dispatchKey({ key: "z", ctrlKey: true, shiftKey: true });
    expect(undoStack.redo).toHaveBeenCalledTimes(1);
    expect(undoStack.undo).not.toHaveBeenCalled();
  });

  it("Ctrl+Y triggers redo (Windows alternate)", () => {
    const undoStack = fakeUndoStack();
    const setPendingId = vi.fn();
    const onSave = vi.fn();
    renderHook(() =>
      useEditorKeyboardShortcuts({ undoStack, pendingId: null, setPendingId, onSave, canSave: true }),
    );
    dispatchKey({ key: "y", ctrlKey: true });
    expect(undoStack.redo).toHaveBeenCalledTimes(1);
    expect(undoStack.undo).not.toHaveBeenCalled();
  });

  it("skips undo/redo when the event target is an editable element (input)", () => {
    const undoStack = fakeUndoStack();
    const setPendingId = vi.fn();
    const onSave = vi.fn();
    renderHook(() =>
      useEditorKeyboardShortcuts({ undoStack, pendingId: null, setPendingId, onSave, canSave: true }),
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
    const onSave = vi.fn();
    renderHook(() =>
      useEditorKeyboardShortcuts({ undoStack, pendingId: null, setPendingId, onSave, canSave: true }),
    );
    dispatchKey({ key: "z" });
    expect(undoStack.undo).not.toHaveBeenCalled();
    expect(undoStack.redo).not.toHaveBeenCalled();
  });

  it("Ctrl+S calls onSave and prevents the browser Save dialog", () => {
    const undoStack = fakeUndoStack();
    const setPendingId = vi.fn();
    const onSave = vi.fn();
    renderHook(() =>
      useEditorKeyboardShortcuts({ undoStack, pendingId: null, setPendingId, onSave, canSave: true }),
    );
    const preventDefault = dispatchKey({ key: "s", ctrlKey: true });
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(preventDefault).toHaveBeenCalled();
  });

  it("Cmd+S (metaKey) calls onSave", () => {
    const undoStack = fakeUndoStack();
    const setPendingId = vi.fn();
    const onSave = vi.fn();
    renderHook(() =>
      useEditorKeyboardShortcuts({ undoStack, pendingId: null, setPendingId, onSave, canSave: true }),
    );
    dispatchKey({ key: "s", metaKey: true });
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it("Ctrl+S still fires (and prevents default) when focus is in an input", () => {
    const undoStack = fakeUndoStack();
    const setPendingId = vi.fn();
    const onSave = vi.fn();
    renderHook(() =>
      useEditorKeyboardShortcuts({ undoStack, pendingId: null, setPendingId, onSave, canSave: true }),
    );
    const input = document.createElement("input");
    document.body.appendChild(input);
    const preventDefault = dispatchKey({ key: "s", ctrlKey: true }, input);
    document.body.removeChild(input);
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(preventDefault).toHaveBeenCalled();
  });

  it("Ctrl+S still prevents the browser dialog but no-ops onSave when canSave is false", () => {
    const undoStack = fakeUndoStack();
    const setPendingId = vi.fn();
    const onSave = vi.fn();
    renderHook(() =>
      useEditorKeyboardShortcuts({
        undoStack,
        pendingId: null,
        setPendingId,
        onSave,
        canSave: false,
      }),
    );
    const preventDefault = dispatchKey({ key: "s", ctrlKey: true });
    expect(onSave).not.toHaveBeenCalled();
    expect(preventDefault).toHaveBeenCalled();
  });

  it("bare 's' without a modifier does not save", () => {
    const undoStack = fakeUndoStack();
    const setPendingId = vi.fn();
    const onSave = vi.fn();
    renderHook(() =>
      useEditorKeyboardShortcuts({ undoStack, pendingId: null, setPendingId, onSave, canSave: true }),
    );
    dispatchKey({ key: "s" });
    expect(onSave).not.toHaveBeenCalled();
  });

  it("removes its listeners on unmount", () => {
    const undoStack = fakeUndoStack();
    const setPendingId = vi.fn();
    const onSave = vi.fn();
    const { unmount } = renderHook(() =>
      useEditorKeyboardShortcuts({
        undoStack,
        pendingId: "entity-1",
        setPendingId,
        onSave,
        canSave: true,
      }),
    );
    unmount();
    dispatchKey({ key: "Escape" });
    dispatchKey({ key: "z", ctrlKey: true });
    dispatchKey({ key: "s", ctrlKey: true });
    expect(setPendingId).not.toHaveBeenCalled();
    expect(undoStack.undo).not.toHaveBeenCalled();
    expect(onSave).not.toHaveBeenCalled();
  });
});
