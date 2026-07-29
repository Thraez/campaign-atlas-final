// First page-level smoke test for AtlasViewer.
//
// Renders the REAL page component against a fixture atlas and asserts it mounts
// and surfaces known content — black-box, resilient to Leaflet internals.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Hoisted above the page import by vitest so react-leaflet resolves to the mock.
vi.mock("react-leaflet", async () => {
  const { makeReactLeafletModule } = await import("../helpers/reactLeafletMock");
  return makeReactLeafletModule();
});

import { render, waitFor, cleanup, fireEvent, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import AtlasViewer from "@/pages/AtlasViewer";
import { makeProject, makeMap, makeWorld, makeEntity, makePlacement, makeSearchIndex } from "../helpers/makeProject";
import { stableMap } from "../helpers/reactLeafletMock";
import { logger } from "@/lib/logger";

function stubFetch(project = makeProject()) {
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) => {
      const body = String(url).includes("search-index") ? makeSearchIndex() : project;
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(body),
      } as unknown as Response);
    }),
  );
}

function stubFetchSearchIndexFails(project = makeProject()) {
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) => {
      if (String(url).includes("search-index")) {
        return Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve(null) } as unknown as Response);
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve(project) } as unknown as Response);
    }),
  );
}

beforeEach(() => {
  stubFetch();
  vi.mocked(stableMap.fitBounds).mockClear();
  vi.mocked(stableMap.flyTo).mockClear();
  vi.mocked(stableMap.setMaxBounds).mockClear();
  // Reset location to no query params
  window.history.pushState({}, "", "/");
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("AtlasViewer smoke", () => {
  it("mounts, loads the atlas, and surfaces the active map name", async () => {
    render(
      <MemoryRouter>
        <AtlasViewer />
      </MemoryRouter>,
    );
    await waitFor(() => expect(document.querySelector("main#atlas-main")).toBeInTheDocument());
    expect(document.querySelector("main#atlas-main")).toHaveAttribute(
      "aria-label",
      expect.stringContaining("Overview"),
    );
  });
});

describe("Load-error Try again retry (Q94)", () => {
  it("shows a Try again button on a failed load, and reaches the map after a successful retry", async () => {
    let atlasCalls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        if (String(url).includes("search-index")) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(makeSearchIndex()),
          } as unknown as Response);
        }
        atlasCalls++;
        if (atlasCalls === 1) {
          return Promise.resolve({
            ok: false,
            status: 500,
            json: () => Promise.resolve(null),
          } as unknown as Response);
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve(makeProject()) } as unknown as Response);
      }),
    );
    render(
      <MemoryRouter>
        <AtlasViewer />
      </MemoryRouter>,
    );
    const retryBtn = await screen.findByRole("button", { name: /try again/i });
    expect(screen.getByText(/failed to load atlas\.json/i)).toBeInTheDocument();

    fireEvent.click(retryBtn);

    await waitFor(() => expect(document.querySelector("main#atlas-main")).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: /try again/i })).not.toBeInTheDocument();
    expect(atlasCalls).toBe(2);
  });

  it("clears the error and re-fetches once the browser comes back online", async () => {
    let atlasCalls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        if (String(url).includes("search-index")) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(makeSearchIndex()),
          } as unknown as Response);
        }
        atlasCalls++;
        if (atlasCalls === 1) {
          return Promise.resolve({
            ok: false,
            status: 500,
            json: () => Promise.resolve(null),
          } as unknown as Response);
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve(makeProject()) } as unknown as Response);
      }),
    );
    render(
      <MemoryRouter>
        <AtlasViewer />
      </MemoryRouter>,
    );
    await screen.findByRole("button", { name: /try again/i });

    fireEvent(window, new Event("online"));

    await waitFor(() => expect(document.querySelector("main#atlas-main")).toBeInTheDocument());
    expect(atlasCalls).toBe(2);
  });
});

describe("FitBoundsController (Q2)", () => {
  it("calls fitBounds on initial load with no deep link", async () => {
    render(
      <MemoryRouter>
        <AtlasViewer />
      </MemoryRouter>,
    );
    await waitFor(() => expect(stableMap.fitBounds).toHaveBeenCalled());
    expect(stableMap.fitBounds).toHaveBeenCalledWith([[0, 0], [1000, 1000]], expect.anything());
  });

  it("skips fitBounds on initial load when a deep-link center is present", async () => {
    window.history.pushState({}, "", "/?map=overview&cx=300&cy=400&cz=1");
    render(
      <MemoryRouter>
        <AtlasViewer />
      </MemoryRouter>,
    );
    await waitFor(() => expect(document.querySelector("main#atlas-main")).toBeInTheDocument());
    // flyTo is called for the deep-link viewport; fitBounds must not be called
    await waitFor(() => expect(stableMap.flyTo).toHaveBeenCalled());
    expect(stableMap.fitBounds).not.toHaveBeenCalled();
  });

  it("renders a Reset map view button", async () => {
    render(
      <MemoryRouter>
        <AtlasViewer />
      </MemoryRouter>,
    );
    await waitFor(() => expect(document.querySelector('[aria-label="Reset map view"]')).toBeInTheDocument());
  });

  it("clicking Reset map view calls fitBounds", async () => {
    render(
      <MemoryRouter>
        <AtlasViewer />
      </MemoryRouter>,
    );
    await waitFor(() => expect(document.querySelector("main#atlas-main")).toBeInTheDocument());
    vi.mocked(stableMap.fitBounds).mockClear(); // ignore the initial-load fit
    const resetBtn = document.querySelector<HTMLButtonElement>('[aria-label="Reset map view"]')!;
    fireEvent.click(resetBtn);
    expect(stableMap.fitBounds).toHaveBeenCalledWith([[0, 0], [1000, 1000]], expect.anything());
  });

  it("shows the map Select when the atlas has multiple maps", async () => {
    const twoMapProject = makeProject({
      worlds: [makeWorld({ defaultMapId: "map-a" })],
      maps: [
        makeMap({ id: "map-a", name: "Map A", width: 800, height: 600 }),
        makeMap({ id: "map-b", name: "Map B", width: 1200, height: 900 }),
      ],
    });
    stubFetch(twoMapProject);
    render(
      <MemoryRouter>
        <AtlasViewer />
      </MemoryRouter>,
    );
    await waitFor(() => expect(document.querySelector("main#atlas-main")).toBeInTheDocument());
    expect(document.querySelector('[aria-label="Choose map"]')).toBeInTheDocument();
    // fitBounds fires for the initial map load (map-a: 600×800)
    expect(stableMap.fitBounds).toHaveBeenCalledWith([[0, 0], [600, 800]], expect.anything());
  });
});

describe("MapController reduced-motion (Q28)", () => {
  const originalMatchMedia = window.matchMedia;

  function stubMatchMedia(reduceMotion: boolean) {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      writable: true,
      value: (query: string) => ({
        matches: query.includes("prefers-reduced-motion") ? reduceMotion : false,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }),
    });
  }

  afterEach(() => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      writable: true,
      value: originalMatchMedia,
    });
    vi.mocked(stableMap.setView).mockClear();
  });

  it("uses setView (no animation) when prefers-reduced-motion is active", async () => {
    stubMatchMedia(true);
    window.history.pushState({}, "", "/?map=overview&cx=300&cy=400&cz=1");
    render(
      <MemoryRouter>
        <AtlasViewer />
      </MemoryRouter>,
    );
    await waitFor(() => expect(stableMap.setView).toHaveBeenCalled());
    expect(stableMap.setView).toHaveBeenCalledWith([600, 300], expect.any(Number), { animate: false });
    expect(stableMap.flyTo).not.toHaveBeenCalled();
  });

  it("uses flyTo (animated) when prefers-reduced-motion is not set", async () => {
    stubMatchMedia(false);
    window.history.pushState({}, "", "/?map=overview&cx=300&cy=400&cz=1");
    render(
      <MemoryRouter>
        <AtlasViewer />
      </MemoryRouter>,
    );
    await waitFor(() => expect(stableMap.flyTo).toHaveBeenCalled());
    expect(stableMap.flyTo).toHaveBeenCalledWith([600, 300], expect.any(Number), { duration: 0.6 });
    expect(stableMap.setView).not.toHaveBeenCalled();
  });
});

describe("Lazy search-index loading (Q66)", () => {
  it("does not fetch search-index.json on initial load", async () => {
    render(
      <MemoryRouter>
        <AtlasViewer />
      </MemoryRouter>,
    );
    await waitFor(() => expect(document.querySelector("main#atlas-main")).toBeInTheDocument());
    const fetchMock = vi.mocked(fetch);
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("search-index"))).toBe(false);
  });

  it("fetches search-index.json once on first search-open, showing a loading state first", async () => {
    render(
      <MemoryRouter>
        <AtlasViewer />
      </MemoryRouter>,
    );
    await waitFor(() => expect(document.querySelector("main#atlas-main")).toBeInTheDocument());
    const fetchMock = vi.mocked(fetch);
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("search-index"))).toBe(false);

    fireEvent.click(document.querySelector('[aria-label="Search atlas (Ctrl+K)"]')!);
    expect(
      Array.from(document.querySelectorAll('[role="status"]')).some((el) =>
        el.textContent?.includes("Loading search"),
      ),
    ).toBe(true);

    await waitFor(() => expect(document.querySelector('[role="dialog"]')).toBeInTheDocument());
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes("search-index")).length).toBe(1);
  });

  it("does not re-fetch search-index.json when search is closed and reopened", async () => {
    render(
      <MemoryRouter>
        <AtlasViewer />
      </MemoryRouter>,
    );
    await waitFor(() => expect(document.querySelector("main#atlas-main")).toBeInTheDocument());

    fireEvent.click(document.querySelector('[aria-label="Search atlas (Ctrl+K)"]')!);
    await waitFor(() => expect(document.querySelector('[role="dialog"]')).toBeInTheDocument());

    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(document.querySelector('[role="dialog"]')).not.toBeInTheDocument());

    fireEvent.click(document.querySelector('[aria-label="Search atlas (Ctrl+K)"]')!);
    await waitFor(() => expect(document.querySelector('[role="dialog"]')).toBeInTheDocument());

    const fetchMock = vi.mocked(fetch);
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes("search-index")).length).toBe(1);
  });

  it("keeps the map rendered and logs via the logger seam when the search index fails to load (Q89)", async () => {
    stubFetchSearchIndexFails();
    const errorSpy = vi.spyOn(logger, "error").mockImplementation(() => {});
    render(
      <MemoryRouter>
        <AtlasViewer />
      </MemoryRouter>,
    );
    await waitFor(() => expect(document.querySelector("main#atlas-main")).toBeInTheDocument());

    fireEvent.click(document.querySelector('[aria-label="Search atlas (Ctrl+K)"]')!);

    await waitFor(() => expect(errorSpy).toHaveBeenCalled());
    // The failure must not blank the page — the map stays up, no error screen.
    expect(document.querySelector("main#atlas-main")).toBeInTheDocument();
    expect(screen.queryByText(/atlas not built yet/i)).not.toBeInTheDocument();
    // Search degrades to a usable-but-empty palette instead of hanging on "Loading search…".
    await waitFor(() => expect(document.querySelector('[role="dialog"]')).toBeInTheDocument());

    errorSpy.mockRestore();
  });
});

describe("Escape closes the desktop entity reading panel (N129)", () => {
  it("closes the open entity panel on Escape when nothing else is open", async () => {
    window.history.pushState({}, "", "/?entity=iron-tower");
    render(
      <MemoryRouter>
        <AtlasViewer />
      </MemoryRouter>,
    );
    await waitFor(() =>
      expect(Array.from(document.querySelectorAll("h2")).some((h) => h.textContent === "Iron Tower")).toBe(
        true,
      ),
    );

    fireEvent.keyDown(window, { key: "Escape" });

    await waitFor(() =>
      expect(Array.from(document.querySelectorAll("h2")).some((h) => h.textContent === "Iron Tower")).toBe(
        false,
      ),
    );
    expect(document.querySelector('[aria-label="Close panel"]')).not.toBeInTheDocument();
  });

  it("closes search before the entity panel — Escape handles them in order, one per press", async () => {
    window.history.pushState({}, "", "/?entity=iron-tower");
    render(
      <MemoryRouter>
        <AtlasViewer />
      </MemoryRouter>,
    );
    await waitFor(() =>
      expect(Array.from(document.querySelectorAll("h2")).some((h) => h.textContent === "Iron Tower")).toBe(
        true,
      ),
    );

    fireEvent.click(document.querySelector('[aria-label="Search atlas (Ctrl+K)"]')!);
    await waitFor(() => expect(document.querySelector('[role="dialog"]')).toBeInTheDocument());

    // First Escape closes search only — the entity panel stays open.
    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(document.querySelector('[role="dialog"]')).not.toBeInTheDocument());
    expect(
      Array.from(document.querySelectorAll("h2")).some((h) => h.textContent === "Iron Tower"),
    ).toBe(true);

    // Second Escape now closes the entity panel.
    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() =>
      expect(Array.from(document.querySelectorAll("h2")).some((h) => h.textContent === "Iron Tower")).toBe(
        false,
      ),
    );
  });
});

describe("MaxBoundsController (Q6)", () => {
  it("calls setMaxBounds on initial load with map extent plus 10% padding", async () => {
    // Default map: 1000×1000; pad = 100
    render(
      <MemoryRouter>
        <AtlasViewer />
      </MemoryRouter>,
    );
    await waitFor(() => expect(stableMap.setMaxBounds).toHaveBeenCalled());
    expect(stableMap.setMaxBounds).toHaveBeenCalledWith([
      [-100, -100],
      [1100, 1100],
    ]);
  });

  it("calls setMaxBounds with correct padding for a non-square map", async () => {
    // 800×600 map; pad = max(800,600)*0.1 = 80
    const project = makeProject({
      maps: [makeMap({ id: "overview", width: 800, height: 600 })],
    });
    stubFetch(project);
    render(
      <MemoryRouter>
        <AtlasViewer />
      </MemoryRouter>,
    );
    await waitFor(() => expect(stableMap.setMaxBounds).toHaveBeenCalled());
    expect(stableMap.setMaxBounds).toHaveBeenCalledWith([
      [-80, -80],
      [680, 880],
    ]);
  });

  it("calls setMaxBounds(null) when wrapX is true", async () => {
    const project = makeProject({
      maps: [makeMap({ id: "overview", width: 1000, height: 1000, wrapX: true })],
    });
    stubFetch(project);
    render(
      <MemoryRouter>
        <AtlasViewer />
      </MemoryRouter>,
    );
    await waitFor(() => expect(document.querySelector("main#atlas-main")).toBeInTheDocument());
    await waitFor(() => expect(stableMap.setMaxBounds).toHaveBeenCalled());
    expect(stableMap.setMaxBounds).toHaveBeenCalledWith(undefined);
  });
});

describe("Search 'this map only' filter is scoped to the active map (N115)", () => {
  it("excludes an entity placed only on a different map", async () => {
    const project = makeProject({
      worlds: [makeWorld({ defaultMapId: "map-a" })],
      maps: [
        makeMap({ id: "map-a", name: "Map A" }),
        makeMap({ id: "map-b", name: "Map B" }),
      ],
      entities: [
        makeEntity({ id: "iron-tower", title: "Iron Tower" }),
        makeEntity({ id: "silver-lake", title: "Silver Lake" }),
      ],
      placements: [
        makePlacement({ id: "iron-tower@map-a", entityId: "iron-tower", mapId: "map-a" }),
        makePlacement({ id: "silver-lake@map-b", entityId: "silver-lake", mapId: "map-b" }),
      ],
    });
    const searchIndex = [
      {
        id: "iron-tower",
        title: "Iron Tower",
        type: "settlement",
        aliases: [],
        tags: [],
        summary: "A tower of black iron.",
        body: "a tower of black iron.",
      },
      {
        id: "silver-lake",
        title: "Silver Lake",
        type: "settlement",
        aliases: [],
        tags: [],
        summary: "A still silver lake.",
        body: "a still silver lake.",
      },
    ];
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        const body = String(url).includes("search-index") ? searchIndex : project;
        return Promise.resolve({ ok: true, json: () => Promise.resolve(body) } as unknown as Response);
      }),
    );

    render(
      <MemoryRouter>
        <AtlasViewer />
      </MemoryRouter>,
    );
    await waitFor(() => expect(document.querySelector("main#atlas-main")).toBeInTheDocument());

    fireEvent.click(document.querySelector('[aria-label="Search atlas (Ctrl+K)"]')!);
    await waitFor(() => expect(document.querySelector('[role="dialog"]')).toBeInTheDocument());

    const dialog = document.querySelector('[role="dialog"]') as HTMLElement;
    fireEvent.click(within(dialog).getByRole("button", { name: /all maps/i }));

    await waitFor(() => expect(within(dialog).getByText("Iron Tower")).toBeInTheDocument());
    expect(within(dialog).queryByText("Silver Lake")).not.toBeInTheDocument();
  });
});
