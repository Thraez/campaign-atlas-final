import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import {
  useReduceMotion,
  getCalmMode,
  setCalmMode,
  syncCalmModeToDocument,
  _resetCalmModeForTests,
} from "@/hooks/use-reduce-motion";

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
      addEventListener: (_type: string, cb: (e: { matches: boolean }) => void) => listeners.add(cb),
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

beforeEach(() => {
  localStorage.clear();
  _resetCalmModeForTests();
  document.documentElement.removeAttribute("data-calm");
});

afterEach(() => {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: originalMatchMedia,
  });
});

describe("useReduceMotion: the OS setting", () => {
  it("is false when neither the OS setting nor calm mode is on", () => {
    installMatchMedia(false);
    const { result } = renderHook(() => useReduceMotion());
    expect(result.current).toBe(false);
  });

  it("is true when the OS reports prefers-reduced-motion: reduce", () => {
    installMatchMedia(true);
    const { result } = renderHook(() => useReduceMotion());
    expect(result.current).toBe(true);
  });

  it("takes effect when the OS setting changes mid-session, both ways", () => {
    const { fireChange } = installMatchMedia(false);
    const { result } = renderHook(() => useReduceMotion());
    act(() => fireChange(true));
    expect(result.current).toBe(true);
    act(() => fireChange(false));
    expect(result.current).toBe(false);
  });
});

describe("useReduceMotion: calm mode", () => {
  it("is true while calm mode is on, even with the OS setting off, and updates live", () => {
    installMatchMedia(false);
    const { result } = renderHook(() => useReduceMotion());
    act(() => setCalmMode(true));
    expect(result.current).toBe(true);
    act(() => setCalmMode(false));
    expect(result.current).toBe(false);
  });

  it("stays true when calm mode is turned off while the OS setting is on", () => {
    installMatchMedia(true);
    const { result } = renderHook(() => useReduceMotion());
    act(() => setCalmMode(true));
    act(() => setCalmMode(false));
    expect(result.current).toBe(true);
  });

  it("mirrors calm mode onto <html data-calm> for the CSS (ocean, transitions)", () => {
    setCalmMode(true);
    expect(document.documentElement.getAttribute("data-calm")).toBe("true");
    setCalmMode(false);
    expect(document.documentElement.hasAttribute("data-calm")).toBe(false);
  });

  it("persists across a reload", () => {
    setCalmMode(true);
    _resetCalmModeForTests({ keepStorage: true });
    expect(getCalmMode()).toBe(true);
  });

  it("keeps the value saved by the old sound-settings switch, and copies it to its own key", () => {
    localStorage.setItem(
      "atlas-player-sound-v1",
      JSON.stringify({ soundEnabled: true, muted: false, calmMode: true, volume: 0.5 }),
    );
    expect(getCalmMode()).toBe(true);
    // The sound settings rewrite their blob without calmMode from now on; the
    // migrated value must not depend on it.
    localStorage.setItem("atlas-player-sound-v1", JSON.stringify({ soundEnabled: true }));
    _resetCalmModeForTests({ keepStorage: true });
    expect(getCalmMode()).toBe(true);
  });

  it("ignores a corrupt old sound blob", () => {
    localStorage.setItem("atlas-player-sound-v1", "{not json");
    expect(getCalmMode()).toBe(false);
  });

  it("syncCalmModeToDocument applies the saved value at boot", () => {
    localStorage.setItem("atlas-calm-mode-v1", "true");
    syncCalmModeToDocument();
    expect(document.documentElement.getAttribute("data-calm")).toBe("true");
  });
});
