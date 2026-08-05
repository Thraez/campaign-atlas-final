/**
 * Unit tests for src/atlas/save/buildSaveBatch.ts — the pure content
 * builders extracted from AtlasPlacementEditor's buildWorldYamlContent /
 * buildAssetBinaryChanges useCallbacks (Task 7, Step 1).
 *
 * These pin two behavior-preserving contracts:
 *  - world-level `credits` / `assetCredits` keep flowing through to
 *    buildFullWorldYaml (a known drift-sensitive line — regressing this
 *    silently drops credit badges from a save).
 *  - the active-map overlay (regions/routes/fog draft merge) and the
 *    upload-origin `src` rewrite behave exactly like the original inline
 *    useCallback bodies.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { MapDocument, MapLayer, Region, Route, FogOverlay } from "@/atlas/content/schema";
import type { LocalLayer } from "@/atlas/useMapLayers";
import type { BuildFullWorldYamlOpts } from "@/atlas/yaml/buildFullWorldYaml";

const { buildFullWorldYamlMock } = vi.hoisted(() => ({
  buildFullWorldYamlMock: vi.fn((_opts: BuildFullWorldYamlOpts) => "yaml-output"),
}));

vi.mock("@/atlas/yaml/buildFullWorldYaml", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/atlas/yaml/buildFullWorldYaml")>();
  return {
    ...actual,
    buildFullWorldYaml: buildFullWorldYamlMock,
  };
});

import { buildWorldYamlContent, buildAssetBinaryChanges } from "@/atlas/save/buildSaveBatch";

function makeMap(over: Partial<MapDocument> = {}): MapDocument {
  return {
    id: "m1",
    worldId: "test-world",
    name: "Main",
    width: 1000,
    height: 800,
    layers: [],
    ...over,
  };
}

function makeLayer(over: Partial<MapLayer> = {}): MapLayer {
  return {
    id: "layer-1",
    src: "atlas/assets/maps/layer-1.png",
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    opacity: 1,
    zIndex: 10,
    ...over,
  };
}

function makeLocalLayer(over: Partial<LocalLayer> = {}): LocalLayer {
  return {
    id: "layer-1",
    src: "blob:local",
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    opacity: 1,
    zIndex: 10,
    origin: "upload",
    ...over,
  };
}

const REGIONS: Region[] = [
  { id: "r1", mapId: "m1", name: "Region 1", points: [], visibility: "player" },
];
const ROUTES: Route[] = [
  { id: "rt1", mapId: "m1", name: "Route 1", visibility: "player", waypoints: [] },
];
const FOG: FogOverlay = { mapId: "m1", enabled: true, reveals: [] };

beforeEach(() => {
  buildFullWorldYamlMock.mockClear();
});

describe("buildWorldYamlContent", () => {
  it("forwards name, credits and assetCredits through to buildFullWorldYaml (drift contract)", () => {
    const activeMap = makeMap();
    const credits = { badges: true, page: false };
    const assetCredits = { "atlas/assets/maps/a.png": { credit: "Jane Doe", enabled: true } };

    buildWorldYamlContent({
      activeMap,
      maps: [activeMap],
      calendar: undefined,
      schemaVersion: 3,
      name: "Astrath Deeprealm",
      mergedLayers: [],
      localLayers: [],
      regionsEffective: REGIONS,
      routesEffective: ROUTES,
      fog: FOG,
      existingRaw: "# existing header\n",
      credits,
      assetCredits,
    });

    expect(buildFullWorldYamlMock).toHaveBeenCalledTimes(1);
    const call = buildFullWorldYamlMock.mock.calls[0][0];
    expect(call.name).toBe("Astrath Deeprealm");
    expect(call.credits).toBe(credits);
    expect(call.assetCredits).toBe(assetCredits);
    expect(call.existing).toBe("# existing header\n");
    expect(call.schemaVersion).toBe(3);
  });

  it("replaces only the active map, applying regions/routes/fog from the passed drafts", () => {
    const activeMap = makeMap({ id: "m1", name: "Active" });
    const otherMap = makeMap({ id: "m2", name: "Other", regions: [], routes: [] });

    buildWorldYamlContent({
      activeMap,
      maps: [activeMap, otherMap],
      mergedLayers: [],
      localLayers: [],
      regionsEffective: REGIONS,
      routesEffective: ROUTES,
      fog: FOG,
      existingRaw: null,
    });

    const call = buildFullWorldYamlMock.mock.calls[0][0];
    const maps = call.maps as MapDocument[];
    expect(maps).toHaveLength(2);
    // Other map is byte-identical to canon.
    expect(maps[1]).toBe(otherMap);
    // Active map gets the drafts overlaid.
    expect(maps[0]).toMatchObject({
      id: "m1",
      regions: REGIONS,
      routes: ROUTES,
      fog: FOG,
    });
  });

  it("rewrites src for an upload-origin layer, stripping the public/ prefix", () => {
    const activeMap = makeMap();
    const mergedLayer = makeLayer({ id: "layer-1", src: "blob:local" });
    const localUpload = makeLocalLayer({
      id: "layer-1",
      origin: "upload",
      targetPath: "public/atlas/assets/maps/layer-1.png",
    });

    buildWorldYamlContent({
      activeMap,
      maps: [activeMap],
      mergedLayers: [mergedLayer],
      localLayers: [localUpload],
      regionsEffective: [],
      routesEffective: [],
      fog: FOG,
      existingRaw: null,
    });

    const call = buildFullWorldYamlMock.mock.calls[0][0];
    const maps = call.maps as MapDocument[];
    expect(maps[0].layers[0].src).toBe("atlas/assets/maps/layer-1.png");
  });

  it("falls back to the default target path when the upload has no targetPath", () => {
    const activeMap = makeMap();
    const mergedLayer = makeLayer({ id: "layer-9", src: "blob:local" });
    const localUpload = makeLocalLayer({ id: "layer-9", origin: "upload", targetPath: undefined });

    buildWorldYamlContent({
      activeMap,
      maps: [activeMap],
      mergedLayers: [mergedLayer],
      localLayers: [localUpload],
      regionsEffective: [],
      routesEffective: [],
      fog: FOG,
      existingRaw: null,
    });

    const call = buildFullWorldYamlMock.mock.calls[0][0];
    const maps = call.maps as MapDocument[];
    expect(maps[0].layers[0].src).toBe("atlas/assets/maps/layer-9.png");
  });

  it("leaves a non-upload layer's src unchanged", () => {
    const activeMap = makeMap();
    const mergedLayer = makeLayer({ id: "layer-2", src: "atlas/assets/maps/layer-2.png" });
    const localEdit = makeLocalLayer({ id: "layer-2", origin: "edit" });

    buildWorldYamlContent({
      activeMap,
      maps: [activeMap],
      mergedLayers: [mergedLayer],
      localLayers: [localEdit],
      regionsEffective: [],
      routesEffective: [],
      fog: FOG,
      existingRaw: null,
    });

    const call = buildFullWorldYamlMock.mock.calls[0][0];
    const maps = call.maps as MapDocument[];
    expect(maps[0].layers[0].src).toBe("atlas/assets/maps/layer-2.png");
  });

  it("leaves a merged layer with no matching local entry unchanged", () => {
    const activeMap = makeMap();
    const mergedLayer = makeLayer({ id: "layer-3", src: "atlas/assets/maps/layer-3.png" });

    buildWorldYamlContent({
      activeMap,
      maps: [activeMap],
      mergedLayers: [mergedLayer],
      localLayers: [],
      regionsEffective: [],
      routesEffective: [],
      fog: FOG,
      existingRaw: null,
    });

    const call = buildFullWorldYamlMock.mock.calls[0][0];
    const maps = call.maps as MapDocument[];
    expect(maps[0].layers[0].src).toBe("atlas/assets/maps/layer-3.png");
  });
});

describe("buildAssetBinaryChanges", () => {
  it("emits a FileChange for an upload layer with a dataUrl, using its targetPath", () => {
    const local = makeLocalLayer({
      id: "layer-1",
      origin: "upload",
      dataUrl: "data:image/png;base64,AAAA",
      targetPath: "public/atlas/assets/maps/custom.png",
    });

    const changes = buildAssetBinaryChanges([local]);

    expect(changes).toEqual([
      {
        path: "public/atlas/assets/maps/custom.png",
        content: "data:image/png;base64,AAAA",
        kind: "asset-binary",
        baseHash: null,
      },
    ]);
  });

  it("falls back to the default target path when targetPath is absent", () => {
    const local = makeLocalLayer({
      id: "layer-7",
      origin: "upload",
      dataUrl: "data:image/png;base64,BBBB",
      targetPath: undefined,
    });

    const changes = buildAssetBinaryChanges([local]);

    expect(changes[0].path).toBe("public/atlas/assets/maps/layer-7.png");
  });

  it("skips an upload layer with no dataUrl", () => {
    const local = makeLocalLayer({ id: "layer-1", origin: "upload", dataUrl: undefined });
    expect(buildAssetBinaryChanges([local])).toEqual([]);
  });

  it("skips a non-upload layer even if it has a dataUrl", () => {
    const local = makeLocalLayer({
      id: "layer-1",
      origin: "edit",
      dataUrl: "data:image/png;base64,AAAA",
    });
    expect(buildAssetBinaryChanges([local])).toEqual([]);
  });

  it("returns an empty array for no local layers", () => {
    expect(buildAssetBinaryChanges([])).toEqual([]);
  });
});
