/**
 * The offline menu and banner say what is actually stored (eval-2026-10/25).
 * The menu used to say "Available offline" whenever a service worker
 * controlled the page, even right after "Clear offline cache" had emptied
 * every cache.
 *
 * `@/pwa` is replaced by a stand-in for its shared offline store: one
 * coverage value that save and clear change and announce, as the real store
 * does. `src/test/pwa.test.ts` covers reading the caches into that value.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";

type Coverage = "none" | "notes" | "notes-map-online" | "notes-and-map";
const pwa = vi.hoisted(() => {
  const listeners = new Set<() => void>();
  const state = { coverage: null as Coverage | null, updateWaiting: false };
  const set = (c: Coverage) => {
    state.coverage = c;
    listeners.forEach((fn) => fn());
  };
  return {
    state,
    listeners,
    set,
    saveCurrentMapForOffline: vi.fn(
      async (): Promise<{ ok: true } | { ok: false; reason: string }> => {
        set("notes-and-map");
        return { ok: true };
      },
    ),
    clearOfflineCache: vi.fn(async () => set("none")),
    refreshOfflineCoverage: vi.fn(async () => {}),
  };
});

vi.mock("@/pwa", () => ({
  activateUpdate: vi.fn(),
  reloadLatestAtlas: vi.fn(async () => ({ ok: true })),
  onUpdateAvailable: (fn: () => void) => {
    if (pwa.state.updateWaiting) queueMicrotask(fn);
    return () => {};
  },
  shouldEnableServiceWorker: () => true,
  subscribeOfflineCoverage: (fn: () => void) => {
    pwa.listeners.add(fn);
    return () => pwa.listeners.delete(fn);
  },
  getOfflineCoverageSnapshot: () => pwa.state.coverage,
  refreshOfflineCoverage: pwa.refreshOfflineCoverage,
  saveCurrentMapForOffline: pwa.saveCurrentMapForOffline,
  clearOfflineCache: pwa.clearOfflineCache,
}));

import { OfflineMenu, OfflineStatus, UpdateNotice } from "@/atlas/OfflineStatus";

const SAVE = /save this map for offline/i;
const NOTES = "Works offline: the notes; pictures you have opened";
const MAP_AND_NOTES = "Works offline: this map and the notes; pictures you have opened";

function openMenu() {
  fireEvent.keyDown(screen.getByRole("button", { name: /offline/i }), { key: "Enter" });
}

beforeEach(() => {
  pwa.state.coverage = "none";
  pwa.listeners.clear();
  vi.clearAllMocks();
});

describe("OfflineMenu", () => {
  it("before saving, says nothing is saved and offers to save this map", async () => {
    render(<OfflineMenu />);
    openMenu();
    expect(await screen.findByText("Not saved for offline yet")).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: SAVE })).toBeInTheDocument();
    expect(screen.queryByText(/works offline/i)).not.toBeInTheDocument();
  });

  it("re-reads the caches each time it opens", async () => {
    render(<OfflineMenu />);
    openMenu();
    await screen.findByText("Not saved for offline yet");
    expect(pwa.refreshOfflineCoverage).toHaveBeenCalled();
  });

  it("after a visit stored only the notes, says so and still offers the map", async () => {
    pwa.state.coverage = "notes";
    render(<OfflineMenu />);
    openMenu();
    expect(await screen.findByText(NOTES)).toBeInTheDocument();
    expect(screen.getByText("This map is not saved yet")).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: SAVE })).toBeInTheDocument();
  });

  it("for a map whose pictures live on another site, claims only the notes", async () => {
    pwa.state.coverage = "notes-map-online";
    render(<OfflineMenu />);
    openMenu();
    expect(await screen.findByText(NOTES)).toBeInTheDocument();
    expect(
      screen.getByText("This map's pictures come from another site and aren't saved"),
    ).toBeInTheDocument();
    expect(screen.queryByText(MAP_AND_NOTES)).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: SAVE })).not.toBeInTheDocument();
  });

  it("after saving, names this map and the notes, and pictures already opened", async () => {
    render(<OfflineMenu />);
    openMenu();
    fireEvent.click(await screen.findByRole("menuitem", { name: SAVE }));

    await waitFor(() => expect(pwa.saveCurrentMapForOffline).toHaveBeenCalled());
    openMenu();
    expect(await screen.findByText(MAP_AND_NOTES)).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: SAVE })).not.toBeInTheDocument();
  });

  it("after clearing, stops claiming offline until something is saved again", async () => {
    pwa.state.coverage = "notes-and-map";
    render(<OfflineMenu />);
    openMenu();
    await screen.findByText(MAP_AND_NOTES);
    expect(screen.getByText(/the app itself stays/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("menuitem", { name: /clear offline cache/i }));

    await waitFor(() => expect(pwa.clearOfflineCache).toHaveBeenCalled());
    openMenu();
    expect(await screen.findByText("Not saved for offline yet")).toBeInTheDocument();
    expect(screen.queryByText(/works offline/i)).not.toBeInTheDocument();
  });

  it("follows the shared store when the caches change behind its back", async () => {
    render(<OfflineMenu />);
    act(() => pwa.set("notes"));
    openMenu();
    expect(await screen.findByText(NOTES)).toBeInTheDocument();
  });

  it("says so when the browser can't save for offline", async () => {
    pwa.saveCurrentMapForOffline.mockImplementationOnce(async () => ({
      ok: false,
      reason: "unsupported",
    }));
    render(<OfflineMenu />);
    openMenu();
    fireEvent.click(await screen.findByRole("menuitem", { name: SAVE }));
    openMenu();
    expect(
      await screen.findByText("This browser can't save pages for offline use"),
    ).toBeInTheDocument();
  });
});

describe("OfflineStatus banner while offline", () => {
  beforeEach(() => {
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
  });

  afterEach(() => {
    Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
  });

  it.each([
    [null, "Offline — checking what is saved"],
    ["none", "Offline — the atlas isn't saved on this device"],
    ["notes", "Offline — showing the saved notes; this map isn't saved"],
    ["notes-map-online", "Offline — showing the saved notes; this map needs the internet"],
    ["notes-and-map", "Offline — showing the saved map and notes"],
  ] as const)("coverage %s: %s", (coverage, banner) => {
    pwa.state.coverage = coverage;
    render(<OfflineStatus />);
    expect(screen.getByRole("status")).toHaveTextContent(banner);
  });

  it("shows no banner while online", () => {
    Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
    render(<OfflineStatus />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});

describe("UpdateNotice (P-01)", () => {
  afterEach(() => {
    pwa.state.updateWaiting = false;
  });

  it("shows nothing while no update waits", () => {
    render(<UpdateNotice />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("is placed by the map's notice dock, not fixed over the page", async () => {
    pwa.state.updateWaiting = true;
    render(<UpdateNotice />);
    const toast = await screen.findByRole("status");
    expect(toast).toHaveTextContent("Atlas update available");
    expect(toast.className).not.toMatch(/\bfixed\b|z-\[/);
    // Full width on a phone instead of a 100px column of single words.
    expect(toast.className).toMatch(/\bw-full\b/);
  });

  it("Later hides it; Refresh and Later are 40px tap targets", async () => {
    pwa.state.updateWaiting = true;
    render(<UpdateNotice />);
    await screen.findByRole("status");
    expect(screen.getByRole("button", { name: /refresh/i }).className).toMatch(/\bh-10\b/);
    const later = screen.getByRole("button", { name: "Later" });
    expect(later.className).toMatch(/\bh-10\b/);
    fireEvent.click(later);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
