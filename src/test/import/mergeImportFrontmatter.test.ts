import { describe, it, expect } from "vitest";
import {
  resolveEffectiveVisibility,
  detectExposureIncrease,
  resolveType,
  mergeImportFrontmatter,
} from "@/atlas/import/mergeImportFrontmatter";

describe("resolveEffectiveVisibility (mirrors build-atlas.ts:345)", () => {
  it("uses explicit visibility when valid", () => {
    expect(resolveEffectiveVisibility({ visibility: "dm" })).toBe("dm");
    expect(resolveEffectiveVisibility({ visibility: "rumor" })).toBe("rumor");
    expect(resolveEffectiveVisibility({ visibility: "hidden" })).toBe("hidden");
    expect(resolveEffectiveVisibility({ visibility: "player" })).toBe("player");
  });
  it("defaults to player when no visibility and publish !== false", () => {
    expect(resolveEffectiveVisibility({})).toBe("player");
    expect(resolveEffectiveVisibility({ publish: true })).toBe("player");
  });
  it("defaults to dm only when publish === false", () => {
    expect(resolveEffectiveVisibility({ publish: false })).toBe("dm");
  });
  it("ignores an invalid visibility string and falls back", () => {
    expect(resolveEffectiveVisibility({ visibility: "bogus" })).toBe("player");
  });
});

describe("detectExposureIncrease", () => {
  it("flags disk dm + vault wanting player exposure", () => {
    expect(detectExposureIncrease("dm", { visibility: "player" })).toBe(true);
    expect(detectExposureIncrease("dm", { publish: true })).toBe(true);
    expect(detectExposureIncrease("hidden", { visibility: "rumor" })).toBe(true);
  });
  it("does NOT flag when disk is already player-visible", () => {
    expect(detectExposureIncrease("player", { publish: true })).toBe(false);
    expect(detectExposureIncrease("rumor", { visibility: "player" })).toBe(false);
  });
  it("does NOT flag when vault is silent or less exposed", () => {
    expect(detectExposureIncrease("dm", {})).toBe(false);
    expect(detectExposureIncrease("dm", { visibility: "dm" })).toBe(false);
    expect(detectExposureIncrease("dm", { publish: false })).toBe(false);
  });
});

// ── Task 1.2 ──────────────────────────────────────────────────────────────────

describe("resolveType (two-way, base = last-synced vault type)", () => {
  it("no base recorded → vault wins (first sync)", () => {
    expect(resolveType({ diskType: "npc", vaultType: "faction", baseType: undefined }))
      .toEqual({ type: "faction", conflict: false });
  });
  it("vault changed, disk unchanged → vault wins", () => {
    expect(resolveType({ diskType: "npc", vaultType: "faction", baseType: "npc" }))
      .toEqual({ type: "faction", conflict: false });
  });
  it("disk changed, vault unchanged → disk kept", () => {
    expect(resolveType({ diskType: "location", vaultType: "npc", baseType: "npc" }))
      .toEqual({ type: "location", conflict: false });
  });
  it("neither changed → disk (no-op)", () => {
    expect(resolveType({ diskType: "npc", vaultType: "npc", baseType: "npc" }))
      .toEqual({ type: "npc", conflict: false });
  });
  it("both changed → conflict, disk kept unless ticked", () => {
    expect(resolveType({ diskType: "location", vaultType: "faction", baseType: "npc" }))
      .toEqual({ type: "location", conflict: true });
  });
});

// ── Task 1.3 ──────────────────────────────────────────────────────────────────

const fm = (data: Record<string, unknown>, content = "body") => ({ data, content });

describe("mergeImportFrontmatter (disk-base merge)", () => {
  it("preserves atlas-owned keys verbatim incl. unknown + legacy x/y", () => {
    const disk = fm({
      atlas: {
        id: "corven", type: "npc", visibility: "dm",
        placements: [{ mapId: "m1", x: 1, y: 2 }],
        relationships: [{ to: "x" }], profile: { dm: { secret: "A" } },
        x: 9, y: 9,
        fooBar: "keep-me",
      },
    }, "OLD BODY");
    const vault = fm({ atlas: { summary: "new summary" } }, "NEW BODY");
    const r = mergeImportFrontmatter({ disk, vault, inferredType: "npc", baseType: "npc" });
    const a = r.data.atlas as Record<string, unknown>;
    expect(a.placements).toEqual([{ mapId: "m1", x: 1, y: 2 }]);
    expect(a.relationships).toEqual([{ to: "x" }]);
    expect(a.profile).toEqual({ dm: { secret: "A" } });
    expect(a.x).toBe(9); expect(a.y).toBe(9);
    expect(a.fooBar).toBe("keep-me");
    expect(a.id).toBe("corven");
    expect(a.summary).toBe("new summary");
    expect(r.content).toBe("NEW BODY");
  });

  it("always writes an explicit visibility = disk effective (never omitted)", () => {
    const disk = fm({ atlas: { id: "x", publish: false } });
    const vault = fm({ atlas: {} });
    const r = mergeImportFrontmatter({ disk, vault, inferredType: "note", baseType: "note" });
    expect((r.data.atlas as Record<string, unknown>).visibility).toBe("dm");
    expect(r.diskVisibility).toBe("dm");
    expect(r.exposureIncrease).toBe(false);
  });

  it("flags exposure increase but keeps disk visibility in the data", () => {
    const disk = fm({ atlas: { id: "x", visibility: "dm" } });
    const vault = fm({ atlas: { publish: true } });
    const r = mergeImportFrontmatter({ disk, vault, inferredType: "note", baseType: "note" });
    expect(r.exposureIncrease).toBe(true);
    expect((r.data.atlas as Record<string, unknown>).visibility).toBe("dm");
  });

  it("top-level Obsidian props: vault wins (and deletions propagate)", () => {
    const disk = fm({ role: "stale", title: "Old", atlas: { id: "x", visibility: "dm" } });
    const vault = fm({ role: "active", title: "New", atlas: {} });
    const r = mergeImportFrontmatter({ disk, vault, inferredType: "note", baseType: "note" });
    expect(r.data.role).toBe("active");
    expect(r.data.title).toBe("New");
  });

  it("unions tags/aliases and appends the resolved type as a tag", () => {
    const disk = fm({ atlas: { id: "x", visibility: "dm", tags: ["a"], aliases: ["A1"] } });
    const vault = fm({ atlas: { tags: ["b"], aliases: ["A2"] } });
    const r = mergeImportFrontmatter({ disk, vault, inferredType: "npc", baseType: "npc" });
    const a = r.data.atlas as Record<string, unknown>;
    expect(a.tags).toEqual(expect.arrayContaining(["a", "b", "npc"]));
    expect(a.aliases).toEqual(expect.arrayContaining(["A1", "A2"]));
  });

  it("disk has no atlas block — merge still safe (new entity with vault data)", () => {
    const disk = fm({ title: "New Entity" });
    const vault = fm({ atlas: { summary: "intro" } }, "Content here");
    const r = mergeImportFrontmatter({ disk, vault, inferredType: "lore", baseType: undefined });
    const a = r.data.atlas as Record<string, unknown>;
    expect(a.summary).toBe("intro");
    expect(a.visibility).toBe("player"); // no publish:false → defaults player
    expect(r.exposureIncrease).toBe(false); // disk was already player-effective
  });
});
