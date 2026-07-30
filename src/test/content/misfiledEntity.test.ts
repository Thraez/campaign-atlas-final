import { describe, it, expect } from "vitest";
import type { Entity } from "@/atlas/content/schema";
import {
  suggestFiling,
  findMisfiled,
  misfiledForCategory,
} from "@/atlas/content/misfiledEntity";

function ent(over: Partial<Entity> & { id: string }): Entity {
  return {
    title: over.id,
    type: "",
    visibility: "player",
    aliases: [],
    tags: [],
    images: [],
    body: "",
    bodyHtml: "",
    frontmatter: {},
    sourcePath: `content/w/${over.id}.md`,
    links: [],
    backlinks: [],
    ...over,
  } as Entity;
}

describe("suggestFiling", () => {
  it("suggests Characters for a typeless note tagged #npc", () => {
    const s = suggestFiling(ent({ id: "corven", type: "note", tags: ["smuggler", "npc"] }));
    expect(s).not.toBeNull();
    expect(s!.category).toBe("characters");
    expect(s!.suggestedType).toBe("npc");
  });

  it("leaves an explicitly typed entity alone", () => {
    // The DM chose "event" — a stray #npc tag must not override canon.
    expect(suggestFiling(ent({ id: "fall", type: "event", tags: ["npc"] }))).toBeNull();
  });

  it("returns null when no tag names a known type", () => {
    expect(
      suggestFiling(ent({ id: "soreth", type: "note", tags: ["vein-marked", "rumor"] })),
    ).toBeNull();
  });

  it("returns null for a typeless note with no tags at all", () => {
    expect(suggestFiling(ent({ id: "blank", type: "note", tags: [] }))).toBeNull();
    expect(suggestFiling(ent({ id: "notype", tags: [] }))).toBeNull();
  });

  it("ignores a tag that points back at the category the entity already sits in", () => {
    // Typeless entities already resolve to "lore"; a #lore tag adds nothing.
    expect(suggestFiling(ent({ id: "hum", type: "note", tags: ["lore"] }))).toBeNull();
  });

  it("is case- and whitespace-insensitive on tags", () => {
    const s = suggestFiling(ent({ id: "edric", type: "note", tags: ["  NPC  "] }));
    expect(s!.category).toBe("characters");
    expect(s!.suggestedType).toBe("npc");
  });

  it("takes the first type-shaped tag when several compete", () => {
    const s = suggestFiling(ent({ id: "x", type: "note", tags: ["faction", "npc"] }));
    expect(s!.category).toBe("factions");
  });

  it("suggests Locations from a place-shaped tag", () => {
    const s = suggestFiling(ent({ id: "gate", type: "note", tags: ["settlement"] }));
    expect(s!.category).toBe("locations");
    expect(s!.suggestedType).toBe("settlement");
  });
});

describe("findMisfiled / misfiledForCategory", () => {
  const entities = [
    ent({ id: "corven", type: "note", tags: ["npc"] }),
    ent({ id: "edric", type: "note", tags: ["npc"] }),
    ent({ id: "soreth", type: "note", tags: [] }),
    ent({ id: "fall", type: "event", tags: [] }),
    ent({ id: "gate", type: "note", tags: ["ruin"] }),
  ];

  it("finds only the entities with a usable hint, in input order", () => {
    expect(findMisfiled(entities).map((m) => m.entity.id)).toEqual(["corven", "edric", "gate"]);
  });

  it("filters to one category", () => {
    expect(misfiledForCategory(entities, "characters").map((m) => m.entity.id)).toEqual([
      "corven",
      "edric",
    ]);
    expect(misfiledForCategory(entities, "locations").map((m) => m.entity.id)).toEqual(["gate"]);
    expect(misfiledForCategory(entities, "items")).toEqual([]);
  });

  it("returns nothing for an empty world", () => {
    expect(findMisfiled([])).toEqual([]);
  });
});
