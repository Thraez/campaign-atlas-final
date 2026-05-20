/**
 * Tests for src/atlas/tabs/FogTab.tsx
 *
 * Covers the new fog-authoring UI:
 *   - "Draw fog" section renders with polygon and circle buttons
 *   - Fog shapes list renders when conceals are present
 *   - Feather input reflects featherPx and calls setFeatherPx on change
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { FogTab } from "@/atlas/tabs/FogTab";
import type { FogDraftAPI } from "@/atlas/fog/useFogDraft";
import type { AtlasProject, MapDocument } from "@/atlas/content/schema";

// ---------------------------------------------------------------------------
// Minimal stubs
// ---------------------------------------------------------------------------

function makeMap(overrides: Partial<MapDocument> = {}): MapDocument {
  return {
    id: "map-1",
    worldId: "world-1",
    name: "Test Map",
    width: 2000,
    height: 2000,
    layers: [],
    routes: [],
    fog: {
      mapId: "map-1",
      enabled: true,
      reveals: [],
      conceals: [],
    },
    ...overrides,
  } as MapDocument;
}

function makeProject(overrides: Partial<AtlasProject> = {}): AtlasProject {
  return {
    version: 1,
    publishedAt: null,
    worlds: [],
    maps: [],
    entities: [],
    placements: [],
    assets: [],
    ...overrides,
  } as unknown as AtlasProject;
}

function makeMockApi(fogOverrides: Partial<FogDraftAPI["fog"]> = {}): FogDraftAPI {
  const fog: FogDraftAPI["fog"] = {
    mapId: "map-1",
    enabled: true,
    reveals: [],
    conceals: [],
    featherPx: undefined,
    ...fogOverrides,
  };

  return {
    fog,
    dirty: false,
    setEnabled: vi.fn(),
    setColor: vi.fn(),
    tool: null,
    setTool: vi.fn(),
    draftPoints: [],
    addDraftPoint: vi.fn(),
    removeLastDraftPoint: vi.fn(),
    cancelDraft: vi.fn(),
    finishDraftPolygon: vi.fn(() => true),
    finishDraftCircle: vi.fn(() => true),
    removeReveal: vi.fn(),
    clearReveals: vi.fn(),
    setFeatherPx: vi.fn(),
    removeConceal: vi.fn(),
    clearConceals: vi.fn(),
    revealRegion: vi.fn(),
    revealAroundRoute: vi.fn(),
    revealAroundPin: vi.fn(),
    reset: vi.fn(),
    snapshot: vi.fn(() => null),
    applySnapshot: vi.fn(),
    issues: [],
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("FogTab — Draw fog section", () => {
  it("renders Draw fog section with polygon and circle buttons", () => {
    const api = makeMockApi();
    render(
      <FogTab
        map={makeMap()}
        project={makeProject()}
        api={api}
        showFogPreview={false}
        setShowFogPreview={vi.fn()}
      />
    );

    expect(screen.getByText(/draw fog/i)).toBeInTheDocument();
    // There are two "Polygon" buttons (reveal + fog) and two "Circle" buttons
    const polygonBtns = screen.getAllByRole("button", { name: /polygon/i });
    expect(polygonBtns.length).toBeGreaterThanOrEqual(2);
    const circleBtns = screen.getAllByRole("button", { name: /circle/i });
    expect(circleBtns.length).toBeGreaterThanOrEqual(2);
  });
});

describe("FogTab — Fog shapes list", () => {
  it("renders Fog shapes list when conceals are present", () => {
    const api = makeMockApi({
      conceals: [[[0, 0], [10, 0], [10, 10]]],
    });
    render(
      <FogTab
        map={makeMap({ fog: { mapId: "map-1", enabled: true, reveals: [], conceals: [[[0, 0], [10, 0], [10, 10]]] } })}
        project={makeProject()}
        api={api}
        showFogPreview={false}
        setShowFogPreview={vi.fn()}
      />
    );

    expect(screen.getByText(/fog shapes/i)).toBeInTheDocument();
    expect(screen.getByText(/Fog #1/)).toBeInTheDocument();
  });

  it("does not render fog shapes list when conceals are empty", () => {
    const api = makeMockApi({ conceals: [] });
    render(
      <FogTab
        map={makeMap()}
        project={makeProject()}
        api={api}
        showFogPreview={false}
        setShowFogPreview={vi.fn()}
      />
    );

    expect(screen.queryByText(/fog shapes/i)).toBeNull();
  });
});

describe("FogTab — Feather control", () => {
  it("feather input reflects featherPx value", () => {
    const api = makeMockApi({ featherPx: 24 });
    render(
      <FogTab
        map={makeMap()}
        project={makeProject()}
        api={api}
        showFogPreview={false}
        setShowFogPreview={vi.fn()}
      />
    );

    const featherInput = screen.getByLabelText(/soft edge/i) as HTMLInputElement;
    expect(featherInput.value).toBe("24");
  });

  it("feather input uses 16 as default when featherPx is undefined", () => {
    const api = makeMockApi({ featherPx: undefined });
    render(
      <FogTab
        map={makeMap()}
        project={makeProject()}
        api={api}
        showFogPreview={false}
        setShowFogPreview={vi.fn()}
      />
    );

    const featherInput = screen.getByLabelText(/soft edge/i) as HTMLInputElement;
    expect(featherInput.value).toBe("16");
  });

  it("calls setFeatherPx when feather input changes", () => {
    const api = makeMockApi({ featherPx: 16 });
    render(
      <FogTab
        map={makeMap()}
        project={makeProject()}
        api={api}
        showFogPreview={false}
        setShowFogPreview={vi.fn()}
      />
    );

    const featherInput = screen.getByLabelText(/soft edge/i);
    fireEvent.change(featherInput, { target: { value: "32" } });
    expect(api.setFeatherPx).toHaveBeenCalledWith(32);
  });
});
