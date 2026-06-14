/**
 * Tests for the published-diff computation used by the editor's
 * "Changes since last publish" panel.
 */
import { describe, it, expect } from "vitest";
import { computeAtlasDiff } from "../atlas/publish/computeAtlasDiff";
import type { AtlasProject, Entity, MapDocument, MapPlacement } from "../atlas/content/schema";

function entity(over: Partial<Entity> & { id: string; title: string }): Entity {
  return {
    id: over.id,
    title: over.title,
    type: over.type ?? "note",
    visibility: over.visibility ?? "player",
    aliases: over.aliases ?? [],
    tags: over.tags ?? [],
    images: over.images ?? [],
    body: over.body ?? "",
    bodyHtml: over.bodyHtml ?? "",
    frontmatter: over.frontmatter ?? {},
    sourcePath: over.sourcePath ?? "",
    links: over.links ?? [],
    backlinks: over.backlinks ?? [],
    summary: over.summary,
    world: over.world,
    canon: over.canon,
    profile: over.profile,
    relationships: over.relationships,
  };
}

function map(over: Partial<MapDocument> & { id: string }): MapDocument {
  return {
    id: over.id,
    worldId: over.worldId ?? "w",
    name: over.name ?? over.id,
    width: over.width ?? 1000,
    height: over.height ?? 1000,
    layers: over.layers ?? [],
    regions: over.regions ?? [],
    routes: over.routes ?? [],
    fog: over.fog,
    scale: over.scale,
    grid: over.grid,
    oceanColor: over.oceanColor,
    wrapX: over.wrapX,
  };
}

function project(entities: Entity[], maps: MapDocument[], placements: MapPlacement[] = []): AtlasProject {
  return {
    version: "v1",
    publishedAt: "2026-01-01T00:00:00Z",
    worlds: [{ id: "w", name: "World" }],
    maps,
    entities,
    placements,
    assets: [],
  };
}

describe("computeAtlasDiff", () => {
  it("returns an empty diff for two identical projects", () => {
    const p = project([entity({ id: "a", title: "A" })], [map({ id: "m" })]);
    const diff = computeAtlasDiff(p, p);
    expect(diff.hasChanges).toBe(false);
    expect(diff.counts).toEqual({ entities: 0, placements: 0, maps: 0, overlays: 0 });
  });

  it("returns empty diff when baseline is null", () => {
    const p = project([entity({ id: "a", title: "A" })], [map({ id: "m" })]);
    const diff = computeAtlasDiff(null, p);
    expect(diff.hasChanges).toBe(false);
    expect(diff.meta.currentVersion).toBe("v1");
  });

  it("detects added entities", () => {
    const before = project([entity({ id: "a", title: "A" })], [map({ id: "m" })]);
    const after = project([
      entity({ id: "a", title: "A" }),
      entity({ id: "b", title: "B" }),
    ], [map({ id: "m" })]);
    const diff = computeAtlasDiff(before, after);
    expect(diff.entities.find((e) => e.id === "b")?.kind).toBe("added");
    expect(diff.counts.entities).toBe(1);
  });

  it("detects removed entities", () => {
    const before = project([
      entity({ id: "a", title: "A" }),
      entity({ id: "b", title: "B" }),
    ], [map({ id: "m" })]);
    const after = project([entity({ id: "a", title: "A" })], [map({ id: "m" })]);
    const diff = computeAtlasDiff(before, after);
    expect(diff.entities.find((e) => e.id === "b")?.kind).toBe("removed");
  });

  it("detects visibility changes", () => {
    const before = project([entity({ id: "a", title: "A", visibility: "rumor" })], [map({ id: "m" })]);
    const after = project([entity({ id: "a", title: "A", visibility: "player" })], [map({ id: "m" })]);
    const diff = computeAtlasDiff(before, after);
    const change = diff.entities.find((e) => e.kind === "visibility-changed");
    expect(change).toBeDefined();
    expect(change!.before).toBe("rumor");
    expect(change!.after).toBe("player");
  });

  it("detects body-substance changes via signature", () => {
    const before = project([entity({ id: "a", title: "A", body: "short body here" })], [map({ id: "m" })]);
    const after = project([entity({ id: "a", title: "A", body: "very different body content now" })], [map({ id: "m" })]);
    const diff = computeAtlasDiff(before, after);
    expect(diff.entities.find((e) => e.kind === "body-changed")).toBeDefined();
  });

  it("ignores trivial whitespace-only body edits", () => {
    const before = project([entity({ id: "a", title: "A", body: "exact same body content" })], [map({ id: "m" })]);
    const after = project([entity({ id: "a", title: "A", body: "  exact same body content  " })], [map({ id: "m" })]);
    const diff = computeAtlasDiff(before, after);
    expect(diff.entities.find((e) => e.kind === "body-changed")).toBeUndefined();
  });

  it("detects placement add, remove, and move", () => {
    const before = project(
      [entity({ id: "a", title: "A" }), entity({ id: "b", title: "B" })],
      [map({ id: "m" })],
      [
        { id: "a@m", entityId: "a", mapId: "m", x: 100, y: 100, visibility: "player" },
        { id: "b@m", entityId: "b", mapId: "m", x: 200, y: 200, visibility: "player" },
      ]
    );
    const after = project(
      [entity({ id: "a", title: "A" }), entity({ id: "c", title: "C" })],
      [map({ id: "m" })],
      [
        { id: "a@m", entityId: "a", mapId: "m", x: 150, y: 100, visibility: "player" }, // moved
        { id: "c@m", entityId: "c", mapId: "m", x: 300, y: 300, visibility: "player" }, // added
      ]
    );
    const diff = computeAtlasDiff(before, after);
    expect(diff.placements.find((p) => p.entityId === "a" && p.kind === "moved")).toBeDefined();
    expect(diff.placements.find((p) => p.entityId === "b" && p.kind === "removed")).toBeDefined();
    expect(diff.placements.find((p) => p.entityId === "c" && p.kind === "added")).toBeDefined();
  });

  it("ignores sub-pixel placement moves", () => {
    const before = project(
      [entity({ id: "a", title: "A" })],
      [map({ id: "m" })],
      [{ id: "a@m", entityId: "a", mapId: "m", x: 100, y: 100, visibility: "player" }]
    );
    const after = project(
      [entity({ id: "a", title: "A" })],
      [map({ id: "m" })],
      [{ id: "a@m", entityId: "a", mapId: "m", x: 100.5, y: 100.5, visibility: "player" }]
    );
    const diff = computeAtlasDiff(before, after);
    expect(diff.placements.find((p) => p.kind === "moved")).toBeUndefined();
  });

  it("detects map add and remove", () => {
    const before = project([], [map({ id: "m1" }), map({ id: "m2" })]);
    const after = project([], [map({ id: "m1" }), map({ id: "m3" })]);
    const diff = computeAtlasDiff(before, after);
    expect(diff.maps.find((m) => m.id === "m2")?.kind).toBe("removed");
    expect(diff.maps.find((m) => m.id === "m3")?.kind).toBe("added");
  });

  it("detects region added on the same map", () => {
    const before = project([], [map({ id: "m", regions: [] })]);
    const after = project([], [map({
      id: "m",
      regions: [{ id: "r1", mapId: "m", name: "New region", points: [[0, 0], [1, 0], [1, 1]], visibility: "player" }],
    })]);
    const diff = computeAtlasDiff(before, after);
    expect(diff.overlays.find((o) => o.kind === "region-added" && o.name === "New region")).toBeDefined();
  });

  it("detects entity title changes", () => {
    const before = project([entity({ id: "a", title: "Old Name" })], [map({ id: "m" })]);
    const after = project([entity({ id: "a", title: "New Name" })], [map({ id: "m" })]);
    const diff = computeAtlasDiff(before, after);
    const change = diff.entities.find((e) => e.kind === "title-changed");
    expect(change).toBeDefined();
    expect(change!.before).toBe("Old Name");
    expect(change!.after).toBe("New Name");
  });

  it("detects entity summary changes", () => {
    const before = project([entity({ id: "a", title: "A", summary: "original" })], [map({ id: "m" })]);
    const after = project([entity({ id: "a", title: "A", summary: "updated" })], [map({ id: "m" })]);
    const diff = computeAtlasDiff(before, after);
    expect(diff.entities.find((e) => e.kind === "summary-changed")).toBeDefined();
  });

  it("detects route added and removed on the same map", () => {
    const before = project([], [map({
      id: "m",
      routes: [{ id: "rt1", mapId: "m", name: "Old Road", waypoints: [[0, 0], [1, 1]], visibility: "player" }],
    })]);
    const after = project([], [map({
      id: "m",
      routes: [{ id: "rt2", mapId: "m", name: "New Road", waypoints: [[2, 2], [3, 3]], visibility: "player" }],
    })]);
    const diff = computeAtlasDiff(before, after);
    expect(diff.overlays.find((o) => o.kind === "route-added" && o.name === "New Road")).toBeDefined();
    expect(diff.overlays.find((o) => o.kind === "route-removed" && o.name === "Old Road")).toBeDefined();
  });

  it("detects region removed on the same map", () => {
    const before = project([], [map({
      id: "m",
      regions: [{ id: "r1", mapId: "m", name: "Gone region", points: [[0, 0], [1, 0], [1, 1]], visibility: "player" }],
    })]);
    const after = project([], [map({ id: "m", regions: [] })]);
    const diff = computeAtlasDiff(before, after);
    expect(diff.overlays.find((o) => o.kind === "region-removed" && o.name === "Gone region")).toBeDefined();
  });

  it("emits overlay removals for regions and routes on a removed map", () => {
    const before = project([], [map({
      id: "m",
      regions: [{ id: "r1", mapId: "m", name: "Lost region", points: [[0, 0], [1, 0], [1, 1]], visibility: "player" }],
      routes: [{ id: "rt1", mapId: "m", name: "Lost road", waypoints: [[0, 0], [1, 1]], visibility: "player" }],
    })]);
    const after = project([], []);
    const diff = computeAtlasDiff(before, after);
    expect(diff.maps.find((m) => m.id === "m" && m.kind === "removed")).toBeDefined();
    expect(diff.overlays.find((o) => o.kind === "region-removed" && o.name === "Lost region")).toBeDefined();
    expect(diff.overlays.find((o) => o.kind === "route-removed" && o.name === "Lost road")).toBeDefined();
  });

  it("hasChanges reflects total change count", () => {
    const before = project([], [map({ id: "m" })]);
    const after = project([entity({ id: "a", title: "A" })], [map({ id: "m" })]);
    const diff = computeAtlasDiff(before, after);
    expect(diff.hasChanges).toBe(true);
  });

  it("counts.entities is distinct entity count — two change-kinds on one entity counts as 1", () => {
    const before = project(
      [entity({ id: "a", title: "Old Name", body: "old body content here that is different" })],
      [map({ id: "m" })]
    );
    const after = project(
      [entity({ id: "a", title: "New Name", body: "new different body content here" })],
      [map({ id: "m" })]
    );
    const diff = computeAtlasDiff(before, after);
    // title-changed + body-changed = 2 records for entity "a"
    expect(diff.entities.filter((e) => e.id === "a").length).toBeGreaterThan(1);
    // but the summary count is 1 (one distinct entity changed)
    expect(diff.counts.entities).toBe(1);
  });

  it("counts.entities handles multiple distinct entities each with multiple change-kinds", () => {
    const before = project(
      [
        entity({ id: "a", title: "A Old", body: "body a old" }),
        entity({ id: "b", title: "B Old", body: "body b old content" }),
      ],
      [map({ id: "m" })]
    );
    const after = project(
      [
        entity({ id: "a", title: "A New", body: "body a new different" }),
        entity({ id: "b", title: "B New", body: "body b new different content" }),
      ],
      [map({ id: "m" })]
    );
    const diff = computeAtlasDiff(before, after);
    // Each entity has title-changed + body-changed = 4 records total
    expect(diff.entities.length).toBe(4);
    // But the distinct entity count is 2
    expect(diff.counts.entities).toBe(2);
  });

  it("counts.maps uses distinct map ids", () => {
    const before = project([], [map({ id: "m1" }), map({ id: "m2" })]);
    const after = project([], [map({ id: "m1" }), map({ id: "m3" })]);
    const diff = computeAtlasDiff(before, after);
    expect(diff.counts.maps).toBe(2); // m2 removed + m3 added = 2 distinct maps
  });

  it("counts.placements uses distinct entityId+mapId pairs", () => {
    const before = project(
      [entity({ id: "a", title: "A" }), entity({ id: "b", title: "B" })],
      [map({ id: "m" })],
      [
        { id: "a@m", entityId: "a", mapId: "m", x: 100, y: 100, visibility: "player" },
        { id: "b@m", entityId: "b", mapId: "m", x: 200, y: 200, visibility: "player" },
      ]
    );
    const after = project(
      [entity({ id: "a", title: "A" }), entity({ id: "b", title: "B" })],
      [map({ id: "m" })],
      [
        { id: "a@m", entityId: "a", mapId: "m", x: 150, y: 100, visibility: "player" }, // moved
        // b removed
      ]
    );
    const diff = computeAtlasDiff(before, after);
    expect(diff.placements.length).toBe(2); // moved + removed
    expect(diff.counts.placements).toBe(2); // 2 distinct placements
  });
});
