import { describe, it, expect } from "vitest";
import {
  stripDmProfile,
  filterRelationshipsForPlayer,
  compactProfile,
} from "@/atlas/profiles/profileBuild";
import { dmFieldsForType } from "@/atlas/profiles/profileFields";
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
    const r: EntityRelationship = { entity: "thornhold", type: "trades_with", visibility: "player" };
    const out = filterRelationshipsForPlayer([r], { entityVisibility: vis });
    expect(out.kept).toHaveLength(1);
    expect(out.droppedByLeak).toHaveLength(0);
  });

  it("flags player→DM relationships as spoiler leaks (does not ship them)", () => {
    const r: EntityRelationship = { entity: "deeproot", type: "secretly_funds", visibility: "player" };
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
    const r: EntityRelationship = { entity: "thornhold", type: "rumored_ally", visibility: "rumor" };
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
    const r: EntityRelationship = { entity: "deeproot", type: "secretly_funds", visibility: "rumor" };
    const out = filterRelationshipsForPlayer([r], { entityVisibility: vis });
    expect(out.kept).toHaveLength(0);
    expect(out.droppedByLeak).toEqual([r]);
  });

  it("treats a rumor relationship pointing at a hidden entity as a spoiler leak", () => {
    const r: EntityRelationship = { entity: "river-cult", type: "knows_secret_of", visibility: "rumor" };
    const out = filterRelationshipsForPlayer([r], { entityVisibility: vis });
    expect(out.kept).toHaveLength(0);
    expect(out.droppedByLeak).toEqual([r]);
  });
});

describe("dm field labels per type", () => {
  it("npc has wants/secret", () => {
    const keys = dmFieldsForType("npc").map((f) => f.key);
    expect(keys).toContain("wants");
    expect(keys).toContain("secret");
  });
  it("faction has goal/forbidden_line", () => {
    const keys = dmFieldsForType("faction").map((f) => f.key);
    expect(keys).toContain("goal");
    expect(keys).toContain("forbidden_line");
  });
  it("settlement has hidden_pressure", () => {
    expect(dmFieldsForType("settlement").map((f) => f.key)).toContain("hidden_pressure");
  });
  it("region has travel_mood", () => {
    expect(dmFieldsForType("region").map((f) => f.key)).toContain("travel_mood");
  });
  it("aliases (city → settlement) work", () => {
    expect(dmFieldsForType("city").map((f) => f.key)).toContain("will_not_tolerate");
  });
  it("unknown types fall back to npc shape", () => {
    expect(dmFieldsForType("mystery_thing").map((f) => f.key)).toContain("wants");
  });
});
