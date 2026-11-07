/**
 * One piece of editor draft state whose edits go on the session undo stack.
 *
 * `ref` reads the value synchronously (before React re-renders). `set`
 * replaces it without recording: for the session's restore and discard and
 * the save cleanup, which records its own single undo entry. `update`
 * records one undo entry per change.
 */
import { useCallback, useRef, useState } from "react";
import type { UndoStackAPI } from "@/atlas/useUndoStack";

export function useUndoableState<T>(initial: T, undoStack: Pick<UndoStackAPI, "push">) {
  const [value, setValue] = useState(initial);
  const ref = useRef(initial);
  const set = useCallback((v: T) => {
    ref.current = v;
    setValue(v);
  }, []);
  const update = useCallback(
    (compute: (prev: T) => T, label: string) => {
      const before = ref.current;
      const after = compute(before);
      if (after === before) return;
      set(after);
      undoStack.push({ undo: () => set(before), redo: () => set(after), label });
    },
    [set, undoStack],
  );
  return { value, ref, set, update };
}
