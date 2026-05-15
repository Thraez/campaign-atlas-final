import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useUndoStack } from "@/atlas/useUndoStack";

describe("useUndoStack", () => {
  it("starts empty: canUndo / canRedo false", () => {
    const { result } = renderHook(() => useUndoStack());
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);
    expect(result.current.pastSize).toBe(0);
    expect(result.current.futureSize).toBe(0);
  });

  it("push records the action and enables undo", () => {
    const { result } = renderHook(() => useUndoStack());
    const undo = vi.fn();
    const redo = vi.fn();
    act(() => result.current.push({ undo, redo, label: "test" }));
    expect(result.current.canUndo).toBe(true);
    expect(result.current.canRedo).toBe(false);
    expect(result.current.pastSize).toBe(1);
    // push itself must not invoke either side.
    expect(undo).not.toHaveBeenCalled();
    expect(redo).not.toHaveBeenCalled();
  });

  it("undo invokes the undo callback and moves entry to future stack", () => {
    const { result } = renderHook(() => useUndoStack());
    const undo = vi.fn();
    const redo = vi.fn();
    act(() => result.current.push({ undo, redo }));
    act(() => result.current.undo());
    expect(undo).toHaveBeenCalledTimes(1);
    expect(redo).not.toHaveBeenCalled();
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(true);
    expect(result.current.pastSize).toBe(0);
    expect(result.current.futureSize).toBe(1);
  });

  it("redo invokes the redo callback and moves entry back to past", () => {
    const { result } = renderHook(() => useUndoStack());
    const undo = vi.fn();
    const redo = vi.fn();
    act(() => result.current.push({ undo, redo }));
    act(() => result.current.undo());
    act(() => result.current.redo());
    expect(redo).toHaveBeenCalledTimes(1);
    expect(result.current.canUndo).toBe(true);
    expect(result.current.canRedo).toBe(false);
    expect(result.current.pastSize).toBe(1);
    expect(result.current.futureSize).toBe(0);
  });

  it("a new push clears the future stack (no more redo after a new branch)", () => {
    const { result } = renderHook(() => useUndoStack());
    const a = { undo: vi.fn(), redo: vi.fn(), label: "a" };
    const b = { undo: vi.fn(), redo: vi.fn(), label: "b" };
    act(() => result.current.push(a));
    act(() => result.current.undo()); // a is now in future
    expect(result.current.canRedo).toBe(true);
    act(() => result.current.push(b)); // pushes new action
    expect(result.current.canRedo).toBe(false);
    expect(result.current.futureSize).toBe(0);
    expect(result.current.pastSize).toBe(1);
  });

  it("undo is a no-op when stack is empty (idempotent)", () => {
    const { result } = renderHook(() => useUndoStack());
    expect(() => act(() => result.current.undo())).not.toThrow();
    expect(result.current.canUndo).toBe(false);
  });

  it("redo is a no-op when future is empty", () => {
    const { result } = renderHook(() => useUndoStack());
    expect(() => act(() => result.current.redo())).not.toThrow();
    expect(result.current.canRedo).toBe(false);
  });

  it("multiple pushes + multiple undos restore LIFO order", () => {
    const { result } = renderHook(() => useUndoStack());
    const log: string[] = [];
    const make = (id: string) => ({
      undo: () => log.push(`undo:${id}`),
      redo: () => log.push(`redo:${id}`),
      label: id,
    });
    act(() => result.current.push(make("a")));
    act(() => result.current.push(make("b")));
    act(() => result.current.push(make("c")));
    act(() => result.current.undo());
    act(() => result.current.undo());
    act(() => result.current.undo());
    expect(log).toEqual(["undo:c", "undo:b", "undo:a"]);
  });

  it("caps the past stack at the configured size, dropping oldest", () => {
    const { result } = renderHook(() => useUndoStack(3));
    for (let i = 0; i < 5; i++) {
      const id = String(i);
      act(() =>
        result.current.push({ undo: () => {}, redo: () => {}, label: id }),
      );
    }
    expect(result.current.pastSize).toBe(3);
    // The 3 most recent ("2","3","4") should still undo; "0" and "1" were evicted.
    // We can't observe labels directly without exposing internals, but undoSize
    // should be exactly 3.
  });

  it("clear() wipes both stacks", () => {
    const { result } = renderHook(() => useUndoStack());
    act(() => result.current.push({ undo: () => {}, redo: () => {} }));
    act(() => result.current.push({ undo: () => {}, redo: () => {} }));
    act(() => result.current.undo());
    act(() => result.current.clear());
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);
    expect(result.current.pastSize).toBe(0);
    expect(result.current.futureSize).toBe(0);
  });

  it("undo then redo then undo invokes callbacks in the right order", () => {
    const { result } = renderHook(() => useUndoStack());
    const log: string[] = [];
    const a = {
      undo: () => log.push("u:a"),
      redo: () => log.push("r:a"),
    };
    act(() => result.current.push(a));
    act(() => result.current.undo());
    act(() => result.current.redo());
    act(() => result.current.undo());
    expect(log).toEqual(["u:a", "r:a", "u:a"]);
  });

  it("default cap is 50", () => {
    const { result } = renderHook(() => useUndoStack());
    for (let i = 0; i < 55; i++) {
      act(() => result.current.push({ undo: () => {}, redo: () => {} }));
    }
    expect(result.current.pastSize).toBe(50);
  });

  it("push/undo/redo callbacks are stable references across renders", () => {
    const { result, rerender } = renderHook(() => useUndoStack());
    const first = {
      push: result.current.push,
      undo: result.current.undo,
      redo: result.current.redo,
      clear: result.current.clear,
    };
    act(() => result.current.push({ undo: () => {}, redo: () => {} }));
    rerender();
    expect(result.current.push).toBe(first.push);
    expect(result.current.undo).toBe(first.undo);
    expect(result.current.redo).toBe(first.redo);
    expect(result.current.clear).toBe(first.clear);
  });

  it("oldest action is evicted under cap; remaining actions still undo correctly", () => {
    const { result } = renderHook(() => useUndoStack(2));
    const log: string[] = [];
    const make = (id: string) => ({
      undo: () => log.push(`u:${id}`),
      redo: () => log.push(`r:${id}`),
    });
    act(() => result.current.push(make("a")));
    act(() => result.current.push(make("b")));
    act(() => result.current.push(make("c"))); // evicts "a"
    act(() => result.current.undo()); // should undo "c"
    act(() => result.current.undo()); // should undo "b"
    act(() => result.current.undo()); // no-op, "a" was evicted
    expect(log).toEqual(["u:c", "u:b"]);
  });
});
