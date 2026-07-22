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

import { render, waitFor, cleanup, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import AtlasViewer from "@/pages/AtlasViewer";
import { makeProject, makeMap, makeWorld, makeSearchIndex } from "../helpers/makeProject";
import { stableMap } from "../helpers/reactLeafletMock";

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
