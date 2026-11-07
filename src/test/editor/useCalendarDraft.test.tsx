import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useUndoStack } from "@/atlas/useUndoStack";
import { useCalendarDraft } from "@/atlas/calendar/useCalendarDraft";
import type { WorldCalendar } from "@/atlas/content/schema";

const frost: WorldCalendar = { months: [{ name: "Frost", days: 30 }] };
const thaw: WorldCalendar = { months: [{ name: "Thaw", days: 28 }] };

function useHarness(project: { calendar?: WorldCalendar } | null) {
  const undoStack = useUndoStack();
  return { undoStack, calendar: useCalendarDraft(project, undoStack) };
}

describe("useCalendarDraft", () => {
  it("an edit is dirty, is what the save writes, and undo reverts it", () => {
    const { result } = renderHook(() => useHarness({ calendar: frost }));
    act(() => result.current.calendar.update(() => ({ value: thaw }), "calendar"));
    expect(result.current.calendar.dirty).toBe(true);
    expect(result.current.calendar.effective).toEqual(thaw);

    act(() => {
      result.current.undoStack.undo();
    });
    expect(result.current.calendar.dirty).toBe(false);
    expect(result.current.calendar.effective).toEqual(frost);
  });

  // eval-47 review: after a save the draft equals the reloaded canon. Kept, it
  // would turn dirty when canon changes again (a Sync from Obsidian) and the
  // next save would write the old calendar back.
  it("drops a draft once canon equals it, so a later canon change stays clean", () => {
    const { result, rerender } = renderHook(({ project }) => useHarness(project), {
      initialProps: { project: { calendar: frost } },
    });
    act(() => result.current.calendar.update(() => ({ value: thaw }), "calendar"));
    const undoEntries = result.current.undoStack.pastSize;

    rerender({ project: { calendar: thaw } }); // saved; canon reloaded
    expect(result.current.calendar.value).toBeNull();
    expect(result.current.undoStack.pastSize).toBe(undoEntries); // no undo entry

    rerender({ project: { calendar: frost } }); // canon changes underneath
    expect(result.current.calendar.dirty).toBe(false);
    expect(result.current.calendar.effective).toEqual(frost); // the save writes canon
  });

  it("keeps a restored draft while canon is still loading", () => {
    const { result, rerender } = renderHook(({ project }) => useHarness(project), {
      initialProps: { project: null as { calendar?: WorldCalendar } | null },
    });
    act(() => result.current.calendar.set({ value: undefined })); // calendar cleared
    expect(result.current.calendar.value).toEqual({ value: undefined });

    rerender({ project: { calendar: frost } });
    expect(result.current.calendar.dirty).toBe(true);
    expect(result.current.calendar.effective).toBeUndefined();
  });
});
