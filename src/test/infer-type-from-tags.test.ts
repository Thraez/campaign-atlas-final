import { describe, expect, it } from "vitest";
import { inferTypeFromTags } from "@/atlas/import/inferTypeFromTags";

describe("inferTypeFromTags", () => {
  describe("non-array inputs return null", () => {
    it("returns null for null", () => {
      expect(inferTypeFromTags(null)).toBeNull();
    });
    it("returns null for undefined", () => {
      expect(inferTypeFromTags(undefined)).toBeNull();
    });
    it("returns null for a plain string", () => {
      expect(inferTypeFromTags("npc")).toBeNull();
    });
    it("returns null for a number", () => {
      expect(inferTypeFromTags(42)).toBeNull();
    });
    it("returns null for an object", () => {
      expect(inferTypeFromTags({ npc: true })).toBeNull();
    });
  });

  describe("empty / no-match arrays", () => {
    it("returns null for an empty array", () => {
      expect(inferTypeFromTags([])).toBeNull();
    });
    it("returns null for array of non-string items", () => {
      expect(inferTypeFromTags([null, 42, true, {}])).toBeNull();
    });
    it("returns null for unrecognized tags", () => {
      expect(inferTypeFromTags(["goblin", "monster", "undead"])).toBeNull();
    });
  });

  describe("npc synonyms", () => {
    it.each(["npc", "character", "person"])('"%s" → "npc"', (tag) => {
      expect(inferTypeFromTags([tag])).toBe("npc");
    });
  });

  describe("faction synonyms", () => {
    it.each(["faction", "guild", "organization", "organisation"])('"%s" → "faction"', (tag) => {
      expect(inferTypeFromTags([tag])).toBe("faction");
    });
  });

  describe("item synonyms", () => {
    it.each(["item", "artifact", "weapon", "armor", "armour"])('"%s" → "item"', (tag) => {
      expect(inferTypeFromTags([tag])).toBe("item");
    });
  });

  describe("single-keyword types", () => {
    it.each([
      ["event", "event"],
      ["lore", "lore"],
      ["settlement", "settlement"],
      ["city", "city"],
      ["town", "town"],
      ["village", "village"],
      ["capital", "capital"],
      ["port", "port"],
      ["region", "region"],
      ["ruin", "ruin"],
      ["dungeon", "dungeon"],
      ["cave", "cave"],
      ["temple", "temple"],
      ["shop", "shop"],
      ["hazard", "hazard"],
      ["landmark", "location"],
      ["location", "location"],
    ])('"%s" → "%s"', (tag, expected) => {
      expect(inferTypeFromTags([tag])).toBe(expected);
    });
  });

  describe("case-insensitive matching", () => {
    it('uppercase "NPC" matches → "npc"', () => {
      expect(inferTypeFromTags(["NPC"])).toBe("npc");
    });
    it('mixed-case "Character" matches → "npc"', () => {
      expect(inferTypeFromTags(["Character"])).toBe("npc");
    });
    it('uppercase "FACTION" matches → "faction"', () => {
      expect(inferTypeFromTags(["FACTION"])).toBe("faction");
    });
  });

  describe("whitespace trimming", () => {
    it('leading+trailing spaces trimmed: "  npc  " matches → "npc"', () => {
      expect(inferTypeFromTags(["  npc  "])).toBe("npc");
    });
    it('tab-padded tag "\\tnpc\\t" matches → "npc"', () => {
      expect(inferTypeFromTags(["\tnpc\t"])).toBe("npc");
    });
  });

  describe("first recognized tag wins", () => {
    it("returns type of first recognized tag when multiple match", () => {
      expect(inferTypeFromTags(["npc", "faction"])).toBe("npc");
    });
    it("skips unrecognized tags before finding recognized one", () => {
      expect(inferTypeFromTags(["goblin", "unknown", "dungeon"])).toBe("dungeon");
    });
    it("skips non-string items then finds string", () => {
      expect(inferTypeFromTags([null, 99, "item"])).toBe("item");
    });
  });
});
