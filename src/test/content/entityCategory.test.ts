// src/test/content/entityCategory.test.ts
import { describe, it, expect } from "vitest";
import {
  categoryForType,
  CATEGORIES,
  type CategoryId,
} from "@/atlas/content/entityCategory";

describe("entityCategory", () => {
  it("exposes exactly the six categories in order", () => {
    expect(CATEGORIES.map((c) => c.id)).toEqual([
      "characters", "locations", "factions", "events", "items", "lore",
    ]);
  });

  it("maps every known pin-preset type to a single category", () => {
    const expected: Record<string, CategoryId> = {
      npc: "characters", character: "characters", person: "characters",
      settlement: "locations", capital: "locations", city: "locations",
      town: "locations", village: "locations", port: "locations",
      region: "locations", ruin: "locations", dungeon: "locations",
      cave: "locations", temple: "locations", divine_site: "locations",
      shop: "locations", black_market: "locations", hazard: "locations",
      wilderness_landmark: "locations", mystery: "locations",
      resonance_site: "locations", player_base: "locations",
      faction: "factions", event: "events", item: "items",
    };
    for (const [type, cat] of Object.entries(expected)) {
      expect(categoryForType(type)).toBe(cat);
    }
  });

  it("is total: unknown and empty types fall back to lore (nothing unreachable)", () => {
    expect(categoryForType("")).toBe("lore");
    expect(categoryForType(undefined)).toBe("lore");
    expect(categoryForType("totally-made-up")).toBe("lore");
    expect(categoryForType("LORE")).toBe("lore");
  });
});
