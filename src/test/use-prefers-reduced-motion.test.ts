import { describe, it, expect, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";

const originalMatchMedia = window.matchMedia;

function installMatchMedia(matches: boolean): { fireChange: (newMatches: boolean) => void } {
  const listeners = new Set<(e: { matches: boolean }) => void>();
  let current = matches;
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: (_query: string) => ({
      get matches() {
        return current;
      },
      media: _query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: (_type: string, cb: (e: { matches: boolean }) => void) =>
        listeners.add(cb),
      removeEventListener: (_type: string, cb: (e: { matches: boolean }) => void) =>
        listeners.delete(cb),
      dispatchEvent: () => false,
    }),
  });
  return {
    fireChange: (newMatches: boolean) => {
      current = newMatches;
      listeners.forEach((l) => l({ matches: newMatches }));
    },
  };
}

afterEach(() => {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: originalMatchMedia,
  });
});

describe("usePrefersReducedMotion", () => {
  it("returns false when prefers-reduced-motion is not set", () => {
    installMatchMedia(false);
    const { result } = renderHook(() => usePrefersReducedMotion());
    expect(result.current).toBe(false);
  });

  it("returns true when prefers-reduced-motion: reduce is active", () => {
    installMatchMedia(true);
    const { result } = renderHook(() => usePrefersReducedMotion());
    expect(result.current).toBe(true);
  });

  it("updates reactively when the preference changes to reduced", () => {
    const { fireChange } = installMatchMedia(false);
    const { result } = renderHook(() => usePrefersReducedMotion());
    expect(result.current).toBe(false);

    act(() => {
      fireChange(true);
    });
    expect(result.current).toBe(true);
  });

  it("updates reactively when the preference changes back to no-preference", () => {
    const { fireChange } = installMatchMedia(true);
    const { result } = renderHook(() => usePrefersReducedMotion());
    expect(result.current).toBe(true);

    act(() => {
      fireChange(false);
    });
    expect(result.current).toBe(false);
  });
});
