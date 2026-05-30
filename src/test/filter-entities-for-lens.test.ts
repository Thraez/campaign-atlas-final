import { describe, it, expect } from "vitest";
import { filterEntitiesForLens } from "@/atlas/view/filterEntitiesForLens";
import type { Entity } from "@/atlas/content/schema";
import type { ViewMode } from "@/atlas/view/ViewModeProvider";

function ent(visibility: Entity["visibility"]): Entity {
  return { id: "x", title: "X", type: "note", visibility, aliases: [], tags: [], images: [], body: "", bodyHtml: "", frontmatter: {}, sourcePath: "", links: [], backlinks: [] } as Entity;
}

// ---------------------------------------------------------------------------
// filterEntitiesForLens
// ---------------------------------------------------------------------------

describe("filterEntitiesForLens", () => {
  it("dm mode returns all entities unchanged", () => {
    const entities = [ent("player"), ent("dm"), ent("hidden"), ent("rumor")];
    expect(filterEntitiesForLens(entities, "dm")).toHaveLength(4);
  });

  it("dm mode returns the same array reference", () => {
    const entities = [ent("player"), ent("dm")];
    expect(filterEntitiesForLens(entities, "dm")).toBe(entities);
  });

  it("player mode keeps 'player' visibility entities", () => {
    const e = ent("player");
    const result = filterEntitiesForLens([e], "player");
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(e);
  });

  it("player mode keeps 'rumor' visibility entities", () => {
    const e = ent("rumor");
    const result = filterEntitiesForLens([e], "player");
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(e);
  });

  it("player mode filters out 'dm' visibility entities", () => {
    expect(filterEntitiesForLens([ent("dm")], "player")).toHaveLength(0);
  });

  it("player mode filters out 'hidden' visibility entities", () => {
    expect(filterEntitiesForLens([ent("hidden")], "player")).toHaveLength(0);
  });

  it("player mode correctly partitions a mixed list", () => {
    const visible = [ent("player"), ent("rumor")];
    const hidden = [ent("dm"), ent("hidden")];
    const result = filterEntitiesForLens([...visible, ...hidden], "player");
    expect(result).toHaveLength(2);
    expect(result).toEqual(visible);
  });

  it("returns an empty array when input is empty, regardless of mode", () => {
    const dm: ViewMode = "dm";
    const player: ViewMode = "player";
    expect(filterEntitiesForLens([], dm)).toHaveLength(0);
    expect(filterEntitiesForLens([], player)).toHaveLength(0);
  });
});
