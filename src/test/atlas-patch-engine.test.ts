import { describe, it, expect } from "vitest";
import yaml from "js-yaml";
import {
  buildPlacementPatch,
  buildWorldMapPatch,
  buildAssetManifest,
  type PlacementOverride,
} from "@/atlas/yaml/buildPatches";
import { validateProject } from "@/atlas/yaml/validateProject";
import { validatePatchYaml } from "@/atlas/yaml/validatePatch";
import type { AtlasProject, MapDocument, Entity } from "@/atlas/content/schema";

const map: MapDocument = {
  id: "m1",
  worldId: "w1",
  name: "Overview",
  width: 1000,
  height: 800,
  layers: [
    { id: "base", src: "/atlas/assets/maps/base.jpg", x: 0, y: 0, width: 1000, height: 800, opacity: 1, zIndex: 1 },
  ],
};

const project: AtlasProject = {
  version: "1",
  publishedAt: new Date().toISOString(),
  worlds: [{ id: "w1", name: "World", defaultMapId: "m1" }],
  maps: [map],
  entities: [
    { id: "town", title: "Town", type: "settlement", visibility: "player", aliases: [], tags: [], images: [], body: "", bodyHtml: "", frontmatter: {}, sourcePath: "town.md", links: [], backlinks: [] },
    { id: "lair", title: "Lair", type: "dungeon", visibility: "dm", aliases: [], tags: [], images: [], body: "", bodyHtml: "", frontmatter: {}, sourcePath: "lair.md", links: [], backlinks: [] },
  ] as Entity[],
  placements: [],
  assets: [],
};

describe("buildPlacementPatch", () => {
  it("produces parseable YAML with one entity block per placement", () => {
    const placements: PlacementOverride[] = [{ entityId: "town", mapId: "m1", x: 100, y: 200 }];
    const a = buildPlacementPatch({ project, mapId: "m1", placements });
    expect(a.filename).toBe("placements-patch-m1.yaml");
    const validation = validatePatchYaml(a.content, "placement");
    expect(validation.ok).toBe(true);
    expect(a.summary[0]).toMatch(/1 entity placement/);
  });
});

describe("buildPlacementJson label/pin round-trip", () => {
  it("preserves label and pin overrides in JSON output", async () => {
    const { buildPlacementJson } = await import("@/atlas/yaml/buildPatches");
    const placements: PlacementOverride[] = [{
      entityId: "town", mapId: "m1", x: 10, y: 20,
      label: "Custom Town Name",
      pin: { color: "#ff0000", shape: "star" },
    }];
    const a = buildPlacementJson({ project, mapId: "m1", placements });
    const parsed = JSON.parse(a.content) as Array<Record<string, unknown>>;
    expect(parsed[0].label).toBe("Custom Town Name");
    expect(parsed[0].pin).toEqual({ color: "#ff0000", shape: "star" });
  });

  it("omits label when it equals entity title (clean output)", async () => {
    const { buildPlacementJson } = await import("@/atlas/yaml/buildPatches");
    const a = buildPlacementJson({
      project, mapId: "m1",
      placements: [{ entityId: "town", mapId: "m1", x: 1, y: 2, label: "Town" }],
    });
    expect(JSON.parse(a.content)[0].label).toBeUndefined();
  });
});

describe("buildWorldMapPatch nested geometry preservation", () => {
  it("echoes existing regions/routes/fog when not overridden", async () => {
    const { buildWorldMapPatch } = await import("@/atlas/yaml/buildPatches");
    const mapWithGeom: MapDocument = {
      ...map,
      regions: [{ id: "r1", mapId: "m1", name: "R", visibility: "player", points: [[0,0],[1,0],[1,1]] }],
      routes: [{ id: "rt1", mapId: "m1", name: "RT", visibility: "player", waypoints: [[0,0],[10,10]] }],
      fog: { mapId: "m1", enabled: true, reveals: [[[0,0],[1,0],[1,1]]] },
    };
    const a = buildWorldMapPatch({ map: mapWithGeom, mergedLayers: mapWithGeom.layers, localLayers: [] });
    expect(a.content).toMatch(/regions:/);
    expect(a.content).toMatch(/routes:/);
    expect(a.content).toMatch(/fog:/);
  });
});

describe("validatePatchYaml entity-frontmatter", () => {
  it("accepts a valid frontmatter block", async () => {
    const yaml = `# file: x.md\n---\ntitle: X\natlas:\n  visibility: player\n  type: settlement\n  summary: hello\n---\n`;
    const r = validatePatchYaml(yaml, "entity-frontmatter");
    expect(r.ok).toBe(true);
  });
  it("rejects an invalid visibility value", async () => {
    const yaml = `---\natlas:\n  visibility: secret\n---\n`;
    const r = validatePatchYaml(yaml, "entity-frontmatter");
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toMatch(/visibility/);
  });
  it("rejects markdown fences", async () => {
    const yaml = "```yaml\natlas:\n  visibility: player\n```\n";
    const r = validatePatchYaml(yaml, "entity-frontmatter");
    expect(r.ok).toBe(false);
  });
});

describe("buildWorldMapPatch", () => {
  it("emits a maps[] entry with deduped layer ids", () => {
    const a = buildWorldMapPatch({ map, mergedLayers: map.layers, localLayers: [] });
    const v = validatePatchYaml(a.content, "map");
    expect(v.ok).toBe(true);
    const parsed = yaml.load(a.content.split("\n").filter((l) => !l.startsWith("#")).join("\n")) as { maps: Array<{ id: string; layers: unknown[] }> };
    expect(parsed.maps[0].id).toBe("m1");
    expect(parsed.maps[0].layers).toHaveLength(1);
  });

  it("throws on duplicate layer ids", () => {
    const dup = [...map.layers, { ...map.layers[0] }];
    expect(() => buildWorldMapPatch({ map, mergedLayers: dup, localLayers: [] })).toThrow(/Duplicate layer id/);
  });

  it("flags external URL layers in the asset manifest", () => {
    const ext = [{ ...map.layers[0], src: "https://cdn.example.com/x.jpg" }];
    const a = buildWorldMapPatch({ map, mergedLayers: ext, localLayers: [] });
    expect(a.assets?.some((x) => x.source === "external")).toBe(true);
  });
});

describe("buildAssetManifest", () => {
  it("groups by source", () => {
    const m = buildAssetManifest([
      { filename: "a.jpg", targetPath: "public/a.jpg", source: "upload" },
      { filename: "b.jpg", targetPath: "https://x/b.jpg", source: "external" },
    ]);
    expect(m.content).toMatch(/upload:/);
    expect(m.content).toMatch(/external:/);
  });
});

describe("validateProject", () => {
  it("passes a clean project", () => {
    const r = validateProject({ project, draftPlacements: [{ entityId: "town", mapId: "m1", x: 100, y: 200 }] });
    expect(r.counts.blocking).toBe(0);
  });

  it("flags out-of-bounds placements", () => {
    const r = validateProject({ project, draftPlacements: [{ entityId: "town", mapId: "m1", x: 99999, y: 0 }] });
    expect(r.issues.some((i) => i.code === "pin-out-of-bounds")).toBe(true);
  });

  it("flags unknown map id as blocking", () => {
    const r = validateProject({ project, draftPlacements: [{ entityId: "town", mapId: "missing", x: 0, y: 0 }] });
    expect(r.counts.blocking).toBeGreaterThan(0);
  });

  it("flags duplicate map id", () => {
    const dup = { ...project, maps: [map, { ...map }] };
    const r = validateProject({ project: dup, draftPlacements: [] });
    expect(r.issues.some((i) => i.code === "duplicate-map-id")).toBe(true);
  });

  it("flags player region linking to DM-only entity (spoiler leak)", () => {
    const leaky = {
      ...project,
      maps: [{ ...map, regions: [{ id: "r1", mapId: "m1", name: "Leak", visibility: "player" as const, points: [[0,0],[1,0],[1,1]] as [number,number][], entityId: "lair" }] }],
    };
    const r = validateProject({ project: leaky, draftPlacements: [] });
    expect(r.issues.some((i) => i.code.startsWith("spoiler-leak"))).toBe(true);
  });

  it("flags region with too few points", () => {
    const bad = {
      ...project,
      maps: [{ ...map, regions: [{ id: "r1", mapId: "m1", name: "Bad", visibility: "player" as const, points: [[0,0],[1,1]] as [number,number][] }] }],
    };
    const r = validateProject({ project: bad, draftPlacements: [] });
    expect(r.issues.some((i) => i.code === "region-too-few-points")).toBe(true);
  });
});
