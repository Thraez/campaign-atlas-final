/**
 * The offline menu says what is actually stored (eval-2026-10/25). It used to
 * say "Available offline" whenever a service worker controlled the page, even
 * right after "Clear offline cache" had emptied every cache.
 *
 * `@/pwa` is replaced by a stand-in that keeps the stored state in memory and,
 * like the real module, tells subscribers when a save or clear changes it.
 * `src/test/pwa.test.ts` covers the cache reading itself.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";

type Coverage = "none" | "notes" | "notes-and-map";
const pwa = vi.hoisted(() => {
  const listeners = new Set<() => void>();
  const state = { coverage: "none" as Coverage, savedFor: [] as string[] };
  const notify = () => listeners.forEach((fn) => fn());
  return {
    state,
    listeners,
    notify,
    getOfflineCoverage: vi.fn(async (layers: readonly string[]) => {
      if (state.coverage === "notes-and-map" && layers.some((l) => !state.savedFor.includes(l))) {
        return "notes" as Coverage;
      }
      return state.coverage;
    }),
    saveForOffline: vi.fn(async (layers: readonly string[]) => {
      state.coverage = "notes-and-map";
      state.savedFor = [...layers];
      notify();
      return { ok: true as const };
    }),
    clearOfflineCache: vi.fn(async () => {
      state.coverage = "none";
      state.savedFor = [];
      notify();
    }),
  };
});

vi.mock("@/pwa", () => ({
  activateUpdate: vi.fn(),
  reloadLatestAtlas: vi.fn(async () => ({ ok: true })),
  onUpdateAvailable: () => () => {},
  shouldEnableServiceWorker: () => true,
  onCacheStateChange: (fn: () => void) => {
    pwa.listeners.add(fn);
    return () => pwa.listeners.delete(fn);
  },
  getOfflineCoverage: pwa.getOfflineCoverage,
  saveForOffline: pwa.saveForOffline,
  clearOfflineCache: pwa.clearOfflineCache,
}));

import { OfflineMenu } from "@/atlas/OfflineStatus";

const LAYERS = ["atlas/assets/maps/world-1.webp", "atlas/assets/maps/world-2.webp"];

function openMenu() {
  const trigger = screen.getByRole("button", { name: /offline/i });
  fireEvent.keyDown(trigger, { key: "Enter" });
}

beforeEach(() => {
  pwa.state.coverage = "none";
  pwa.state.savedFor = [];
  pwa.listeners.clear();
  vi.clearAllMocks();
});

describe("OfflineMenu", () => {
  it("before saving, says nothing is saved and offers to save this map", async () => {
    render(<OfflineMenu layerSrcs={LAYERS} />);
    openMenu();
    expect(await screen.findByText("Not saved for offline yet")).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: /save this map for offline/i }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/available offline/i)).not.toBeInTheDocument();
  });

  it("after a visit stored only the notes, says so and still offers the map", async () => {
    pwa.state.coverage = "notes";
    render(<OfflineMenu layerSrcs={LAYERS} />);
    openMenu();
    expect(
      await screen.findByText("Works offline: the notes; pictures you have opened"),
    ).toBeInTheDocument();
    expect(screen.getByText("This map is not saved yet")).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: /save this map for offline/i }),
    ).toBeInTheDocument();
  });

  it("after saving, names this map and the notes, and pictures already opened", async () => {
    render(<OfflineMenu layerSrcs={LAYERS} />);
    openMenu();
    fireEvent.click(await screen.findByRole("menuitem", { name: /save this map for offline/i }));

    expect(pwa.saveForOffline).toHaveBeenCalledWith(LAYERS);
    openMenu();
    expect(
      await screen.findByText("Works offline: this map and the notes; pictures you have opened"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("menuitem", { name: /save this map for offline/i }),
    ).not.toBeInTheDocument();
  });

  it("after clearing, stops claiming offline until something is saved again", async () => {
    pwa.state.coverage = "notes-and-map";
    pwa.state.savedFor = [...LAYERS];
    render(<OfflineMenu layerSrcs={LAYERS} />);
    openMenu();
    await screen.findByText("Works offline: this map and the notes; pictures you have opened");

    fireEvent.click(screen.getByRole("menuitem", { name: /clear offline copy/i }));

    await waitFor(() => expect(pwa.clearOfflineCache).toHaveBeenCalled());
    openMenu();
    expect(await screen.findByText("Not saved for offline yet")).toBeInTheDocument();
    expect(screen.queryByText(/works offline/i)).not.toBeInTheDocument();
  });

  it("switching to a map that isn't saved drops the map claim", async () => {
    pwa.state.coverage = "notes-and-map";
    pwa.state.savedFor = [...LAYERS];
    const { rerender } = render(<OfflineMenu layerSrcs={LAYERS} />);
    await waitFor(() => expect(pwa.getOfflineCoverage).toHaveBeenCalled());

    rerender(<OfflineMenu layerSrcs={["atlas/assets/maps/underdark.webp"]} />);
    openMenu();

    expect(
      await screen.findByText("Works offline: the notes; pictures you have opened"),
    ).toBeInTheDocument();
  });

  it("re-reads the caches when they change behind its back", async () => {
    render(<OfflineMenu layerSrcs={LAYERS} />);
    await waitFor(() => expect(pwa.getOfflineCoverage).toHaveBeenCalled());

    pwa.state.coverage = "notes";
    act(() => pwa.notify());
    openMenu();

    expect(
      await screen.findByText("Works offline: the notes; pictures you have opened"),
    ).toBeInTheDocument();
  });
});
