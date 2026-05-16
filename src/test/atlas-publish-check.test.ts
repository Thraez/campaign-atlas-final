import { describe, it, expect } from "vitest";
import { validateProject, buildPublishReport } from "@/atlas/yaml/validateProject";
import type { AtlasProject, MapDocument, Entity } from "@/atlas/content/schema";

const map: MapDocument = {
  id: "m1", worldId: "w1", name: "Main", width: 1000, height: 1000,
  layers: [{ id: "L1", src: "atlas/assets/maps/m.jpg", x: 0, y: 0, width: 1000, height: 1000, opacity: 1, zIndex: 1 }],
};

function entity(over: Partial<Entity> = {}): Entity {
  return {
    id: "e1", title: "E1", type: "settlement", visibility: "player",
    aliases: [], tags: [], summary: "x", images: [], body: "", bodyHtml: "",
    frontmatter: {}, sourcePath: "x.md", links: [], backlinks: [],
    ...over,
  };
}

const baseProject = (over: Partial<AtlasProject> = {}): AtlasProject => ({
  version: "1.0.0", publishedAt: new Date().toISOString(),
  worlds: [{ id: "w1", name: "W" }], maps: [map],
  entities: [], placements: [], assets: [], ...over,
});

describe("validateProject — Publish Check", () => {
  it("flags duplicate entity slugs", () => {
    const p = baseProject({ entities: [entity({ id: "dup" }), entity({ id: "dup", title: "Other" })] });
    const r = validateProject({ project: p, draftPlacements: [] });
    expect(r.issues.some((i) => i.code === "duplicate-slug")).toBe(true);
    expect(r.counts.blocking).toBeGreaterThan(0);
  });

  it("flags missing summary as suggestion and missing type as warning", () => {
    const p = baseProject({ entities: [entity({ id: "x", summary: undefined, type: "" })] });
    const r = validateProject({ project: p, draftPlacements: [] });
    expect(r.issues.some((i) => i.code === "missing-summary" && i.severity === "suggestion")).toBe(true);
    expect(r.issues.some((i) => i.code === "missing-type" && i.severity === "warning")).toBe(true);
  });

  it("flags player wikilink to DM-only entity", () => {
    const dm = entity({ id: "secret", title: "Secret", visibility: "dm" });
    const pub = entity({
      id: "town", title: "Town",
      links: [{ target: "Secret", resolvedId: "secret", display: "Secret", broken: false }],
    });
    const p = baseProject({ entities: [dm, pub] });
    const r = validateProject({ project: p, draftPlacements: [] });
    expect(r.issues.some((i) => i.code === "wikilink-to-dm")).toBe(true);
  });

  it("flags player relationship to DM-only entity as blocking spoiler-leak", () => {
    const dm = entity({ id: "boss", visibility: "dm" });
    const pub = entity({
      id: "guard", relationships: [{ entity: "boss", type: "serves", visibility: "player" }],
    });
    const p = baseProject({ entities: [dm, pub] });
    const r = validateProject({ project: p, draftPlacements: [] });
    expect(r.issues.some((i) => i.code === "spoiler-leak-relationship")).toBe(true);
  });

  it("passes player relationship to player-visible target", () => {
    const a = entity({ id: "a", visibility: "player" });
    const b = entity({
      id: "b", visibility: "player",
      relationships: [{ entity: "a", type: "ally", visibility: "player" }],
    });
    const r = validateProject({ project: baseProject({ entities: [a, b] }), draftPlacements: [] });
    expect(r.issues.some((i) => i.code === "spoiler-leak-relationship")).toBe(false);
  });

  it("blocks rumor relationship to hidden target", () => {
    const hidden = entity({ id: "h", visibility: "hidden" });
    const pub = entity({
      id: "p", visibility: "rumor",
      relationships: [{ entity: "h", type: "knows-of", visibility: "rumor" }],
    });
    const r = validateProject({ project: baseProject({ entities: [hidden, pub] }), draftPlacements: [] });
    expect(r.issues.some((i) => i.code === "spoiler-leak-relationship")).toBe(true);
  });

  it("allows DM-only relationship to DM-only target", () => {
    const a = entity({ id: "a", visibility: "dm" });
    const b = entity({
      id: "b", visibility: "dm",
      relationships: [{ entity: "a", type: "controls", visibility: "dm" }],
    });
    const r = validateProject({ project: baseProject({ entities: [a, b] }), draftPlacements: [] });
    expect(r.issues.some((i) => i.code === "spoiler-leak-relationship")).toBe(false);
  });

  it("warns on unresolved relationship target", () => {
    const e = entity({
      id: "x", visibility: "player",
      relationships: [{ entity: "ghost", type: "remembers", visibility: "player" }],
    });
    const r = validateProject({ project: baseProject({ entities: [e] }), draftPlacements: [] });
    expect(r.issues.some((i) => i.code === "relationship-unresolved")).toBe(true);
  });

  it("warns on external map asset URLs", () => {
    const p = baseProject({
      maps: [{ ...map, layers: [{ ...map.layers[0], src: "https://example.com/x.png" }] }],
    });
    const r = validateProject({ project: p, draftPlacements: [] });
    expect(r.issues.some((i) => i.code === "external-asset")).toBe(true);
  });

  it("flags region with points outside map bounds", () => {
    const p = baseProject({
      maps: [{ ...map, regions: [{ id: "r", mapId: "m1", name: "Big", visibility: "player", points: [[0,0],[9999,0],[0,9999]] }] }],
    });
    const r = validateProject({ project: p, draftPlacements: [] });
    expect(r.issues.some((i) => i.code === "region-out-of-bounds")).toBe(true);
  });

  it("buildPublishReport renders categorized markdown", () => {
    const p = baseProject({ entities: [entity({ id: "x", summary: undefined })] });
    const r = validateProject({ project: p, draftPlacements: [] });
    const md = buildPublishReport(r);
    expect(md).toMatch(/Atlas Publish Check/);
    expect(md).toMatch(/Suggestion/);
  });

  it("populates meta and category labels", () => {
    const r = validateProject({ project: baseProject(), draftPlacements: [] });
    expect(r.meta.entityCount).toBe(0);
    expect(r.meta.mapCount).toBe(1);
    expect(r.meta.atlasVersion).toBe("1.0.0");
  });
});
