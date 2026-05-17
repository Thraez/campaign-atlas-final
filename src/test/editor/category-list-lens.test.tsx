import { describe, it, expect } from "vitest";
import { filterEntitiesForLens } from "@/atlas/view/filterEntitiesForLens";
import type { Entity } from "@/atlas/content/schema";

const mk = (id: string, visibility: Entity["visibility"]) =>
  ({ id, title: id, type: "npc", visibility, aliases: [], tags: [], images: [],
     body: "", bodyHtml: "", frontmatter: {}, sourcePath: "", links: [], backlinks: [] } as Entity);

describe("filterEntitiesForLens", () => {
  const all = [mk("a", "player"), mk("b", "rumor"), mk("c", "dm"), mk("d", "hidden")];
  it("player lens hides dm/hidden", () => {
    expect(filterEntitiesForLens(all, "player").map((e) => e.id)).toEqual(["a", "b"]);
  });
  it("dm lens shows all", () => {
    expect(filterEntitiesForLens(all, "dm").map((e) => e.id)).toEqual(["a", "b", "c", "d"]);
  });
});
