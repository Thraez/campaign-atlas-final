/**
 * Session-scoped undo/redo stack for the placement editor.
 *
 * Stores a sequence of `{ undo, redo }` callbacks. Each editor mutation
 * captures the prior state in closure and pushes its inverse, so undo
 * doesn't need to know what kind of edit it's reverting — it just calls
 * the recorded function.
 *
 * Lifetime is the editor mount: in-memory only, cleared on tab close or
 * reload. Cross-session persistence is deferred to Phase 2.
 *
 * The stack is capped (default 50 entries). When the cap is exceeded, the
 * oldest entries are evicted from the past stack. The future stack is
 * cleared whenever a new action is pushed (standard branch semantics).
 */
import { useCallback, useRef, useState } from "react";

export interface UndoAction {
  /** Reverts the mutation. */
  undo: () => void;
  /** Re-applies the mutation. */
  redo: () => void;
  /** Optional debug label, surfaced in tooltips. */
  label?: string;
}

export interface UndoStackAPI {
  /** Record a new action and clear any pending redo entries. */
  push: (action: UndoAction) => void;
  /** Pop the most recent past action, invoke its undo(), park it in future. */
  undo: () => void;
  /** Pop the most recent future action, invoke its redo(), park it in past. */
  redo: () => void;
  /** Wipe both stacks. */
  clear: () => void;
  canUndo: boolean;
  canRedo: boolean;
  pastSize: number;
  futureSize: number;
}

const DEFAULT_CAP = 50;

export function useUndoStack(cap: number = DEFAULT_CAP): UndoStackAPI {
  // Two parallel representations: React state drives renders, refs give the
  // callbacks synchronous access. The callbacks update both in lock-step
  // so they never disagree at the moment a mutation runs.
  const [past, setPast] = useState<UndoAction[]>([]);
  const [future, setFuture] = useState<UndoAction[]>([]);
  const pastRef = useRef<UndoAction[]>([]);
  const futureRef = useRef<UndoAction[]>([]);

  const push = useCallback(
    (action: UndoAction) => {
      const next = [...pastRef.current, action];
      const trimmed = next.length > cap ? next.slice(next.length - cap) : next;
      pastRef.current = trimmed;
      futureRef.current = [];
      setPast(trimmed);
      setFuture([]);
    },
    [cap],
  );

  const undo = useCallback(() => {
    const stack = pastRef.current;
    if (stack.length === 0) return;
    const last = stack[stack.length - 1];
    const nextPast = stack.slice(0, -1);
    const nextFuture = [...futureRef.current, last];
    pastRef.current = nextPast;
    futureRef.current = nextFuture;
    setPast(nextPast);
    setFuture(nextFuture);
    last.undo();
  }, []);

  const redo = useCallback(() => {
    const stack = futureRef.current;
    if (stack.length === 0) return;
    const last = stack[stack.length - 1];
    const nextFuture = stack.slice(0, -1);
    const nextPast = [...pastRef.current, last];
    pastRef.current = nextPast;
    futureRef.current = nextFuture;
    setPast(nextPast);
    setFuture(nextFuture);
    last.redo();
  }, []);

  const clear = useCallback(() => {
    pastRef.current = [];
    futureRef.current = [];
    setPast([]);
    setFuture([]);
  }, []);

  return {
    push,
    undo,
    redo,
    clear,
    canUndo: past.length > 0,
    canRedo: future.length > 0,
    pastSize: past.length,
    futureSize: future.length,
  };
}
