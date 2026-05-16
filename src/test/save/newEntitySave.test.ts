// src/test/save/newEntitySave.test.ts
import { describe, it, expect } from "vitest";
import { buildNewEntityChange } from "@/atlas/save/newEntitySave";
import { parseFrontmatter } from "@/atlas/import/frontmatter";

describe("buildNewEntityChange", () => {
  it("creates a slugged .md in the category folder with baseHash null", () => {
    const change = buildNewEntityChange({
      worldRoot: "content/astrath-deeprealm",
      category: "characters",
      title: "Captain Mire Vale",
      summary: "Harbor-master with a debt.",
      visibility: "dm",
      kind: "npc",
    });
    expect(change.kind).toBe("entity-md");
    expect(change.baseHash).toBeNull();              // create-only
    expect(change.path).toBe(
      "content/astrath-deeprealm/npcs/captain-mire-vale.md",
    );
    const fm = parseFrontmatter(change.content);
    // title stays at root; atlas: block carries id, type, visibility, summary
    expect(fm.data.title).toBe("Captain Mire Vale");
    const atlas = fm.data.atlas as Record<string, unknown>;
    expect(atlas.id).toBe("captain-mire-vale");
    expect(atlas.type).toBe("npc");
    expect(atlas.visibility).toBe("dm");
    expect(atlas.summary).toBe("Harbor-master with a debt.");
    expect(fm.content.trim()).toContain("# Captain Mire Vale");
  });

  it("defaults kind from category when kind is omitted", () => {
    const change = buildNewEntityChange({
      worldRoot: "content/w", category: "factions",
      title: "The Tide Court", visibility: "player",
    });
    const atlas = parseFrontmatter(change.content).data.atlas as Record<string, unknown>;
    expect(atlas.type).toBe("faction");
    expect(atlas.id).toBe("the-tide-court");
    expect(change.path).toBe("content/w/factions/the-tide-court.md");
  });
});
