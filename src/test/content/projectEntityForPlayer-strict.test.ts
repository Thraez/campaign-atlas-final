// @vitest-environment node
/**
 * code-retro 08: the build now uses projectEntityForPlayer as its one player
 * projection. Where the old build copy (`buildEntity`) and this module
 * disagreed, the stricter side won; these tests pin each of those choices.
 */
import { describe, it, expect } from "vitest";
import {
  projectEntityForPlayer,
  buildProjectionContext,
} from "@/atlas/content/projectEntityForPlayer";
import type { Entity } from "@/atlas/content/schema";

function ent(p: Partial<Entity> & { id: string; title: string }): Entity {
  return {
    id: p.id,
    title: p.title,
    type: p.type ?? "npc",
    visibility: p.visibility ?? "player",
    aliases: p.aliases ?? [],
    tags: p.tags ?? [],
    images: [],
    body: p.body ?? "",
    bodyHtml: "",
    frontmatter: {},
    sourcePath: "x.md",
    links: [],
    backlinks: [],
    relationships: p.relationships,
    dateLabel: p.dateLabel,
  } as Entity;
}

describe("projectEntityForPlayer, stricter-side merges (code-retro 08)", () => {
  it("strips %% blocks from dateLabel", () => {
    const e = ent({ id: "a", title: "A", dateLabel: "%%the night of the coup%% 1204" });
    const p = projectEntityForPlayer(e, buildProjectionContext(new Map([[e.id, e]])));
    expect(p.dateLabel).toBe("1204");
  });

  it("drops a relationship label that is entirely DM content instead of shipping it raw", () => {
    const b = ent({ id: "b", title: "B" });
    const e = ent({
      id: "a",
      title: "A",
      relationships: [
        { type: "ally", entity: "b", label: "%%secret backer%%", visibility: "player" },
      ] as Entity["relationships"],
    });
    const p = projectEntityForPlayer(e, buildProjectionContext(new Map([[e.id, e], [b.id, b]])));
    expect(p.relationships?.[0].label ?? "").not.toContain("secret backer");
    expect(p.relationships?.[0].label ?? "").not.toContain("%%");
  });

  it("does not mutate the input entity's relationships", () => {
    const b = ent({ id: "b", title: "B" });
    const e = ent({
      id: "a",
      title: "A",
      relationships: [
        { type: "ally", entity: "b", label: "%%x%% friend", visibility: "player" },
      ] as Entity["relationships"],
    });
    projectEntityForPlayer(e, buildProjectionContext(new Map([[e.id, e], [b.id, b]])));
    expect(e.relationships?.[0].label).toBe("%%x%% friend");
  });

  it("removes {{secret:id}} markers from the shipped body", () => {
    const e = ent({ id: "a", title: "A", body: "Lore {{secret:signet}} more." });
    const p = projectEntityForPlayer(e, buildProjectionContext(new Map([[e.id, e]])));
    expect(p.body).not.toContain("{{secret:");
  });

  it("redacts a link to a hidden note spelled with underscores (loose name match)", () => {
    const hidden = ent({ id: "khal-azum", title: "Khal Azum", visibility: "dm" });
    const e = ent({ id: "a", title: "A", body: "Beware [[Khal_Azum]]." });
    const p = projectEntityForPlayer(
      e,
      buildProjectionContext(new Map([[e.id, e], [hidden.id, hidden]])),
    );
    expect(p.body).not.toContain("Khal");
    expect(p.bodyHtml).not.toContain("Khal");
  });
});
