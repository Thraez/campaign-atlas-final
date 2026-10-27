import { describe, it, expect } from "vitest";
import {
  stripDmProfile,
  filterRelationshipsForPlayer,
  compactProfile,
  isEmptyDmProfile,
  compactDmProfile,
  compactPlayerProfile,
} from "@/atlas/profiles/profileBuild";
import type { EntityRelationship } from "@/atlas/profiles/profileTypes";
import type { EntityVisibility } from "@/atlas/content/schema";

describe("profile DM strip", () => {
  it("drops dm half but keeps player half", () => {
    const stripped = stripDmProfile({
      player: { known_for: "ferries travelers", rumors: ["knows the shrine"] },
      dm: { wants: "save daughter", secret: "ferried cultists" },
    });
    expect(stripped?.player?.known_for).toBe("ferries travelers");
    expect((stripped as { dm?: unknown })?.dm).toBeUndefined();
  });

  it("compactProfile drops empty halves", () => {
    expect(compactProfile({ player: { known_for: "  " }, dm: { wants: "" } })).toBeUndefined();
    expect(compactProfile({ player: { known_for: "ok" } })?.player?.known_for).toBe("ok");
  });
});

describe("relationship player filter", () => {
  const vis: Map<string, EntityVisibility> = new Map([
    ["thornhold", "player"],
    ["deeproot", "dm"],
    ["river-cult", "hidden"],
  ]);

  it("keeps player→player relationships", () => {
    const r: EntityRelationship = {
      entity: "thornhold",
      type: "trades_with",
      visibility: "player",
    };
    const out = filterRelationshipsForPlayer([r], { entityVisibility: vis });
    expect(out.kept).toHaveLength(1);
    expect(out.droppedByLeak).toHaveLength(0);
  });

  it("flags player→DM relationships as spoiler leaks (does not ship them)", () => {
    const r: EntityRelationship = {
      entity: "deeproot",
      type: "secretly_funds",
      visibility: "player",
    };
    const out = filterRelationshipsForPlayer([r], { entityVisibility: vis });
    expect(out.kept).toHaveLength(0);
    expect(out.droppedByLeak).toHaveLength(1);
  });

  it("drops dm-visibility relationships quietly (not a leak, just hidden)", () => {
    const r: EntityRelationship = { entity: "thornhold", type: "trades_with", visibility: "dm" };
    const out = filterRelationshipsForPlayer([r], { entityVisibility: vis });
    expect(out.kept).toHaveLength(0);
    expect(out.droppedByVisibility).toHaveLength(1);
    expect(out.droppedByLeak).toHaveLength(0);
  });

  it("flags unresolved entity ids", () => {
    const r: EntityRelationship = { entity: "missing-npc", type: "knows", visibility: "player" };
    const out = filterRelationshipsForPlayer([r], { entityVisibility: vis });
    expect(out.unresolved).toHaveLength(1);
  });

  it("counts an unresolved player relationship as a leak too (never shipped)", () => {
    const r: EntityRelationship = { entity: "missing-npc", type: "knows", visibility: "player" };
    const out = filterRelationshipsForPlayer([r], { entityVisibility: vis });
    expect(out.unresolved).toEqual([r]);
    expect(out.droppedByLeak).toEqual([r]);
    expect(out.kept).toHaveLength(0);
  });

  it("keeps a rumor-visibility relationship pointing at a player entity", () => {
    const r: EntityRelationship = {
      entity: "thornhold",
      type: "rumored_ally",
      visibility: "rumor",
    };
    const out = filterRelationshipsForPlayer([r], { entityVisibility: vis });
    expect(out.kept).toEqual([r]);
    expect(out.droppedByLeak).toHaveLength(0);
    expect(out.droppedByVisibility).toHaveLength(0);
  });

  it("keeps a rumor→rumor relationship (rumor entities are player-visible)", () => {
    const localVis = new Map(vis).set("whisper-inn", "rumor");
    const r: EntityRelationship = { entity: "whisper-inn", type: "frequents", visibility: "rumor" };
    const out = filterRelationshipsForPlayer([r], { entityVisibility: localVis });
    expect(out.kept).toEqual([r]);
    expect(out.droppedByLeak).toHaveLength(0);
  });

  it("treats a rumor relationship pointing at a DM entity as a spoiler leak", () => {
    const r: EntityRelationship = {
      entity: "deeproot",
      type: "secretly_funds",
      visibility: "rumor",
    };
    const out = filterRelationshipsForPlayer([r], { entityVisibility: vis });
    expect(out.kept).toHaveLength(0);
    expect(out.droppedByLeak).toEqual([r]);
  });

  it("treats a rumor relationship pointing at a hidden entity as a spoiler leak", () => {
    const r: EntityRelationship = {
      entity: "river-cult",
      type: "knows_secret_of",
      visibility: "rumor",
    };
    const out = filterRelationshipsForPlayer([r], { entityVisibility: vis });
    expect(out.kept).toHaveLength(0);
    expect(out.droppedByLeak).toEqual([r]);
  });
});

describe("stripDmProfile — branch coverage", () => {
  it("returns undefined when profile is undefined", () => {
    expect(stripDmProfile(undefined)).toBeUndefined();
  });
  it("returns undefined when profile has no player half", () => {
    expect(stripDmProfile({ dm: { secret: "hidden agenda" } })).toBeUndefined();
  });
  it("returns the player object when it is empty (isEmptyPlayer=true, but player exists)", () => {
    const out = stripDmProfile({ player: {}, dm: { secret: "hidden" } });
    expect(out).toEqual({ player: {} });
    expect((out as { dm?: unknown })?.dm).toBeUndefined();
  });
});

describe("isEmptyDmProfile", () => {
  it("returns true for undefined", () => {
    expect(isEmptyDmProfile(undefined)).toBe(true);
  });
  it("returns true for an empty object", () => {
    expect(isEmptyDmProfile({})).toBe(true);
  });
  it("returns true when all values are empty or whitespace-only strings", () => {
    expect(isEmptyDmProfile({ wants: "", secret: "   " })).toBe(true);
  });
  it("returns false when any field has non-empty content", () => {
    expect(isEmptyDmProfile({ secret: "hidden truth" })).toBe(false);
  });
});

describe("compactDmProfile — branch coverage", () => {
  it("returns undefined for undefined input", () => {
    expect(compactDmProfile(undefined)).toBeUndefined();
  });
  it("returns undefined when all values are empty or whitespace", () => {
    expect(compactDmProfile({ wants: "", secret: "  " })).toBeUndefined();
  });
  it("keeps non-empty values and trims them, drops empty ones", () => {
    const out = compactDmProfile({ wants: "  gold  ", secret: "" });
    expect(out?.wants).toBe("gold");
    expect(Object.keys(out ?? {}).includes("secret")).toBe(false);
  });
});

describe("compactPlayerProfile — branch coverage", () => {
  it("returns undefined for undefined input", () => {
    expect(compactPlayerProfile(undefined)).toBeUndefined();
  });
  it("returns undefined when all fields are empty or absent", () => {
    expect(compactPlayerProfile({})).toBeUndefined();
    expect(compactPlayerProfile({ known_for: "  " })).toBeUndefined();
  });
  it("trims known_for and keeps it when non-empty", () => {
    expect(compactPlayerProfile({ known_for: "  hero of Thornhold  " })?.known_for).toBe(
      "hero of Thornhold",
    );
  });
  it("filters empty strings from visible_traits, keeps non-empty ones", () => {
    const out = compactPlayerProfile({ visible_traits: ["brave", "", "  "] });
    expect(out?.visible_traits).toEqual(["brave"]);
    expect(out?.known_for).toBeUndefined();
  });
  it("filters empty strings from rumors, keeps non-empty ones", () => {
    const out = compactPlayerProfile({ rumors: ["seen in the catacombs", ""] });
    expect(out?.rumors).toEqual(["seen in the catacombs"]);
  });
});

describe("compactProfile — branch coverage", () => {
  it("returns undefined for undefined input", () => {
    expect(compactProfile(undefined)).toBeUndefined();
  });
  it("keeps only the dm half when player half is absent", () => {
    const out = compactProfile({ dm: { secret: "hidden truth" } });
    expect(out?.dm?.secret).toBe("hidden truth");
    expect(out?.player).toBeUndefined();
  });
  it("keeps only the player half when dm half is absent", () => {
    const out = compactProfile({ player: { rumors: ["seen in catacombs"] } });
    expect(out?.player?.rumors).toEqual(["seen in catacombs"]);
    expect(out?.dm).toBeUndefined();
  });
});
