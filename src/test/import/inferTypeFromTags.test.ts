import { describe, it, expect } from "vitest";
import { inferTypeFromTags } from "@/atlas/import/inferTypeFromTags";

describe("inferTypeFromTags", () => {
  it("maps npc-ish tags to npc (first recognised tag wins)", () => {
    expect(inferTypeFromTags(["npc", "smuggler", "legend"])).toBe("npc");
    expect(inferTypeFromTags(["character"])).toBe("npc");
    expect(inferTypeFromTags(["person"])).toBe("npc");
  });
  it("maps faction / item / event keywords", () => {
    expect(inferTypeFromTags(["guild"])).toBe("faction");
    expect(inferTypeFromTags(["artifact"])).toBe("item");
    expect(inferTypeFromTags(["event"])).toBe("event");
  });
  it("maps place keywords to the matching place type", () => {
    expect(inferTypeFromTags(["ruin"])).toBe("ruin");
    expect(inferTypeFromTags(["city"])).toBe("city");
    expect(inferTypeFromTags(["landmark"])).toBe("location");
  });
  it("returns null when no tag is recognised or input is not a string array", () => {
    expect(inferTypeFromTags(["mysterious", "stub"])).toBeNull();
    expect(inferTypeFromTags(undefined)).toBeNull();
    expect(inferTypeFromTags("npc")).toBeNull();
    expect(inferTypeFromTags([1, 2])).toBeNull();
  });
});
