import { describe, it, expect } from "vitest";
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

// buildPlacementPatch / buildPlacementJson / buildAssetManifest were removed
// when the offline-export modal was deleted. The canonical save flow in
// src/atlas/save/canonicalPlacementSave.ts owns this path now (see
// src/test/canonical-placement-save.test.ts for its round-trip coverage).

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
