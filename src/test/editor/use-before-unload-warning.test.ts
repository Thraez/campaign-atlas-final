import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useBeforeUnloadWarning } from "@/atlas/editor/useBeforeUnloadWarning";

function dispatchBeforeUnload() {
  const event = new Event("beforeunload", { cancelable: true }) as BeforeUnloadEvent;
  window.dispatchEvent(event);
  return event;
}

describe("useBeforeUnloadWarning", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does not warn while shouldWarn is false", () => {
    renderHook(() => useBeforeUnloadWarning(false));
    const event = dispatchBeforeUnload();
    expect(event.defaultPrevented).toBe(false);
  });

  it("prevents default while shouldWarn is true", () => {
    renderHook(() => useBeforeUnloadWarning(true));
    const event = dispatchBeforeUnload();
    expect(event.defaultPrevented).toBe(true);
    // Per spec, returnValue is a computed getter tied to the canceled flag
    // once preventDefault() has run, so it reads back falsy rather than "".
    expect(event.returnValue).toBeFalsy();
  });

  it("adds the listener on mount and removes it on unmount", () => {
    const addSpy = vi.spyOn(window, "addEventListener");
    const removeSpy = vi.spyOn(window, "removeEventListener");
    const { unmount } = renderHook(() => useBeforeUnloadWarning(true));
    expect(addSpy).toHaveBeenCalledWith("beforeunload", expect.any(Function));
    unmount();
    expect(removeSpy).toHaveBeenCalledWith("beforeunload", expect.any(Function));
  });

  it("stops warning once shouldWarn flips back to false", () => {
    const { rerender } = renderHook(({ dirty }) => useBeforeUnloadWarning(dirty), {
      initialProps: { dirty: true },
    });
    expect(dispatchBeforeUnload().defaultPrevented).toBe(true);

    rerender({ dirty: false });
    expect(dispatchBeforeUnload().defaultPrevented).toBe(false);
  });
});
