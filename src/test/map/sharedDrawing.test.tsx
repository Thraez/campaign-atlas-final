/**
 * Ticket 15 — the editor draws regions and routes the way players see them.
 *
 * Renders the same region and route through the player viewer (WrappedWorld)
 * and through the editor layers (RegionLayer, RouteLayer) and asserts the
 * Leaflet path options and hover tooltips match.
 */
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import React from "react";
import type { Entity, MapDocument, Point, Region, Route } from "@/atlas/content/schema";
import type { RegionDraftAPI } from "@/atlas/regions/useRegionDraft";
import type { RouteDraftAPI, Waypoint } from "@/atlas/routes/useRouteDraft";

// Path mocks expose their pathOptions as JSON so the two renderings can be compared.
vi.mock("react-leaflet", async () => {
  const { makeReactLeafletModule } = await import("../helpers/reactLeafletMock");
  const base = makeReactLeafletModule();
  const path = (name: string) =>
    React.forwardRef<HTMLDivElement, { children?: React.ReactNode; pathOptions?: unknown }>(
      function PathMock({ children, pathOptions }, ref) {
        return (
          <div data-leaflet={name} data-path={JSON.stringify(pathOptions ?? null)} ref={ref}>
            {children}
          </div>
        );
      },
    );
  return { ...base, Polygon: path("Polygon"), Polyline: path("Polyline") };
});

const { WrappedWorld } = await import("@/pages/AtlasViewer");
const { RegionLayer } = await import("@/atlas/regions/RegionLayer");
const { RouteLayer } = await import("@/atlas/routes/RouteLayer");

const ENTITY: Entity = {
  id: "forest-ent",
  title: "Old Forest",
  type: "location",
  visibility: "player",
  aliases: [],
  tags: [],
  body: "",
  bodyHtml: "",
  frontmatter: {},
  sourcePath: "content/forest-ent.md",
  links: [],
  backlinks: [],
  images: [],
};

const POINTS: Point[] = [
  [0, 0],
  [300, 0],
  [300, 400],
];

const REGION: Region = {
  id: "region-1",
  mapId: "map-1",
  name: "Old Forest",
  entityId: "forest-ent",
  points: [
    [0, 0],
    [100, 0],
    [100, 100],
    [0, 100],
  ],
  visibility: "player",
};

const ROUTE: Route = {
  id: "route-1",
  mapId: "map-1",
  name: "King's Road",
  mode: "foot",
  speed: 3,
  dashed: true,
  visibility: "player",
  waypoints: POINTS,
  resolvedPoints: POINTS,
};

const MAP: MapDocument = {
  id: "map-1",
  worldId: "world-1",
  name: "Test Map",
  width: 1000,
  height: 1000,
  layers: [],
  scale: { unitsPerPixel: 0.1, unitLabel: "mi" },
  regions: [REGION],
  routes: [ROUTE],
} as MapDocument;

const entityById = new Map([[ENTITY.id, ENTITY]]);

function renderViewer() {
  return render(
    <WrappedWorld
      dx={0}
      map={MAP}
      placements={[]}
      entityById={entityById}
      showGrid={false}
      onOpenEntity={vi.fn()}
      visited={new Set()}
      openId={null}
    />,
  );
}

function regionApi(): RegionDraftAPI {
  return {
    effective: [REGION],
    selectedId: null,
    setSelectedId: vi.fn(),
    drawing: false,
    draftPoints: [],
    addDraftPoint: vi.fn(),
  } as unknown as RegionDraftAPI;
}

function routeApi(): RouteDraftAPI {
  return {
    effective: [ROUTE],
    selectedId: null,
    setSelectedId: vi.fn(),
    drawing: false,
    draftWaypoints: [],
    addDraftPoint: vi.fn(),
    resolveWaypoint: (w: Waypoint): Point | null => (Array.isArray(w) ? w : null),
    resolveRoute: (r: Route): Point[] => r.waypoints.filter((w): w is Point => Array.isArray(w)),
  } as unknown as RouteDraftAPI;
}

function shape(container: HTMLElement, kind: "Polygon" | "Polyline") {
  const el = container.querySelector(`[data-leaflet="${kind}"]`) as HTMLElement | null;
  expect(el).not.toBeNull();
  const tooltip = el!.querySelector('[data-leaflet="Tooltip"]');
  return {
    path: JSON.parse(el!.getAttribute("data-path") ?? "null") as Record<string, unknown>,
    tooltip: tooltip?.textContent ?? null,
  };
}

describe("ticket 15 — shared region and route drawing", () => {
  it("a region renders with the same path options and tooltip in the viewer and the editor", () => {
    const viewer = shape(renderViewer().container, "Polygon");
    const editor = shape(
      render(<RegionLayer map={MAP} api={regionApi()} entityById={entityById} />).container,
      "Polygon",
    );
    expect(viewer.path.fillOpacity).toBe(0.18);
    expect(editor.path).toEqual(viewer.path);
    expect(viewer.tooltip).toBe("Old Forest");
    expect(editor.tooltip).toBe(viewer.tooltip);
  });

  it("a route renders with the same path options and tooltip in the viewer and the editor", () => {
    const viewer = shape(renderViewer().container, "Polyline");
    const editor = shape(render(<RouteLayer map={MAP} api={routeApi()} />).container, "Polyline");
    expect(editor.path).toEqual(viewer.path);
    expect(viewer.tooltip).toContain("King's Road");
    expect(viewer.tooltip).toContain("70.0 mi");
    expect(editor.tooltip).toBe(viewer.tooltip);
  });
});
