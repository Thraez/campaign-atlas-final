// Canonical atlas-data factory for tests.
//
// Many test files historically rolled their own `makeProject`/`makeEntity`.
// This is the shared one, typed against `@/atlas/content/schema` and shaped so
// the output passes `parseAtlasProject` (see src/atlas/content/atlasGuard.ts):
// `version` is a string and the five top-level arrays are always present.
//
// Every factory takes a `Partial<...>` override so a test can tweak just the
// fields it cares about.

import type {
  AtlasProject,
  Entity,
  MapDocument,
  MapLayer,
  MapPlacement,
  World,
} from "@/atlas/content/schema";
import type { SearchIndexEntry } from "@/atlas/content/loader";

export function makeLayer(over: Partial<MapLayer> = {}): MapLayer {
  return {
    id: "overview-layer",
    src: "atlas/assets/maps/overview.png",
    x: 0,
    y: 0,
    width: 1000,
    height: 1000,
    opacity: 1,
    zIndex: 1,
    ...over,
  };
}

export function makeEntity(over: Partial<Entity> = {}): Entity {
  return {
    id: "iron-tower",
    title: "Iron Tower",
    type: "location",
    visibility: "player",
    aliases: [],
    tags: [],
    images: [],
    body: "A tower of black iron.",
    bodyHtml: "<p>A tower of black iron.</p>",
    frontmatter: {},
    sourcePath: "content/iron-tower.md",
    links: [],
    backlinks: [],
    ...over,
  };
}

export function makeMap(over: Partial<MapDocument> = {}): MapDocument {
  return {
    id: "overview",
    worldId: "astrath-deeprealm",
    name: "Overview",
    width: 1000,
    height: 1000,
    layers: [makeLayer()],
    regions: [],
    routes: [],
    fog: { mapId: "overview", enabled: false, reveals: [], conceals: [] },
    ...over,
  };
}

export function makePlacement(over: Partial<MapPlacement> = {}): MapPlacement {
  return {
    id: "iron-tower@overview",
    entityId: "iron-tower",
    mapId: "overview",
    x: 500,
    y: 500,
    visibility: "player",
    ...over,
  };
}

export function makeWorld(over: Partial<World> = {}): World {
  return {
    id: "astrath-deeprealm",
    name: "Astrath Deeprealm",
    defaultMapId: "overview",
    ...over,
  };
}

export function makeProject(over: Partial<AtlasProject> = {}): AtlasProject {
  return {
    version: "1",
    publishedAt: "2026-01-01T00:00:00.000Z",
    worlds: [makeWorld()],
    maps: [makeMap()],
    entities: [makeEntity()],
    placements: [makePlacement()],
    assets: [],
    ...over,
  };
}

export function makeSearchIndex(): SearchIndexEntry[] {
  return [
    {
      id: "iron-tower",
      title: "Iron Tower",
      type: "location",
      aliases: [],
      tags: [],
      summary: "A tower of black iron.",
      body: "a tower of black iron.",
    },
  ];
}
