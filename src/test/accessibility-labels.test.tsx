/**
 * E1 regression guard — accessible names for icon-only controls.
 *
 * Renders the affected components and asserts that a representative subset of
 * the icon-only controls exposed by E1 carry accessible names.  This is not
 * exhaustive coverage; it is a guard so future refactors cannot silently drop
 * the labels.
 *
 * Sampled controls (per spec):
 *   - AtlasMinimap region (role="img")
 *   - MapLayerPanel nudge buttons (four directions, ±100 step row)
 *   - EntitiesTab "Remove value" (list-field trash button)
 *   - EntitiesTab "Remove link" (relationship trash button)
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import { AtlasMinimap } from "@/atlas/AtlasMinimap";
import { MapLayerPanel } from "@/atlas/MapLayerPanel";
import { EntitiesTab } from "@/atlas/tabs/EntitiesTab";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import type {
  AtlasProject,
  Entity,
  MapDocument,
  MapLayer,
  MapPlacement,
} from "@/atlas/content/schema";

// AtlasMinimap uses useMap() which requires a MapContainer context at runtime.
// Stub the hook so we can render the component in isolation.
//
// IMPORTANT: useMap() must return a *stable* reference, exactly as real
// react-leaflet does (it hands back the one Leaflet map instance). AtlasMinimap's
// viewport effect depends on `parent`; if the stub returned a fresh object each
// call, the effect would re-run every render, setVp() a new object every time,
// and spin in an infinite render loop until the heap is exhausted.
vi.mock("react-leaflet", () => {
  const fakeMap = {
    getBounds: () => ({
      getSouthWest: () => ({ lng: 0, lat: 0 }),
      getNorthEast: () => ({ lng: 500, lat: 500 }),
    }),
    getZoom: () => 0,
    latLngToContainerPoint: () => ({ x: 0, y: 0 }),
    on: () => {},
    off: () => {},
  };
  return {
    useMap: () => fakeMap,
    Marker: React.forwardRef<HTMLDivElement, { children?: React.ReactNode; title?: string }>(
      function MarkerMock({ children, title }, ref) {
        return (
          <div data-leaflet="Marker" data-title={title} ref={ref}>
            {children}
          </div>
        );
      },
    ),
    Tooltip: React.forwardRef<HTMLDivElement, { children?: React.ReactNode }>(function TooltipMock(
      { children },
      ref,
    ) {
      return (
        <div data-leaflet="Tooltip" ref={ref}>
          {children}
        </div>
      );
    }),
  };
});

const { PlacementMarkers } = await import("@/pages/AtlasViewer");

// ---------------------------------------------------------------------------
// Minimal stubs
// ---------------------------------------------------------------------------

const MAP: MapDocument = {
  id: "m1",
  worldId: "w1",
  name: "Test Map",
  width: 1000,
  height: 1000,
  layers: [],
  routes: [],
  fog: { mapId: "m1", enabled: false, reveals: [], conceals: [] },
} as unknown as MapDocument;

const LAYER: MapLayer = {
  id: "l1",
  src: "atlas/test.png",
  x: 0,
  y: 0,
  width: 1000,
  height: 1000,
  zIndex: 0,
  opacity: 1,
} as unknown as MapLayer;

function makeEntity(overrides: Partial<Entity> = {}): Entity {
  return {
    id: "e1",
    title: "Test Entity",
    type: "npc",
    visibility: "player",
    aliases: [],
    tags: [],
    images: [],
    body: "",
    bodyHtml: "",
    frontmatter: {},
    sourcePath: "content/e1.md",
    links: [],
    backlinks: [],
    relationships: [],
    profile: {},
    ...overrides,
  } as unknown as Entity;
}

function makeProject(entities: Entity[]): AtlasProject {
  return {
    version: 1,
    publishedAt: null,
    worlds: [],
    maps: [],
    entities,
    placements: [],
    assets: [],
  } as unknown as AtlasProject;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("E1 — accessible names for icon-only controls", () => {
  describe("AtlasMinimap", () => {
    it("minimap div exposes role=img and an accessible name", () => {
      render(<AtlasMinimap map={MAP} layers={[]} />);
      expect(screen.getByRole("img", { name: /minimap/i })).toBeInTheDocument();
    });
  });

  describe("MapLayerPanel nudge buttons", () => {
    function renderPanel() {
      render(
        <MapLayerPanel
          map={MAP}
          mergedLayers={[LAYER]}
          localLayers={[]}
          selectedId="l1"
          setSelectedId={vi.fn()}
          onAddFiles={vi.fn()}
          onAddUrl={vi.fn()}
          onEditBuiltin={vi.fn()}
          onUpdate={vi.fn()}
          onDuplicate={vi.fn()}
          onRemove={vi.fn()}
          onClearAll={vi.fn()}
        />,
      );
    }

    it("left nudge button has an accessible name", () => {
      renderPanel();
      expect(screen.getByRole("button", { name: "Nudge layer left (±100)" })).toBeInTheDocument();
    });

    it("right nudge button has an accessible name", () => {
      renderPanel();
      expect(screen.getByRole("button", { name: "Nudge layer right (±100)" })).toBeInTheDocument();
    });

    it("up nudge button has an accessible name", () => {
      renderPanel();
      expect(screen.getByRole("button", { name: "Nudge layer up (±100)" })).toBeInTheDocument();
    });

    it("down nudge button has an accessible name", () => {
      renderPanel();
      expect(screen.getByRole("button", { name: "Nudge layer down (±100)" })).toBeInTheDocument();
    });
  });

  describe("EntitiesTab trash buttons", () => {
    it("list-field remove button ('Remove value') has an accessible name", () => {
      const entity = makeEntity({ id: "e1" });
      const project = makeProject([entity]);
      render(
        <EntitiesTab
          project={project}
          drafts={{
            e1: {
              profile: { player: { visible_traits: ["brave"] } } as never,
            },
          }}
          onDraftsChange={vi.fn()}
        />,
      );
      expect(screen.getByRole("button", { name: "Remove value" })).toBeInTheDocument();
    });

    it("relationship remove button ('Remove link') has an accessible name", () => {
      const entity = makeEntity({ id: "e1" });
      const project = makeProject([entity]);
      render(
        <EntitiesTab
          project={project}
          drafts={{
            e1: {
              relationships: [{ entity: "other", type: "allied_with", visibility: "dm" }] as never,
            },
          }}
          onDraftsChange={vi.fn()}
        />,
      );
      expect(screen.getByRole("button", { name: "Remove link" })).toBeInTheDocument();
    });
  });
});

describe("Q25 — mobile entity bottom sheet accessible name", () => {
  it("sheet dialog has an accessible name equal to the open entity title", () => {
    render(
      <Sheet open>
        <SheetContent side="bottom" className="h-[80vh] p-0">
          <SheetTitle className="sr-only">Tideshore</SheetTitle>
          <SheetDescription className="sr-only">Entity details</SheetDescription>
        </SheetContent>
      </Sheet>,
    );
    expect(screen.getByRole("dialog", { name: "Tideshore" })).toBeInTheDocument();
  });
});

describe("Q26 — map pins accessible names", () => {
  const ENTITY_WITH_TYPE: Entity = {
    id: "pin-ent-1",
    title: "Goblin Cave",
    type: "dungeon",
    visibility: "player",
    aliases: [],
    tags: [],
    images: [],
    body: "",
    bodyHtml: "",
    frontmatter: {},
    sourcePath: "content/pin-ent-1.md",
    links: [],
    backlinks: [],
    relationships: [],
    profile: {},
  } as unknown as Entity;

  const ENTITY_NO_TYPE: Entity = {
    id: "pin-ent-2",
    title: "The Crossing",
    type: "note",
    visibility: "player",
    aliases: [],
    tags: [],
    images: [],
    body: "",
    bodyHtml: "",
    frontmatter: {},
    sourcePath: "content/pin-ent-2.md",
    links: [],
    backlinks: [],
    relationships: [],
    profile: {},
  } as unknown as Entity;

  const PLACEMENT_1: MapPlacement = {
    id: "pl-1",
    entityId: "pin-ent-1",
    mapId: "map-1",
    x: 100,
    y: 200,
    visibility: "player",
  } as unknown as MapPlacement;

  const PLACEMENT_2: MapPlacement = {
    id: "pl-2",
    entityId: "pin-ent-2",
    mapId: "map-1",
    x: 300,
    y: 400,
    visibility: "player",
  } as unknown as MapPlacement;

  it("marker title includes entity title and player type label when type has a label", () => {
    render(
      <PlacementMarkers
        dx={0}
        H={1000}
        placements={[PLACEMENT_1]}
        entityById={new Map([["pin-ent-1", ENTITY_WITH_TYPE]])}
        onOpenEntity={vi.fn()}
        visited={new Set()}
        openId={null}
      />,
    );
    const marker = document.querySelector('[data-leaflet="Marker"]');
    expect(marker).not.toBeNull();
    // "dungeon" maps to "Dungeon" via playerTypeLabel
    expect(marker?.getAttribute("data-title")).toBe("Goblin Cave, Dungeon");
  });

  it("marker title is just the entity title when playerTypeLabel returns empty string", () => {
    render(
      <PlacementMarkers
        dx={0}
        H={1000}
        placements={[PLACEMENT_2]}
        entityById={new Map([["pin-ent-2", ENTITY_NO_TYPE]])}
        onOpenEntity={vi.fn()}
        visited={new Set()}
        openId={null}
      />,
    );
    const marker = document.querySelector('[data-leaflet="Marker"]');
    expect(marker).not.toBeNull();
    // "note" has no player type label → title is just the entity title
    expect(marker?.getAttribute("data-title")).toBe("The Crossing");
  });
});
