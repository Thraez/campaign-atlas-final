/**
 * Unit tests for the canonical placement save helper.
 *
 * These pin the merge rules that close the /atlas/edit → atlas.json loop:
 *   - placements on other maps are preserved
 *   - the active-map placement is replaced (or added)
 *   - legacy atlas.x / atlas.y is removed once placements[] exists
 *   - body content + non-atlas frontmatter (tags, title, custom fields)
 *     survive the round-trip unchanged
 *   - the source-path allowlist gates the /__atlas/read fetch
 *   - missing sourcePath is a typed error, not a silent drop
 */
import { describe, it, expect, vi } from "vitest";
import matter from "gray-matter";
import {
  buildCanonicalPlacementChanges,
  mergePlacementsIntoFrontmatter,
  CanonicalSaveError,
} from "@/atlas/save/canonicalPlacementSave";
import type { Entity } from "@/atlas/content/schema";

function makeEntity(over: Partial<Entity> = {}): Entity {
  return {
    id: "thornhold",
    title: "Thornhold",
    type: "settlement",
    visibility: "player",
    aliases: [],
    tags: [],
    images: [],
    body: "",
    bodyHtml: "",
    frontmatter: {},
    sourcePath: "content/astrath/settlements/Thornhold.md",
    links: [],
    backlinks: [],
    ...over,
  };
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("mergePlacementsIntoFrontmatter", () => {
  it("adds a fresh placements[] when none existed", () => {
    const data = { title: "Thornhold", atlas: { type: "settlement", visibility: "player" } };
    const next = mergePlacementsIntoFrontmatter(data, [
      { entityId: "thornhold", mapId: "overview", x: 100, y: 200 },
    ]);
    expect(next.atlas).toMatchObject({
      type: "settlement",
      visibility: "player",
      placements: [{ mapId: "overview", x: 100, y: 200 }],
    });
  });

  it("replaces placements on the touched map and preserves others", () => {
    const data = {
      title: "Thornhold",
      atlas: {
        placements: [
          { mapId: "overview", x: 1, y: 2 },
          { mapId: "northern", x: 10, y: 20 },
        ],
      },
    };
    const next = mergePlacementsIntoFrontmatter(data, [
      { entityId: "thornhold", mapId: "overview", x: 100, y: 200 },
    ]);
    const placements = (next.atlas as { placements: Array<{ mapId: string; x: number; y: number }> }).placements;
    // Sorted alphabetically by mapId — preserved + replaced.
    expect(placements).toEqual([
      { mapId: "northern", x: 10, y: 20 },
      { mapId: "overview", x: 100, y: 200 },
    ]);
  });

  it("drops legacy atlas.x / atlas.y when writing placements[]", () => {
    const data = {
      atlas: { x: 50, y: 60, visibility: "player" },
    };
    const next = mergePlacementsIntoFrontmatter(data, [
      { entityId: "x", mapId: "overview", x: 100, y: 200 },
    ]);
    const a = next.atlas as Record<string, unknown>;
    expect(a.x).toBeUndefined();
    expect(a.y).toBeUndefined();
    expect(a.visibility).toBe("player");
  });

  it("only emits label/pin when explicitly provided", () => {
    const next = mergePlacementsIntoFrontmatter(
      { atlas: {} },
      [
        { entityId: "a", mapId: "overview", x: 0, y: 0 },
        { entityId: "a", mapId: "city", x: 0, y: 0, label: "Custom", pin: { color: "red" } },
      ],
    );
    const placements = (next.atlas as { placements: Array<Record<string, unknown>> }).placements;
    // Placements are sorted alphabetically by mapId; locate by mapId rather than position.
    const city = placements.find((p) => p.mapId === "city")!;
    const overview = placements.find((p) => p.mapId === "overview")!;
    expect(overview).not.toHaveProperty("label");
    expect(overview).not.toHaveProperty("pin");
    expect(city).toMatchObject({ label: "Custom", pin: { color: "red" } });
  });
});

describe("buildCanonicalPlacementChanges round-trip", () => {
  it("returns empty on empty drafts without fetching", async () => {
    const fetchFn = vi.fn();
    const changes = await buildCanonicalPlacementChanges([], new Map(), {
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    expect(changes).toEqual([]);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("throws CanonicalSaveError when entity has no sourcePath", async () => {
    const fetchFn = vi.fn();
    const ent = makeEntity({ sourcePath: "" });
    await expect(
      buildCanonicalPlacementChanges(
        [{ entityId: ent.id, mapId: "overview", x: 1, y: 2 }],
        new Map([[ent.id, ent]]),
        { fetchFn: fetchFn as unknown as typeof fetch },
      ),
    ).rejects.toBeInstanceOf(CanonicalSaveError);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("throws CanonicalSaveError when entity is unknown", async () => {
    const fetchFn = vi.fn();
    await expect(
      buildCanonicalPlacementChanges(
        [{ entityId: "ghost", mapId: "overview", x: 1, y: 2 }],
        new Map(),
        { fetchFn: fetchFn as unknown as typeof fetch },
      ),
    ).rejects.toBeInstanceOf(CanonicalSaveError);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("rejects /__atlas/read responses for disallowed paths before fetching", async () => {
    const fetchFn = vi.fn();
    const ent = makeEntity({ sourcePath: "src/App.tsx" });
    await expect(
      buildCanonicalPlacementChanges(
        [{ entityId: ent.id, mapId: "overview", x: 1, y: 2 }],
        new Map([[ent.id, ent]]),
        { fetchFn: fetchFn as unknown as typeof fetch },
      ),
    ).rejects.toBeInstanceOf(CanonicalSaveError);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("reads current .md, merges placements, and returns FileChange for each entity", async () => {
    const original = matter.stringify("Body text with [[wikilink]] left alone.\n", {
      title: "Thornhold",
      tags: ["city"],
      atlas: {
        type: "settlement",
        visibility: "player",
        aliases: ["Thorn Hold"],
        x: 999,
        y: 999,
      },
    });
    const ent = makeEntity();
    const fetchFn = vi.fn(async (url: string) => {
      expect(url).toBe(
        `/__atlas/read?path=${encodeURIComponent(ent.sourcePath)}`,
      );
      return jsonResponse(200, { path: ent.sourcePath, contents: original });
    });

    const changes = await buildCanonicalPlacementChanges(
      [{ entityId: ent.id, mapId: "overview", x: 100, y: 200 }],
      new Map([[ent.id, ent]]),
      { fetchFn: fetchFn as unknown as typeof fetch },
    );

    expect(changes).toHaveLength(1);
    expect(changes[0].path).toBe(ent.sourcePath);

    const parsed = matter(changes[0].contents);
    expect(parsed.content).toBe("Body text with [[wikilink]] left alone.\n");
    expect(parsed.data.title).toBe("Thornhold");
    expect(parsed.data.tags).toEqual(["city"]);
    const atlas = parsed.data.atlas as Record<string, unknown>;
    expect(atlas.type).toBe("settlement");
    expect(atlas.visibility).toBe("player");
    expect(atlas.aliases).toEqual(["Thorn Hold"]);
    // Legacy x/y removed.
    expect(atlas.x).toBeUndefined();
    expect(atlas.y).toBeUndefined();
    // New placement present.
    expect(atlas.placements).toEqual([
      { mapId: "overview", x: 100, y: 200 },
    ]);
  });

  it("groups drafts for the same entity into a single .md write", async () => {
    const original = matter.stringify("Body.\n", { atlas: {} });
    const ent = makeEntity();
    const fetchFn = vi.fn(async () => jsonResponse(200, { contents: original }));
    const changes = await buildCanonicalPlacementChanges(
      [
        { entityId: ent.id, mapId: "overview", x: 1, y: 1 },
        { entityId: ent.id, mapId: "city", x: 2, y: 2 },
      ],
      new Map([[ent.id, ent]]),
      { fetchFn: fetchFn as unknown as typeof fetch },
    );
    expect(changes).toHaveLength(1);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const atlas = (matter(changes[0].contents).data.atlas) as Record<string, unknown>;
    const placements = atlas.placements as Array<{ mapId: string }>;
    expect(placements.map((p) => p.mapId).sort()).toEqual(["city", "overview"]);
  });

  it("surfaces a typed error when /__atlas/read returns 404", async () => {
    const fetchFn = vi.fn(async () => jsonResponse(404, { error: "NotFound" }));
    const ent = makeEntity();
    await expect(
      buildCanonicalPlacementChanges(
        [{ entityId: ent.id, mapId: "overview", x: 1, y: 2 }],
        new Map([[ent.id, ent]]),
        { fetchFn: fetchFn as unknown as typeof fetch },
      ),
    ).rejects.toBeInstanceOf(CanonicalSaveError);
  });
});
