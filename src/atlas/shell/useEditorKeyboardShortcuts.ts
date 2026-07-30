// src/atlas/shell/useEditorKeyboardShortcuts.ts
import { useEffect } from "react";
import type { Dispatch, SetStateAction } from "react";
import { toast } from "sonner";
import type { UndoStackAPI } from "@/atlas/useUndoStack";

export interface UseEditorKeyboardShortcutsArgs {
  undoStack: UndoStackAPI;
  pendingId: string | null;
  setPendingId: Dispatch<SetStateAction<string | null>>;
  onSave: () => void;
  canSave: boolean;
}

/**
 * Global keydown shortcuts for the placement editor: Esc cancels an
 * in-progress pin placement, Cmd/Ctrl+Z / Cmd/Ctrl+Shift+Z / Ctrl+Y drive
 * the undo stack, and Cmd/Ctrl+S saves.
 */
export function useEditorKeyboardShortcuts({
  undoStack,
  pendingId,
  setPendingId,
  onSave,
  canSave,
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
        const label = undoStack.undo();
        if (label) toast.info(`Undid: ${label}`);
      } else if ((k === "z" && e.shiftKey) || k === "y") {
        e.preventDefault();
        const label = undoStack.redo();
        if (label) toast.info(`Redid: ${label}`);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undoStack]);

  // Q40: Cmd/Ctrl+S saves. Must fire even when focus is in an input/textarea
  // (unlike undo/redo) so it always suppresses the browser's Save dialog;
  // the actual save is a no-op via canSave when the session is clean or a
  // save is already in flight.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod || e.key.toLowerCase() !== "s") return;
      e.preventDefault();
      if (canSave) onSave();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onSave, canSave]);
}
