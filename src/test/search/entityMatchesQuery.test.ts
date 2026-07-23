import { describe, expect, it } from "vitest";
import { entityMatchesQuery } from "@/atlas/search/entityMatchesQuery";
import type { Entity } from "@/atlas/content/schema";

function makeEntity(overrides: Partial<Entity> = {}): Entity {
  return {
    id: "test",
    title: "Test Entity",
    type: "npc",
    visibility: "player",
    aliases: [],
    tags: [],
    summary: undefined,
    images: [],
    body: "",
    bodyHtml: "",
    frontmatter: {},
    sourcePath: "test.md",
    links: [],
    backlinks: [],
    ...overrides,
  };
}

describe("entityMatchesQuery", () => {
  it("matches when query is empty", () => {
    expect(entityMatchesQuery(makeEntity(), "")).toBe(true);
    expect(entityMatchesQuery(makeEntity(), "   ")).toBe(true);
  });

  it("matches title (case-insensitive)", () => {
    const e = makeEntity({ title: "The Dragon Queen" });
    expect(entityMatchesQuery(e, "dragon")).toBe(true);
    expect(entityMatchesQuery(e, "DRAGON")).toBe(true);
    expect(entityMatchesQuery(e, "Dragon Queen")).toBe(true);
    expect(entityMatchesQuery(e, "wizard")).toBe(false);
  });

  it("matches aliases (case-insensitive)", () => {
    const e = makeEntity({ aliases: ["The Red Witch", "Scarlet Mage"] });
    expect(entityMatchesQuery(e, "red witch")).toBe(true);
    expect(entityMatchesQuery(e, "SCARLET")).toBe(true);
    expect(entityMatchesQuery(e, "blue")).toBe(false);
  });

  it("matches summary (case-insensitive)", () => {
    const e = makeEntity({ summary: "A cunning merchant from the south." });
    expect(entityMatchesQuery(e, "merchant")).toBe(true);
    expect(entityMatchesQuery(e, "SOUTH")).toBe(true);
    expect(entityMatchesQuery(e, "wizard")).toBe(false);
  });

  it("matches tags (case-insensitive)", () => {
    const e = makeEntity({ tags: ["villain", "undead"] });
    expect(entityMatchesQuery(e, "undead")).toBe(true);
    expect(entityMatchesQuery(e, "VILLAIN")).toBe(true);
    expect(entityMatchesQuery(e, "hero")).toBe(false);
  });

  it("returns false when no field matches", () => {
    const e = makeEntity({
      title: "Lord Ashford",
      aliases: ["The Baron"],
      summary: "A noble of the realm.",
      tags: ["noble", "human"],
    });
    expect(entityMatchesQuery(e, "goblin")).toBe(false);
  });

  it("handles undefined summary gracefully without crashing", () => {
    const e = makeEntity({ summary: undefined });
    expect(entityMatchesQuery(e, "xyzzy-no-match")).toBe(false);
    expect(entityMatchesQuery(e, "test")).toBe(true); // still matches title "Test Entity"
  });

  it("trims whitespace from query before matching", () => {
    const e = makeEntity({ title: "Harbor Town" });
    expect(entityMatchesQuery(e, "  harbor  ")).toBe(true);
  });
});
