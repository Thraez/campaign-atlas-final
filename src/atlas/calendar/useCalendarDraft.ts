/**
 * The editor's world calendar draft over canon: undo-tracked (via
 * useUndoableState), a session holder, and what the save writes (`effective`).
 */
import { useEffect } from "react";
import type { AtlasProject } from "@/atlas/content/schema";
import type { CalendarDraft } from "@/atlas/session/sessionSnapshot";
import type { UndoStackAPI } from "@/atlas/useUndoStack";
import { useUndoableState } from "@/atlas/useUndoableState";

export function useCalendarDraft(
  /** Canon; null while it is still loading. */
  project: Pick<AtlasProject, "calendar"> | null,
  undoStack: Pick<UndoStackAPI, "push">,
) {
  const draft = useUndoableState<CalendarDraft>(null, undoStack);
  const canon = project?.calendar;
  const effective = draft.value ? draft.value.value : canon;
  const dirty =
    !!draft.value && JSON.stringify(draft.value.value ?? null) !== JSON.stringify(canon ?? null);

  // A draft equal to canon (as after a save once canon reloads) is no draft:
  // drop it, without an undo entry, so a later canon change can't turn the
  // stale copy into an edit that writes the old calendar back.
  const { value, set } = draft;
  useEffect(() => {
    if (project && value && !dirty) set(null);
  }, [project, value, dirty, set]);

  return { ...draft, effective, dirty };
}
