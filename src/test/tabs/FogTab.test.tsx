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
import type { FogDraftAPI, FogIssue } from "@/atlas/fog/useFogDraft";
import type { AtlasProject, FogOverlay, MapDocument } from "@/atlas/content/schema";
import type { RegionDraftAPI } from "@/atlas/regions/useRegionDraft";
import type { RouteDraftAPI } from "@/atlas/routes/useRouteDraft";

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

/** Overrides any top-level FogDraftAPI field (not just fog). */
function makeFullApi(overrides: Partial<FogDraftAPI> = {}): FogDraftAPI {
  return { ...makeMockApi(), ...overrides };
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

describe("FogTab — Reveals section (N62)", () => {
  it("renders 'Fog of war' title", () => {
    render(
      <FogTab
        map={makeMap()}
        project={makeProject()}
        api={makeMockApi()}
        showFogPreview={false}
        setShowFogPreview={vi.fn()}
      />,
    );
    expect(screen.getByText("Fog of war")).toBeTruthy();
  });

  it("shows 'No reveals yet' message when reveals is empty", () => {
    render(
      <FogTab
        map={makeMap()}
        project={makeProject()}
        api={makeMockApi({ reveals: [] })}
        showFogPreview={false}
        setShowFogPreview={vi.fn()}
      />,
    );
    expect(screen.getByText(/No reveals yet/)).toBeTruthy();
  });

  it("shows reveal count when multiple reveals exist", () => {
    const fog: FogOverlay = {
      mapId: "map-1",
      enabled: true,
      reveals: [
        [[0, 0], [100, 0], [100, 100]],
        [[0, 0], [50, 0], [50, 50]],
      ],
    };
    render(
      <FogTab
        map={makeMap()}
        project={makeProject()}
        api={makeFullApi({ fog })}
        showFogPreview={false}
        setShowFogPreview={vi.fn()}
      />,
    );
    expect(screen.getByText(/Reveals \(2\)/)).toBeTruthy();
  });

  it("Clear all button absent when no reveals", () => {
    render(
      <FogTab
        map={makeMap()}
        project={makeProject()}
        api={makeMockApi({ reveals: [], conceals: [] })}
        showFogPreview={false}
        setShowFogPreview={vi.fn()}
      />,
    );
    // Both reveal and conceal Clear-all buttons absent
    expect(screen.queryByText(/^Clear all$/)).toBeNull();
  });

  it("Clear all reveals button present when reveals exist", () => {
    const fog: FogOverlay = {
      mapId: "map-1",
      enabled: true,
      reveals: [[[0, 0], [100, 0], [100, 100]]],
    };
    render(
      <FogTab
        map={makeMap()}
        project={makeProject()}
        api={makeFullApi({ fog })}
        showFogPreview={false}
        setShowFogPreview={vi.fn()}
      />,
    );
    expect(screen.getByText("Clear all")).toBeTruthy();
  });
});

describe("FogTab — Validation issues (N62)", () => {
  it("validation issues absent when issues list is empty", () => {
    render(
      <FogTab
        map={makeMap()}
        project={makeProject()}
        api={makeFullApi({ issues: [] })}
        showFogPreview={false}
        setShowFogPreview={vi.fn()}
      />,
    );
    expect(screen.queryByText(/blocking/i)).toBeNull();
  });

  it("blocking issue message rendered", () => {
    const issues: FogIssue[] = [
      { severity: "blocking", code: "too-few-points", message: "Reveal #1 needs at least 3 points." },
    ];
    render(
      <FogTab
        map={makeMap()}
        project={makeProject()}
        api={makeFullApi({ issues })}
        showFogPreview={false}
        setShowFogPreview={vi.fn()}
      />,
    );
    expect(screen.getByText("Reveal #1 needs at least 3 points.")).toBeTruthy();
  });

  it("warning issue message rendered", () => {
    const issues: FogIssue[] = [
      { severity: "warning", code: "small-area", message: "Reveal #2 covers a very small area." },
    ];
    render(
      <FogTab
        map={makeMap()}
        project={makeProject()}
        api={makeFullApi({ issues })}
        showFogPreview={false}
        setShowFogPreview={vi.fn()}
      />,
    );
    expect(screen.getByText("Reveal #2 covers a very small area.")).toBeTruthy();
  });
});

describe("FogTab — Dirty state (N62)", () => {
  it("Discard button absent when not dirty", () => {
    render(
      <FogTab
        map={makeMap()}
        project={makeProject()}
        api={makeFullApi({ dirty: false })}
        showFogPreview={false}
        setShowFogPreview={vi.fn()}
      />,
    );
    expect(screen.queryByText(/Discard local/)).toBeNull();
  });

  it("Discard button present when dirty; click calls reset", () => {
    const reset = vi.fn();
    render(
      <FogTab
        map={makeMap()}
        project={makeProject()}
        api={makeFullApi({ dirty: true, reset })}
        showFogPreview={false}
        setShowFogPreview={vi.fn()}
      />,
    );
    const btn = screen.getByText(/Discard local/);
    expect(btn).toBeTruthy();
    fireEvent.click(btn);
    expect(reset).toHaveBeenCalledOnce();
  });
});

describe("FogTab — Cross-tab convenience reveals (N62)", () => {
  it("shows 'Select a region' message when regionApi is not provided", () => {
    render(
      <FogTab
        map={makeMap()}
        project={makeProject()}
        api={makeMockApi()}
        showFogPreview={false}
        setShowFogPreview={vi.fn()}
        regionApi={undefined}
      />,
    );
    expect(screen.getByText(/Select a region in the Regions tab/)).toBeTruthy();
  });

  it("shows 'Reveal selected region' button when regionApi.selectedId is set", () => {
    const regionApi = {
      effective: [{ id: "r1", name: "Forest", points: [], visibility: "player" as const }],
      selectedId: "r1",
      setSelectedId: vi.fn(),
      draft: { regions: [] },
      dirty: false,
      dirtyCount: 0,
      drawing: false,
      draftPoints: [],
      startDraw: vi.fn(),
      cancelDraw: vi.fn(),
      addDraftPoint: vi.fn(),
      removeLastDraftPoint: vi.fn(),
      finishDraw: vi.fn(),
      patch: vi.fn(),
      movePoint: vi.fn(),
      insertPointAfter: vi.fn(),
      deletePoint: vi.fn(),
      translate: vi.fn(),
      duplicate: vi.fn(),
      remove: vi.fn(),
      reset: vi.fn(),
      snapshot: vi.fn(),
      applySnapshot: vi.fn(),
      issues: [],
    } as unknown as RegionDraftAPI;
    render(
      <FogTab
        map={makeMap()}
        project={makeProject()}
        api={makeMockApi()}
        showFogPreview={false}
        setShowFogPreview={vi.fn()}
        regionApi={regionApi}
      />,
    );
    expect(screen.getByText(/Reveal selected region/)).toBeTruthy();
  });

  it("shows 'Select a route' message when routeApi is not provided", () => {
    render(
      <FogTab
        map={makeMap()}
        project={makeProject()}
        api={makeMockApi()}
        showFogPreview={false}
        setShowFogPreview={vi.fn()}
        routeApi={undefined}
      />,
    );
    expect(screen.getByText(/Select a route in the Routes tab/)).toBeTruthy();
  });

  it("shows 'Reveal around route' button when routeApi.selectedId is set", () => {
    const routeApi = {
      effective: [{ id: "rt1", name: "Road North", waypoints: [], visibility: "player" as const, mode: "straight" as const }],
      selectedId: "rt1",
      setSelectedId: vi.fn(),
      draft: { routes: [] },
      dirty: false,
      dirtyCount: 0,
      drawing: false,
      draftWaypoints: [],
      startDraw: vi.fn(),
      cancelDraw: vi.fn(),
      addDraftPoint: vi.fn(),
      addDraftEntity: vi.fn(),
      removeLastDraftPoint: vi.fn(),
      finishDraw: vi.fn(),
      patch: vi.fn(),
      moveWaypoint: vi.fn(),
      setWaypointEntity: vi.fn(),
      removeWaypoint: vi.fn(),
      insertWaypointAfter: vi.fn(),
      duplicate: vi.fn(),
      remove: vi.fn(),
      reset: vi.fn(),
      snapshot: vi.fn(),
      applySnapshot: vi.fn(),
      issues: [],
      resolveWaypoint: vi.fn(),
      resolveRoute: vi.fn().mockReturnValue([[100, 100], [200, 200]]),
    } as unknown as RouteDraftAPI;
    render(
      <FogTab
        map={makeMap()}
        project={makeProject()}
        api={makeMockApi()}
        showFogPreview={false}
        setShowFogPreview={vi.fn()}
        routeApi={routeApi}
      />,
    );
    expect(screen.getByText(/Reveal around route/)).toBeTruthy();
  });
});
