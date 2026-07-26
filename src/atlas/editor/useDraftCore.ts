/**
 * Generic undo-integrated draft-mutation core shared by useRegionDraft and
 * useRouteDraft. Both hold state shaped as { edits, added, deleted } and
 * mutate it via the same before/after-snapshot + undo-stack-push pattern —
 * this hook is that machinery, factored out once.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { UndoStackAPI } from "@/atlas/useUndoStack";

export interface DraftShape {
  edits: Record<string, unknown>;
  added: unknown[];
  deleted: string[];
}

export interface DraftCoreAPI<T extends DraftShape> {
  draft: T;
  /** Synchronous read of the latest draft, even mid-tick before React re-renders. */
  getDraft: () => T;
  applyDraft: (next: T) => void;
  mutateDraft: (compute: (prev: T) => T, label: string) => void;
  dirty: boolean;
  dirtyCount: number;
}

export function useDraftCore<T extends DraftShape>(
  initial: T,
  undoStack?: UndoStackAPI,
): DraftCoreAPI<T> {
  const [draft, setDraft] = useState<T>(initial);

  // Synchronous mirror of `draft` so consecutive mutations and undo callbacks
  // can read the latest state without waiting for React to flush.
  const draftRef = useRef(draft);
  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  const applyDraft = useCallback((next: T) => {
    draftRef.current = next;
    setDraft(next);
  }, []);

  const getDraft = useCallback(() => draftRef.current, []);

  /**
   * Mutate the draft and (optionally) push an undo entry capturing the
   * snapshot before/after. Use this in place of setDraft for any mutation
   * that the DM should be able to Cmd+Z.
   */
  const mutateDraft = useCallback(
    (compute: (prev: T) => T, label: string) => {
      const before = draftRef.current;
      const after = compute(before);
      if (after === before) return;
      applyDraft(after);
      if (undoStack) {
        undoStack.push({
          undo: () => applyDraft(before),
          redo: () => applyDraft(after),
          label,
        });
      }
    },
    [applyDraft, undoStack],
  );

  const dirty =
    draft.added.length > 0 || draft.deleted.length > 0 || Object.keys(draft.edits).length > 0;
  const dirtyCount = draft.added.length + draft.deleted.length + Object.keys(draft.edits).length;

  return { draft, getDraft, applyDraft, mutateDraft, dirty, dirtyCount };
}
