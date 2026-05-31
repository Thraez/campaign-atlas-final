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
import type { AtlasProject, Entity, MapDocument, MapLayer } from "@/atlas/content/schema";

// AtlasMinimap uses useMap() which requires a MapContainer context at runtime.
// Stub the hook so we can render the component in isolation.
vi.mock("react-leaflet", () => ({
  useMap: () => ({
    getBounds: () => ({
      getSouthWest: () => ({ lng: 0, lat: 0 }),
      getNorthEast: () => ({ lng: 500, lat: 500 }),
    }),
    on: () => {},
    off: () => {},
  }),
}));

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
              relationships: [
                { entity: "other", type: "allied_with", visibility: "dm" },
              ] as never,
            },
          }}
          onDraftsChange={vi.fn()}
        />,
      );
      expect(screen.getByRole("button", { name: "Remove link" })).toBeInTheDocument();
    });
  });
});
