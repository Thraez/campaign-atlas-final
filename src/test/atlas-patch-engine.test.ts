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

describe("validatePatchYaml map patch", () => {
  it("accepts a well-formed map patch", () => {
    const patch = "maps:\n  - id: dungeon-level-1\n    name: Level 1\n    width: 4000\n    height: 3000\n";
    const r = validatePatchYaml(patch, "map");
    expect(r.ok).toBe(true);
    expect(r.errors).toHaveLength(0);
  });

  it("rejects a patch with no maps: array", () => {
    const patch = "worlds:\n  - id: w1\n    name: My World\n";
    const r = validatePatchYaml(patch, "map");
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toMatch(/maps/);
  });

  it("rejects a patch with an empty maps: array", () => {
    const patch = "maps: []\n";
    const r = validatePatchYaml(patch, "map");
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toMatch(/empty/i);
  });

  it("rejects a map entry missing a string id", () => {
    const patch = "maps:\n  - name: Unnamed\n    width: 1000\n    height: 800\n";
    const r = validatePatchYaml(patch, "map");
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toMatch(/id/);
  });

  it("rejects markdown code fences in a map patch", () => {
    const patch = "```yaml\nmaps:\n  - id: x\n```\n";
    const r = validatePatchYaml(patch, "map");
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toMatch(/fence/i);
  });
});

describe("validatePatchYaml entity-frontmatter — uncovered branches", () => {
  it("rejects an empty patch (all comments / blank lines)", () => {
    const r = validatePatchYaml("# just a comment\n", "entity-frontmatter");
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toMatch(/empty/i);
  });

  it("rejects when no object blocks are parsed (e.g. YAML list at top level)", () => {
    // yaml.loadAll parses a list — filtered out because it's an array, not an object
    const r = validatePatchYaml("- item1\n- item2\n", "entity-frontmatter");
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toMatch(/at least one frontmatter block/);
  });

  it("warns when a block has no atlas: section (title-only)", () => {
    const r = validatePatchYaml("title: Thornhold\n", "entity-frontmatter");
    expect(r.ok).toBe(true);
    expect(r.warnings.join(" ")).toMatch(/no `atlas:/);
  });

  it("rejects when atlas: is an array (must be a mapping)", () => {
    const r = validatePatchYaml("atlas:\n  - one\n  - two\n", "entity-frontmatter");
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toMatch(/mapping/);
  });

  it("rejects when atlas: is a scalar (must be a mapping)", () => {
    const r = validatePatchYaml("atlas: not-a-mapping\n", "entity-frontmatter");
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toMatch(/mapping/);
  });

  it("rejects when atlas.type is not a string", () => {
    const r = validatePatchYaml("atlas:\n  type: 42\n", "entity-frontmatter");
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toMatch(/type must be a string/);
  });

  it("warns when atlas.summary is not a string", () => {
    const r = validatePatchYaml("atlas:\n  summary: 99\n", "entity-frontmatter");
    expect(r.ok).toBe(true);
    expect(r.warnings.join(" ")).toMatch(/summary.*string/);
  });

  it("rejects when atlas.aliases is not an array", () => {
    const r = validatePatchYaml("atlas:\n  aliases: wrong\n", "entity-frontmatter");
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toMatch(/aliases.*array/);
  });

  it("rejects when atlas.images is not an array", () => {
    const r = validatePatchYaml("atlas:\n  images: not-an-array\n", "entity-frontmatter");
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toMatch(/images.*array/);
  });

  it("rejects when atlas.placements is not an array", () => {
    const r = validatePatchYaml("atlas:\n  placements: bad\n", "entity-frontmatter");
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toMatch(/placements.*array/);
  });

  it("warns when a placement entry is missing mapId", () => {
    const r = validatePatchYaml("atlas:\n  placements:\n    - x: 0.5\n      y: 0.3\n", "entity-frontmatter");
    expect(r.ok).toBe(true);
    expect(r.warnings.join(" ")).toMatch(/mapId/);
  });

  it("rejects when a placement entry has non-numeric coordinates", () => {
    const r = validatePatchYaml("atlas:\n  placements:\n    - mapId: m1\n      x: left\n      y: top\n", "entity-frontmatter");
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toMatch(/numeric.*x.*y|x.*y.*numeric/i);
  });

  it("rejects when atlas.relationships is not an array", () => {
    const r = validatePatchYaml("atlas:\n  relationships: bad\n", "entity-frontmatter");
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toMatch(/relationships.*array/);
  });
});

describe("validatePatchYaml placement kind", () => {
  it("accepts a valid placement patch", () => {
    const patch = "atlas:\n  placements:\n    - mapId: overland\n      x: 0.5\n      y: 0.3\n";
    const r = validatePatchYaml(patch, "placement");
    expect(r.ok).toBe(true);
    expect(r.errors).toHaveLength(0);
  });

  it("rejects when no atlas.placements block is present", () => {
    const r = validatePatchYaml("title: Thornhold\n", "placement");
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toMatch(/placement.*at least one/i);
  });

  it("warns when a placement entry is missing mapId", () => {
    const patch = "atlas:\n  placements:\n    - x: 0.2\n      y: 0.4\n";
    const r = validatePatchYaml(patch, "placement");
    expect(r.ok).toBe(true);
    expect(r.warnings.join(" ")).toMatch(/mapId/);
  });

  it("rejects when a placement entry has non-numeric coordinates", () => {
    const patch = "atlas:\n  placements:\n    - mapId: overland\n      x: far-left\n      y: top\n";
    const r = validatePatchYaml(patch, "placement");
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toMatch(/numeric/i);
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
