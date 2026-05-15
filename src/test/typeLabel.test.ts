import { describe, it, expect } from "vitest";
import { playerTypeLabel } from "../atlas/content/typeLabel";

describe("playerTypeLabel", () => {
  it("translates jargon types to player-friendly labels", () => {
    expect(playerTypeLabel("npc")).toBe("Person");
    expect(playerTypeLabel("person")).toBe("Person");
  });

  it("returns empty string for hidden types so the caller can suppress the element", () => {
    expect(playerTypeLabel("note")).toBe("");
  });

  it("capitalizes unknown types so DMs adding custom types get sensible output", () => {
    expect(playerTypeLabel("region")).toBe("Region");
    expect(playerTypeLabel("settlement")).toBe("Settlement");
    expect(playerTypeLabel("deity")).toBe("Deity");
    expect(playerTypeLabel("MONSTER")).toBe("Monster");
  });

  it("handles undefined / empty input safely", () => {
    expect(playerTypeLabel(undefined)).toBe("");
    expect(playerTypeLabel("")).toBe("");
  });

  it("is case-insensitive for jargon lookup", () => {
    expect(playerTypeLabel("NPC")).toBe("Person");
    expect(playerTypeLabel("Npc")).toBe("Person");
  });
});
