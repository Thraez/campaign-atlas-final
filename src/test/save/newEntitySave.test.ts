// src/test/save/newEntitySave.test.ts
import { describe, it, expect } from "vitest";
import { buildNewEntityChange, slugify } from "@/atlas/save/newEntitySave";
import { parseFrontmatter } from "@/atlas/import/frontmatter";

describe("slugify", () => {
  it("strips leading and trailing non-alphanumeric characters", () => {
    expect(slugify("!Hello World!")).toBe("hello-world");
  });

  it("converts apostrophe to a dash separator between surrounding letters", () => {
    expect(slugify("Dragon's Lair")).toBe("dragon-s-lair");
  });

  it("collapses multiple non-alphanumeric characters into a single dash", () => {
    // "&" surrounded by spaces → three consecutive non-alphanumeric chars collapse to one "-"
    expect(slugify("The Hilt & Flagon")).toBe("the-hilt-flagon");
  });
});

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

  it("omits summary from atlas block when summary is not provided", () => {
    const change = buildNewEntityChange({
      worldRoot: "content/w", category: "characters",
      title: "Unnamed Scout", visibility: "dm",
    });
    const atlas = parseFrontmatter(change.content).data.atlas as Record<string, unknown>;
    expect(Object.prototype.hasOwnProperty.call(atlas, "summary")).toBe(false);
  });

  it("uses folder 'settlements' and type 'settlement' for locations category", () => {
    const change = buildNewEntityChange({
      worldRoot: "content/w", category: "locations",
      title: "Iron Gate", visibility: "player",
    });
    expect(change.path).toBe("content/w/settlements/iron-gate.md");
    const atlas = parseFrontmatter(change.content).data.atlas as Record<string, unknown>;
    expect(atlas.type).toBe("settlement");
  });

  it("trims whitespace from kind before writing atlas.type", () => {
    const change = buildNewEntityChange({
      worldRoot: "content/w", category: "characters",
      title: "Scout", visibility: "dm", kind: "  ranger  ",
    });
    const atlas = parseFrontmatter(change.content).data.atlas as Record<string, unknown>;
    expect(atlas.type).toBe("ranger");
  });

  it("persists visibility 'rumor' in the atlas block", () => {
    const change = buildNewEntityChange({
      worldRoot: "content/w", category: "lore",
      title: "Hidden Pact", visibility: "rumor",
    });
    const atlas = parseFrontmatter(change.content).data.atlas as Record<string, unknown>;
    expect(atlas.visibility).toBe("rumor");
    expect(change.path).toBe("content/w/lore/hidden-pact.md");
  });
});
