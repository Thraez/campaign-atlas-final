import { describe, it, expect, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useHasDesktopAside } from "@/hooks/use-has-desktop-aside";

/**
 * Guards the desktop/bottom-sheet breakpoint decision. A regression here would
 * either mount both surfaces at once or leave a viewport width with neither,
 * which is exactly the "dead zone" the hook's doc-comment promises to avoid.
 */
const BREAKPOINT = 1024;
const originalMatchMedia = window.matchMedia;
const originalInnerWidth = window.innerWidth;

function setWidth(w: number): void {
  Object.defineProperty(window, "innerWidth", { configurable: true, writable: true, value: w });
}

/** Install a matchMedia whose "change" listeners we can fire on demand. */
function captureMatchMedia(): { fireChange: () => void } {
  const listeners = new Set<() => void>();
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: window.innerWidth >= BREAKPOINT,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: (_type: string, cb: () => void) => listeners.add(cb),
      removeEventListener: (_type: string, cb: () => void) => listeners.delete(cb),
      dispatchEvent: () => false,
    }),
  });
  return { fireChange: () => listeners.forEach((l) => l()) };
}

afterEach(() => {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: originalMatchMedia,
  });
  setWidth(originalInnerWidth);
});

describe("useHasDesktopAside", () => {
  it("is true when the viewport is above the desktop breakpoint", () => {
    setWidth(1280);
    const { result } = renderHook(() => useHasDesktopAside());
    expect(result.current).toBe(true);
  });

  it("is false below the desktop breakpoint", () => {
    setWidth(800);
    const { result } = renderHook(() => useHasDesktopAside());
    expect(result.current).toBe(false);
  });

  it("is inclusive at exactly the breakpoint (>= 1024)", () => {
    setWidth(BREAKPOINT);
    const { result } = renderHook(() => useHasDesktopAside());
    expect(result.current).toBe(true);
  });

  it("is false one pixel below the breakpoint (no dead zone)", () => {
    setWidth(BREAKPOINT - 1);
    const { result } = renderHook(() => useHasDesktopAside());
    expect(result.current).toBe(false);
  });

  it("updates when the media query fires a change (viewport crosses the breakpoint)", () => {
    setWidth(1280);
    const mm = captureMatchMedia();
    const { result } = renderHook(() => useHasDesktopAside());
    expect(result.current).toBe(true);

    act(() => {
      setWidth(600);
      mm.fireChange();
    });
    expect(result.current).toBe(false);
  });
});
