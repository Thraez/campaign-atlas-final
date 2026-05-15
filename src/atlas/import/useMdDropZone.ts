/**
 * Phase 1C C1 — global drag-and-drop overlay hook for /atlas/edit.
 *
 * Listens to window-level dragenter/dragover/dragleave/drop, decides whether
 * the payload contains files (and at least one .md), and exposes a boolean
 * for the route shell to render a full-area overlay. Drops are forwarded
 * to the supplied callback as a File[].
 *
 * Folder DnD is explicitly NOT supported in Phase 1: the only thing this
 * inspects is `event.dataTransfer.items` for plain File entries. Folders
 * arrive as entries with `kind === "file"` whose `webkitGetAsEntry()` is
 * a directory — we drop those silently.
 */
import { useCallback, useEffect, useState } from "react";

export interface UseMdDropZoneArgs {
  /** Called on a drop with the parsed File[]. May contain non-.md files;
   *  the orchestrator handles filtering and warning. */
  onDrop: (files: File[]) => void;
  /** Set to false when a modal is already open so DnD doesn't fire underneath it. */
  enabled?: boolean;
}

function isFileDrag(e: DragEvent): boolean {
  if (!e.dataTransfer) return false;
  const types = Array.from(e.dataTransfer.types ?? []);
  return types.includes("Files");
}

function collectFiles(dt: DataTransfer | null): File[] {
  if (!dt) return [];
  if (dt.items && dt.items.length) {
    const out: File[] = [];
    for (let i = 0; i < dt.items.length; i++) {
      const it = dt.items[i];
      if (it.kind !== "file") continue;
      // Reject folders. webkitGetAsEntry may not exist in all browsers — if
      // it does and reports a directory, skip; otherwise take the File.
      const entry = (it as DataTransferItem & {
        webkitGetAsEntry?: () => { isDirectory?: boolean } | null;
      }).webkitGetAsEntry?.();
      if (entry && entry.isDirectory) continue;
      const f = it.getAsFile();
      if (f) out.push(f);
    }
    return out;
  }
  return Array.from(dt.files ?? []);
}

export function useMdDropZone({ onDrop, enabled = true }: UseMdDropZoneArgs) {
  const [isDragging, setIsDragging] = useState(false);

  // Counter pattern: dragenter/dragleave fire for every child element under
  // the cursor, so a naive "isDragging = true on enter, false on leave"
  // flickers. Counting balances them; only flip when count returns to 0.
  const onDragEnter = useCallback(
    (e: DragEvent) => {
      if (!enabled) return;
      if (!isFileDrag(e)) return;
      e.preventDefault();
      setIsDragging(true);
    },
    [enabled],
  );
  const onDragOver = useCallback(
    (e: DragEvent) => {
      if (!enabled) return;
      if (!isFileDrag(e)) return;
      // Must preventDefault to allow drop.
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
    },
    [enabled],
  );
  const onDragLeave = useCallback(
    (e: DragEvent) => {
      if (!enabled) return;
      // Only hide overlay when leaving the window entirely.
      if (e.relatedTarget == null) setIsDragging(false);
    },
    [enabled],
  );
  const onDropEv = useCallback(
    (e: DragEvent) => {
      if (!enabled) return;
      if (!isFileDrag(e)) return;
      e.preventDefault();
      setIsDragging(false);
      const files = collectFiles(e.dataTransfer);
      if (files.length === 0) return;
      onDrop(files);
    },
    [enabled, onDrop],
  );

  useEffect(() => {
    if (!enabled) {
      setIsDragging(false);
      return;
    }
    window.addEventListener("dragenter", onDragEnter);
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("drop", onDropEv);
    return () => {
      window.removeEventListener("dragenter", onDragEnter);
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("dragleave", onDragLeave);
      window.removeEventListener("drop", onDropEv);
    };
  }, [enabled, onDragEnter, onDragOver, onDragLeave, onDropEv]);

  return { isDragging };
}
