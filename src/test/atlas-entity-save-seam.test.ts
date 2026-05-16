/**
 * Seam guard: the editor builds the unified Save batch from two independent
 * draft streams — pin placements (Pins tab) and frontmatter edits (Entities
 * tab). When the SAME entity is edited in both, the batch must contain
 * exactly ONE FileChange for that path; the /__atlas/save endpoint rejects
 * a batch with duplicate paths (400 duplicate-path), which would fail the
 * whole save. This test locks that contract.
 */
import { describe, it, expect } from "vitest";
import type { Entity } from "@/atlas/content/schema";
import {
  entityFrontmatterPatches,
  buildCanonicalEntityChanges,
} from "@/atlas/save/canonicalEntitySave";

const hero = {
  id: "hero",
  sourcePath: "content/world/hero.md",
  title: "Hero",
  type: "npc",
  visibility: "dm",
  summary: "Old summary",
  aliases: [],
  images: [],
  profile: {},
  relationships: [],
} as unknown as Entity;

function fetchReturning(md: string): typeof fetch {
  return (async (url: string) => {
    expect(String(url)).toContain("/__atlas/read?path=");
    return {
      ok: true,
      status: 200,
      json: async () => ({ contents: md }),
    };
  }) as unknown as typeof fetch;
}

describe("buildCanonicalEntityChanges — placement + frontmatter seam", () => {
  const entitiesById = new Map<string, Entity>([[hero.id, hero]]);
  const currentMd = "---\natlas:\n  id: hero\n  summary: Old summary\n---\nThe hero body.\n";

  it("an entity edited in BOTH streams yields exactly one FileChange for its path", async () => {
    const frontmatter = entityFrontmatterPatches({ hero: { summary: "New summary" } }, [hero]);
    const changes = await buildCanonicalEntityChanges(
      {
        placements: [{ entityId: "hero", mapId: "m1", x: 10, y: 20 }],
        frontmatter,
      },
      entitiesById,
      { fetchFn: fetchReturning(currentMd) },
    );

    // Exactly one entry — NOT two (which the save endpoint would 400 on).
    expect(changes).toHaveLength(1);
    const onlyPaths = changes.map((c) => c.path);
    expect(new Set(onlyPaths).size).toBe(onlyPaths.length);

    const change = changes[0];
    expect(change.path).toBe("content/world/hero.md");
    expect(change.kind).toBe("entity-md");
    expect(change.baseHash).toMatch(/^sha256:[0-9a-f]{64}$/);
    // Both edits landed in the same serialized document.
    expect(change.content).toContain("New summary"); // frontmatter edit
    expect(change.content).toContain("m1"); // placement merged into atlas.placements
    expect(change.content).toContain("The hero body."); // body preserved
  });

  it("placement-only and frontmatter-only each produce one change", async () => {
    const placementOnly = await buildCanonicalEntityChanges(
      { placements: [{ entityId: "hero", mapId: "m1", x: 1, y: 2 }], frontmatter: [] },
      entitiesById,
      { fetchFn: fetchReturning(currentMd) },
    );
    expect(placementOnly).toHaveLength(1);

    const fmOnly = await buildCanonicalEntityChanges(
      { placements: [], frontmatter: entityFrontmatterPatches({ hero: { summary: "Z" } }, [hero]) },
      entitiesById,
      { fetchFn: fetchReturning(currentMd) },
    );
    expect(fmOnly).toHaveLength(1);
    expect(fmOnly[0].content).toContain("Z");
  });

  it("returns no changes when neither stream has edits", async () => {
    const changes = await buildCanonicalEntityChanges(
      { placements: [], frontmatter: [] },
      entitiesById,
      { fetchFn: fetchReturning(currentMd) },
    );
    expect(changes).toHaveLength(0);
  });
});
