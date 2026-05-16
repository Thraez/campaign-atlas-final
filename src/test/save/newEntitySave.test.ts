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
    expect(fm.data).toMatchObject({
      title: "Captain Mire Vale",
      type: "npc",
      visibility: "dm",
      summary: "Harbor-master with a debt.",
    });
    expect(fm.content.trim()).toContain("# Captain Mire Vale");
  });

  it("defaults kind from category when kind is omitted", () => {
    const change = buildNewEntityChange({
      worldRoot: "content/w", category: "factions",
      title: "The Tide Court", visibility: "player",
    });
    expect(parseFrontmatter(change.content).data.type).toBe("faction");
    expect(change.path).toBe("content/w/factions/the-tide-court.md");
  });
});
