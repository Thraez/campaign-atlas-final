// src/atlas/shell/useEditorKeyboardShortcuts.ts
import { useEffect } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { UndoStackAPI } from "@/atlas/useUndoStack";

export interface UseEditorKeyboardShortcutsArgs {
  undoStack: UndoStackAPI;
  pendingId: string | null;
  setPendingId: Dispatch<SetStateAction<string | null>>;
}

/**
 * Global keydown shortcuts for the placement editor: Esc cancels an
 * in-progress pin placement, and Cmd/Ctrl+Z / Cmd/Ctrl+Shift+Z / Ctrl+Y
 * drive the undo stack.
 */
export function useEditorKeyboardShortcuts({
  undoStack,
  pendingId,
  setPendingId,
}: UseEditorKeyboardShortcutsArgs): void {
  // Phase 1B B4: Esc cancels in-progress pin placement (the "Click on the
  // map to place X" banner has its own button; this just covers the same
  // exit via the keyboard).
  useEffect(() => {
    if (!pendingId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setPendingId(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // setPendingId's identity is stable (React setState setter); deps
    // intentionally match the original inline effect verbatim.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingId]);

  // Phase 1B B0: keyboard shortcuts for Undo / Redo.
  //   Cmd/Ctrl+Z       → undo
  //   Cmd/Ctrl+Shift+Z → redo
  //   Ctrl+Y           → redo (Windows alternate)
  // Skips when focus is in an editable surface (input, textarea, select,
  // contenteditable) so typing isn't hijacked.
  useEffect(() => {
    const isEditableTarget = (t: EventTarget | null): boolean => {
      if (!(t instanceof HTMLElement)) return false;
      const tag = t.tagName.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return true;
      if (t.isContentEditable) return true;
      return false;
    };
    const onKey = (e: KeyboardEvent) => {
      if (isEditableTarget(e.target)) return;
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      const k = e.key.toLowerCase();
      if (k === "z" && !e.shiftKey) {
        e.preventDefault();
        undoStack.undo();
      } else if ((k === "z" && e.shiftKey) || k === "y") {
        e.preventDefault();
        undoStack.redo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undoStack]);
}
