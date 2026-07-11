/**
 * Tests for src/atlas/tabs/RoutesTab.tsx — N64 hygiene nibble
 *
 * Covers the key render branches of the Routes authoring panel:
 *   - Empty state message when no routes exist
 *   - Route list items rendered when effective routes are populated
 *   - "new" and "edit" badges for draft-added / draft-edited routes
 *   - Selected route form shown when a route is selected
 *   - Validation chips: absent when issues empty; blocking; warning
 *   - Dirty state: Discard button absent/present + calls reset
 *   - Drawing mode: Draw button shown; drawing indicators shown
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { RoutesTab } from "@/atlas/tabs/RoutesTab";
import type { RouteDraftAPI, RouteDraft, RouteIssue } from "@/atlas/routes/useRouteDraft";
import type { AtlasProject, MapDocument, Route } from "@/atlas/content/schema";

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
    regions: [],
    ...overrides,
  } as MapDocument;
}

function makeProject(overrides: Partial<AtlasProject> = {}): AtlasProject {
  return {
    version: 1,
    publishedAt: null,
    worlds: [],
    maps: [{ id: "map-1", name: "Test Map" } as MapDocument],
    entities: [],
    placements: [],
    assets: [],
    ...overrides,
  } as unknown as AtlasProject;
}

const EMPTY_DRAFT: RouteDraft = { edits: {}, added: [], deleted: [] };

function makeMockApi(overrides: Partial<RouteDraftAPI> = {}): RouteDraftAPI {
  return {
    draft: EMPTY_DRAFT,
    effective: [],
    dirty: false,
    dirtyCount: 0,
    selectedId: null,
    setSelectedId: vi.fn(),
    drawing: false,
    draftWaypoints: [],
    startDraw: vi.fn(),
    cancelDraw: vi.fn(),
    addDraftPoint: vi.fn(),
    addDraftEntity: vi.fn(),
    removeLastDraftPoint: vi.fn(),
    finishDraw: vi.fn(() => null),
    patch: vi.fn(),
    moveWaypoint: vi.fn(),
    setWaypointEntity: vi.fn(),
    removeWaypoint: vi.fn(),
    insertWaypointAfter: vi.fn(),
    duplicate: vi.fn(() => null),
    remove: vi.fn(),
    reset: vi.fn(),
    snapshot: vi.fn(() => EMPTY_DRAFT),
    applySnapshot: vi.fn(),
    issues: [],
    resolveWaypoint: vi.fn(() => null),
    resolveRoute: vi.fn(() => []),
    ...overrides,
  };
}

function makeRoute(overrides: Partial<Route> = {}): Route {
  return {
    id: "route-1",
    mapId: "map-1",
    name: "King's Road",
    visibility: "player",
    waypoints: [[0, 0], [100, 100]],
    mode: "foot",
    color: "#cfd6dc",
    weight: 3,
    dashed: false,
    ...overrides,
  } as Route;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("RoutesTab — Empty state", () => {
  it("shows 'No routes yet' message when effective is empty", () => {
    render(
      <RoutesTab
        project={makeProject()}
        map={makeMap()}
        api={makeMockApi({ effective: [] })}
      />
    );
    expect(screen.getByText(/No routes yet/)).toBeTruthy();
  });
});

describe("RoutesTab — Route list", () => {
  it("renders route name and waypoint count when routes are present", () => {
    const route = makeRoute({ name: "Merchant Path", waypoints: [[0, 0], [50, 50], [100, 100]] });
    render(
      <RoutesTab
        project={makeProject()}
        map={makeMap()}
        api={makeMockApi({ effective: [route] })}
      />
    );
    expect(screen.getByText("Merchant Path")).toBeTruthy();
    expect(screen.getByText("3 wp")).toBeTruthy();
  });

  it("renders 'new' badge for a route in draft.added", () => {
    const route = makeRoute({ id: "r-new", name: "New Path" });
    const draft: RouteDraft = { edits: {}, added: [route], deleted: [] };
    render(
      <RoutesTab
        project={makeProject()}
        map={makeMap()}
        api={makeMockApi({ effective: [route], draft })}
      />
    );
    expect(screen.getByText("new")).toBeTruthy();
  });

  it("renders 'edit' badge for a route with edits (not in draft.added)", () => {
    const route = makeRoute({ id: "r-edit", name: "Edited Road" });
    const draft: RouteDraft = { edits: { "r-edit": { name: "Edited Road" } }, added: [], deleted: [] };
    render(
      <RoutesTab
        project={makeProject()}
        map={makeMap()}
        api={makeMockApi({ effective: [route], draft })}
      />
    );
    expect(screen.getByText("edit")).toBeTruthy();
  });
});

describe("RoutesTab — Selected route form", () => {
  it("shows name input when a route is selected", () => {
    const route = makeRoute({ id: "route-1", name: "Highland Pass" });
    render(
      <RoutesTab
        project={makeProject()}
        map={makeMap()}
        api={makeMockApi({ effective: [route], selectedId: "route-1" })}
      />
    );
    expect(screen.getByDisplayValue("Highland Pass")).toBeTruthy();
  });

  it("does not show name input when no route is selected", () => {
    const route = makeRoute({ id: "route-1", name: "Highland Pass" });
    render(
      <RoutesTab
        project={makeProject()}
        map={makeMap()}
        api={makeMockApi({ effective: [route], selectedId: null })}
      />
    );
    expect(screen.queryByDisplayValue("Highland Pass")).toBeNull();
  });
});

describe("RoutesTab — Validation chips", () => {
  it("validation chips absent when issues list is empty", () => {
    render(
      <RoutesTab
        project={makeProject()}
        map={makeMap()}
        api={makeMockApi({ issues: [] })}
      />
    );
    expect(screen.queryByText(/blocking/i)).toBeNull();
  });

  it("blocking issue message rendered", () => {
    const issues: RouteIssue[] = [
      { severity: "blocking", code: "route-too-few-waypoints", message: "Route needs at least 2 waypoints." },
    ];
    render(
      <RoutesTab
        project={makeProject()}
        map={makeMap()}
        api={makeMockApi({ issues })}
      />
    );
    expect(screen.getByText("Route needs at least 2 waypoints.")).toBeTruthy();
  });

  it("warning issue message rendered", () => {
    const issues: RouteIssue[] = [
      { severity: "warning", code: "route-wrong-map", message: "Route mapId doesn't match active map." },
    ];
    render(
      <RoutesTab
        project={makeProject()}
        map={makeMap()}
        api={makeMockApi({ issues })}
      />
    );
    expect(screen.getByText("Route mapId doesn't match active map.")).toBeTruthy();
  });
});

describe("RoutesTab — Dirty state", () => {
  it("Discard button absent when not dirty", () => {
    render(
      <RoutesTab
        project={makeProject()}
        map={makeMap()}
        api={makeMockApi({ dirty: false })}
      />
    );
    expect(screen.queryByText(/Discard local/)).toBeNull();
  });

  it("Discard button present when dirty; click calls reset", () => {
    const reset = vi.fn();
    render(
      <RoutesTab
        project={makeProject()}
        map={makeMap()}
        api={makeMockApi({ dirty: true, reset })}
      />
    );
    const btn = screen.getByText(/Discard local/);
    expect(btn).toBeTruthy();
    fireEvent.click(btn);
    expect(reset).toHaveBeenCalledOnce();
  });
});

describe("RoutesTab — Drawing mode", () => {
  it("shows 'Draw route' button when not drawing", () => {
    render(
      <RoutesTab
        project={makeProject()}
        map={makeMap()}
        api={makeMockApi({ drawing: false })}
      />
    );
    expect(screen.getByRole("button", { name: /Draw route/ })).toBeTruthy();
  });

  it("shows drawing indicator with waypoint count when drawing is active", () => {
    render(
      <RoutesTab
        project={makeProject()}
        map={makeMap()}
        api={makeMockApi({ drawing: true, draftWaypoints: [[0, 0], [50, 50]] })}
      />
    );
    expect(screen.getByText(/Drawing.*2 wp/)).toBeTruthy();
  });
});
