/**
 * Tests for src/atlas/routes/RouteLayer.tsx — N134
 *
 * Covers the new midpoint markers: one rendered per segment of the selected
 * route, clicking one calls insertWaypointAfter with the segment's midpoint.
 */
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import React from "react";
import type { MapDocument, Point, Route } from "@/atlas/content/schema";
import type { RouteDraft, RouteDraftAPI, Waypoint } from "@/atlas/routes/useRouteDraft";

// Custom Marker mock that exposes the icon's className (to tell handle markers
// apart from midpoint markers) and wires eventHandlers.click to a real DOM click.
vi.mock("react-leaflet", async () => {
  const { makeReactLeafletModule } = await import("../helpers/reactLeafletMock");
  const base = makeReactLeafletModule();
  return {
    ...base,
    Marker: React.forwardRef<
      HTMLDivElement,
      {
        position?: [number, number];
        icon?: { options?: { className?: string } };
        eventHandlers?: { click?: (e: unknown) => void };
      }
    >(function MarkerMock({ position, icon, eventHandlers }, ref) {
      return (
        <div
          data-leaflet="Marker"
          data-class={icon?.options?.className}
          data-position={JSON.stringify(position)}
          onClick={() => eventHandlers?.click?.({ originalEvent: {} })}
          ref={ref}
        />
      );
    }),
  };
});

const { RouteLayer } = await import("@/atlas/routes/RouteLayer");

const EMPTY_DRAFT: RouteDraft = { edits: {}, added: [], deleted: [] };

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

function makeRoute(overrides: Partial<Route> = {}): Route {
  return {
    id: "route-1",
    mapId: "map-1",
    name: "King's Road",
    visibility: "player",
    waypoints: [
      [0, 0],
      [100, 0],
      [100, 100],
    ],
    ...overrides,
  } as Route;
}

function makeApi(overrides: Partial<RouteDraftAPI> = {}): RouteDraftAPI {
  const route = makeRoute();
  return {
    draft: EMPTY_DRAFT,
    effective: [route],
    dirty: false,
    dirtyCount: 0,
    selectedId: route.id,
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
    resolveWaypoint: vi.fn((w: Waypoint): Point | null => (Array.isArray(w) ? w : null)),
    resolveRoute: vi.fn((r: Route): Point[] =>
      r.waypoints.filter((w): w is Point => Array.isArray(w)),
    ),
    ...overrides,
  } as RouteDraftAPI;
}

function renderLayer(api: RouteDraftAPI, map: MapDocument = makeMap()) {
  return render(<RouteLayer map={map} api={api} />);
}

describe("N134 — RouteLayer: midpoint markers", () => {
  it("renders one midpoint marker per segment of the selected route", () => {
    const api = makeApi();
    const { container } = renderLayer(api);
    const midpoints = container.querySelectorAll('[data-class="atlas-route-midpoint-handle"]');
    // 3 waypoints → 2 segments → 2 midpoints
    expect(midpoints).toHaveLength(2);
  });

  it("positions a midpoint marker at the segment's geometric midpoint", () => {
    const api = makeApi();
    const { container } = renderLayer(api);
    const midpoints = container.querySelectorAll('[data-class="atlas-route-midpoint-handle"]');
    // Segment 0: (0,0) -> (100,0), midpoint (50,0). xy2ll(x,y) = [H - y, x] = [2000, 50].
    const first = JSON.parse(midpoints[0].getAttribute("data-position") ?? "null");
    expect(first).toEqual([2000, 50]);
  });

  it("clicking a midpoint marker inserts a waypoint there via insertWaypointAfter", () => {
    const api = makeApi();
    const { container } = renderLayer(api);
    const midpoints = container.querySelectorAll('[data-class="atlas-route-midpoint-handle"]');
    (midpoints[0] as HTMLElement).click();
    expect(api.insertWaypointAfter).toHaveBeenCalledWith("route-1", 0, [50, 0]);
  });

  it("clicking the second midpoint marker inserts after the second waypoint", () => {
    const api = makeApi();
    const { container } = renderLayer(api);
    const midpoints = container.querySelectorAll('[data-class="atlas-route-midpoint-handle"]');
    (midpoints[1] as HTMLElement).click();
    // Segment 1: (100,0) -> (100,100), midpoint (100,50).
    expect(api.insertWaypointAfter).toHaveBeenCalledWith("route-1", 1, [100, 50]);
  });

  it("renders no midpoint markers when no route is selected", () => {
    const api = makeApi({ selectedId: null });
    const { container } = renderLayer(api);
    expect(container.querySelectorAll('[data-class="atlas-route-midpoint-handle"]')).toHaveLength(
      0,
    );
  });

  it("renders no midpoint markers while drawing a new route", () => {
    const api = makeApi({ drawing: true });
    const { container } = renderLayer(api);
    expect(container.querySelectorAll('[data-class="atlas-route-midpoint-handle"]')).toHaveLength(
      0,
    );
  });

  it("skips a segment whose waypoint is an unresolved entity ref", () => {
    const route = makeRoute({
      waypoints: [[0, 0], { entityId: "unplaced-npc" }, [100, 100]],
    });
    const api = makeApi({
      effective: [route],
      resolveWaypoint: vi.fn((w: Waypoint): Point | null => (Array.isArray(w) ? w : null)),
    });
    const { container } = renderLayer(api);
    // Both segments touch the unresolved entity waypoint, so neither midpoint renders.
    expect(container.querySelectorAll('[data-class="atlas-route-midpoint-handle"]')).toHaveLength(
      0,
    );
  });
});
