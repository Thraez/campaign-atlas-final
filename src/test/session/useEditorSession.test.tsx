import { describe, it, expect, beforeEach, vi } from "vitest";
import "fake-indexeddb/auto";
import { renderHook, act, waitFor } from "@testing-library/react";
import { idbGet, idbDelete } from "@/atlas/session/idbStore";
import { useEditorSession, SESSION_IDB_KEY } from "@/atlas/session/useEditorSession";
import type { CalendarDraft } from "@/atlas/session/sessionSnapshot";
import type { World } from "@/atlas/content/schema";

/**
 * Fake holder: tracks a count N. The overrides getter surfaces N fake entries
 * so sessionHasWork() can detect unsaved work without knowing the real holder
 * shapes. The overrides setter restores N from the entry count on rehydration.
 */
function makeHolder(initial = 0) {
  let n = initial;
  return {
    get value() {
      return { n };
    },
    bump() {
      n++;
    },
    setN(v: number) {
      n = v;
    },
  };
}

/** World settings and calendar drafts: whole-project holders, not per map. */
function makeWorldDrafts(): { world: Record<string, Partial<World>>; calendar: CalendarDraft } {
  return { world: {}, calendar: null };
}

function useHarness(
  activeMapId: string,
  holder: ReturnType<typeof makeHolder>,
  drafts = makeWorldDrafts(),
) {
  return useEditorSession({
    activeMapId,
    undoStack: { clear: vi.fn() } as any,
    holders: {
      overrides: {
        get: () => {
          const o: Record<string, { x: number; y: number }> = {};
          for (let i = 0; i < holder.value.n; i++) o[`${activeMapId}:e${i}`] = { x: i, y: i };
          return o;
        },
        set: (o: Record<string, unknown>) => {
          holder.setN(Object.values(o).filter(Boolean).length);
        },
      },
      mapOverride: { get: () => ({}), set: () => {} },
      region: { snapshot: () => ({ edits: {}, added: [], deleted: [] }), applySnapshot: () => {} },
      route: { snapshot: () => ({ edits: {}, added: [], deleted: [] }), applySnapshot: () => {} },
      fog: { snapshot: () => null, applySnapshot: () => {} },
      layer: { snapshot: () => [], applySnapshot: () => {} },
      editorEntity: { get: () => null, set: () => {} },
      world: {
        get: () => drafts.world,
        set: (w) => {
          drafts.world = w;
        },
      },
      calendar: {
        get: () => drafts.calendar,
        set: (c) => {
          drafts.calendar = c;
        },
      },
    },
    perMapDirtyCount: () => holder.value.n,
  });
}

describe("useEditorSession", () => {
  beforeEach(async () => {
    vi.useRealTimers();
    await idbDelete(SESSION_IDB_KEY);
  });

  it("starts clean with no snapshot", async () => {
    const h = makeHolder();
    const { result } = renderHook(() => useHarness("A", h));
    await waitFor(() => expect(result.current.hydrated).toBe(true));
    expect(result.current.status).toBe("clean");
    expect(result.current.unsavedCount).toBe(0);
    expect(result.current.restoredNotice).toBeNull();
  });

  it("goes unsaved with a count when a holder reports dirt", async () => {
    const h = makeHolder();
    const { result, rerender } = renderHook(() => useHarness("A", h));
    await waitFor(() => expect(result.current.hydrated).toBe(true));
    act(() => {
      h.bump();
      h.bump();
    });
    rerender();
    expect(result.current.status).toBe("unsaved");
    expect(result.current.unsavedCount).toBe(2);
  });

  it("persists to IDB (debounced) and re-hydrates with a restore notice", async () => {
    vi.useFakeTimers();
    const h = makeHolder();
    const first = renderHook(() => useHarness("A", h));
    await vi.waitFor(() => expect(first.result.current.hydrated).toBe(true));
    act(() => {
      h.bump();
      first.rerender();
    });
    await act(async () => {
      await vi.runAllTimersAsync();
    });
    vi.useRealTimers();

    const stored = await idbGet<unknown>(SESSION_IDB_KEY);
    expect(stored).not.toBeNull();

    const h2 = makeHolder();
    const second = renderHook(() => useHarness("A", h2));
    await waitFor(() => expect(second.result.current.hydrated).toBe(true));
    expect(second.result.current.restoredNotice).not.toBeNull();
    expect(h2.value.n).toBe(1); // holder rehydrated from snapshot
  });

  it("discardAll clears holders, IDB, undo, and returns to clean", async () => {
    const h = makeHolder();
    const { result, rerender } = renderHook(() => useHarness("A", h));
    await waitFor(() => expect(result.current.hydrated).toBe(true));
    act(() => {
      h.bump();
      rerender();
    });
    await act(async () => {
      await result.current.discardAll();
    });
    rerender();
    expect(result.current.status).toBe("clean");
    expect(await idbGet(SESSION_IDB_KEY)).toBeNull();
  });

  // eval-47: the world settings and calendar drafts are session holders, so
  // "Discard all" clears them like every other draft.
  it("discardAll clears the world settings and calendar drafts", async () => {
    const h = makeHolder();
    const drafts = makeWorldDrafts();
    const { result, rerender } = renderHook(() => useHarness("A", h, drafts));
    await waitFor(() => expect(result.current.hydrated).toBe(true));
    drafts.world = { w1: { name: "Renamed" } };
    drafts.calendar = { value: { months: [{ name: "Frost", days: 30 }] } };
    await act(async () => {
      await result.current.discardAll();
    });
    rerender();
    expect(drafts.world).toEqual({});
    expect(drafts.calendar).toBeNull();
  });

  it("persists the world settings and calendar drafts and restores them on reload", async () => {
    vi.useFakeTimers();
    const h = makeHolder();
    const drafts = makeWorldDrafts();
    const first = renderHook(() => useHarness("A", h, drafts));
    await vi.waitFor(() => expect(first.result.current.hydrated).toBe(true));
    act(() => {
      drafts.world = { w1: { name: "Renamed" } };
      drafts.calendar = { value: { months: [{ name: "Frost", days: 30 }] } };
      h.bump(); // the count change is what schedules a persist
      first.rerender();
    });
    await act(async () => {
      await vi.runAllTimersAsync();
    });
    vi.useRealTimers();

    const restored = makeWorldDrafts();
    const second = renderHook(() => useHarness("A", makeHolder(), restored));
    await waitFor(() => expect(second.result.current.hydrated).toBe(true));
    expect(restored.world).toEqual({ w1: { name: "Renamed" } });
    expect(restored.calendar).toEqual({ value: { months: [{ name: "Frost", days: 30 }] } });
  });

  it("markSaving → markSaved drives status and resets the count baseline", async () => {
    const h = makeHolder();
    const { result, rerender } = renderHook(() => useHarness("A", h));
    await waitFor(() => expect(result.current.hydrated).toBe(true));
    act(() => {
      h.bump();
      rerender();
    });
    act(() => {
      result.current.markSaving();
    });
    expect(result.current.status).toBe("saving");
    await act(async () => {
      await result.current.markSaved();
    });
    rerender();
    expect(result.current.status).toBe("saved");
  });

  it("markFailed surfaces the reason", async () => {
    const h = makeHolder();
    const { result } = renderHook(() => useHarness("A", h));
    await waitFor(() => expect(result.current.hydrated).toBe(true));
    act(() => {
      result.current.markFailed("disk permission denied");
    });
    expect(result.current.status).toBe("failed");
    expect(result.current.failedReason).toBe("disk permission denied");
  });

  // B1 regression: opening the review modal flips status to "saving"; if the
  // DM cancels the modal, markIdle must drop "saving" back to the true dirty
  // state (NOT "failed" — cancelling a review is not an error) so the Save
  // button re-enables without a page reload.
  it("markIdle reverts a premature 'saving' back to 'unsaved' when dirt remains", async () => {
    const h = makeHolder();
    const { result, rerender } = renderHook(() => useHarness("A", h));
    await waitFor(() => expect(result.current.hydrated).toBe(true));
    act(() => {
      h.bump();
      rerender();
    });
    expect(result.current.status).toBe("unsaved");
    act(() => {
      result.current.markSaving();
    });
    expect(result.current.status).toBe("saving");
    act(() => {
      result.current.markIdle();
    });
    expect(result.current.status).toBe("unsaved");
    expect(result.current.failedReason).toBeNull();
  });

  it("markIdle returns to 'clean' when no dirt remains", async () => {
    const h = makeHolder();
    const { result } = renderHook(() => useHarness("A", h));
    await waitFor(() => expect(result.current.hydrated).toBe(true));
    act(() => {
      result.current.markSaving();
    });
    expect(result.current.status).toBe("saving");
    act(() => {
      result.current.markIdle();
    });
    expect(result.current.status).toBe("clean");
  });

  it("markIdle clears a prior failed reason", async () => {
    const h = makeHolder();
    const { result } = renderHook(() => useHarness("A", h));
    await waitFor(() => expect(result.current.hydrated).toBe(true));
    act(() => {
      result.current.markFailed("disk permission denied");
    });
    expect(result.current.status).toBe("failed");
    act(() => {
      result.current.markIdle();
    });
    expect(result.current.status).toBe("clean");
    expect(result.current.failedReason).toBeNull();
  });
});
