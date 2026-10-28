import { describe, it, expect } from "vitest";
import {
  detectExposureIncrease,
  resolveType,
  mergeImportFrontmatter,
} from "@/atlas/import/mergeImportFrontmatter";
import { readNote } from "@/atlas/content/readNote";
import { stringifyFrontmatter } from "@/atlas/import/frontmatter";

/** The disk copy as the merge gets it: read with readNote, as the build reads it. */
const diskNote = (data: Record<string, unknown>, content = "body") =>
  readNote(stringifyFrontmatter(content, data), "content/w/npcs/x.md");

describe("merge keeps the disk visibility the build would give it (readNote)", () => {
  const vault = { data: { atlas: {} }, content: "v" };
  const merged = (atlas: Record<string, unknown>) =>
    mergeImportFrontmatter({
      disk: diskNote({ atlas }),
      vault,
      inferredType: "npc",
      baseType: "npc",
    }).diskVisibility;

  it("uses explicit visibility when valid", () => {
    for (const v of ["dm", "rumor", "hidden", "player"]) expect(merged({ visibility: v })).toBe(v);
  });
  it("defaults to dm when no visibility (ADR-0001)", () => {
    expect(merged({})).toBe("dm");
    expect(merged({ publish: false })).toBe("dm");
  });
  it("treats the legacy publish: true as player", () => {
    expect(merged({ publish: true })).toBe("player");
  });
  it("an invalid visibility is dm, even with publish: true (the build's answer)", () => {
    expect(merged({ visibility: "bogus" })).toBe("dm");
    expect(merged({ visibility: "bogus", publish: true })).toBe("dm");
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
    expect(resolveType({ diskType: "npc", vaultType: "faction", baseType: undefined })).toEqual({
      type: "faction",
      conflict: false,
    });
  });
  it("vault changed, disk unchanged → vault wins", () => {
    expect(resolveType({ diskType: "npc", vaultType: "faction", baseType: "npc" })).toEqual({
      type: "faction",
      conflict: false,
    });
  });
  it("disk changed, vault unchanged → disk kept", () => {
    expect(resolveType({ diskType: "location", vaultType: "npc", baseType: "npc" })).toEqual({
      type: "location",
      conflict: false,
    });
  });
  it("neither changed → disk (no-op)", () => {
    expect(resolveType({ diskType: "npc", vaultType: "npc", baseType: "npc" })).toEqual({
      type: "npc",
      conflict: false,
    });
  });
  it("both changed → conflict, disk kept unless ticked", () => {
    expect(resolveType({ diskType: "location", vaultType: "faction", baseType: "npc" })).toEqual({
      type: "location",
      conflict: true,
    });
  });
});

// ── Task 1.3 ──────────────────────────────────────────────────────────────────

const fm = (data: Record<string, unknown>, content = "body") => ({ data, content });

describe("mergeImportFrontmatter (disk-base merge)", () => {
  it("preserves atlas-owned keys verbatim incl. unknown + legacy x/y", () => {
    const disk = diskNote(
      {
        atlas: {
          id: "corven",
          type: "npc",
          visibility: "dm",
          placements: [{ mapId: "m1", x: 1, y: 2 }],
          relationships: [{ to: "x" }],
          profile: { dm: { secret: "A" } },
          x: 9,
          y: 9,
          fooBar: "keep-me",
        },
      },
      "OLD BODY",
    );
    const vault = fm({ atlas: { summary: "new summary" } }, "NEW BODY");
    const r = mergeImportFrontmatter({ disk, vault, inferredType: "npc", baseType: "npc" });
    const a = r.data.atlas as Record<string, unknown>;
    expect(a.placements).toEqual([{ mapId: "m1", x: 1, y: 2 }]);
    expect(a.relationships).toEqual([{ to: "x" }]);
    expect(a.profile).toEqual({ dm: { secret: "A" } });
    expect(a.x).toBe(9);
    expect(a.y).toBe(9);
    expect(a.fooBar).toBe("keep-me");
    expect(a.id).toBe("corven");
    expect(a.summary).toBe("new summary");
    expect(r.content).toBe("NEW BODY");
  });

  it("always writes an explicit visibility = disk effective (never omitted)", () => {
    const disk = diskNote({ atlas: { id: "x", publish: false } });
    const vault = fm({ atlas: {} });
    const r = mergeImportFrontmatter({ disk, vault, inferredType: "note", baseType: "note" });
    expect((r.data.atlas as Record<string, unknown>).visibility).toBe("dm");
    expect(r.diskVisibility).toBe("dm");
    expect(r.exposureIncrease).toBe(false);
  });

  it("flags exposure increase but keeps disk visibility in the data", () => {
    const disk = diskNote({ atlas: { id: "x", visibility: "dm" } });
    const vault = fm({ atlas: { publish: true } });
    const r = mergeImportFrontmatter({ disk, vault, inferredType: "note", baseType: "note" });
    expect(r.exposureIncrease).toBe(true);
    expect((r.data.atlas as Record<string, unknown>).visibility).toBe("dm");
  });

  it("top-level Obsidian props: vault wins (and deletions propagate)", () => {
    const disk = diskNote({ role: "stale", title: "Old", atlas: { id: "x", visibility: "dm" } });
    const vault = fm({ role: "active", title: "New", atlas: {} });
    const r = mergeImportFrontmatter({ disk, vault, inferredType: "note", baseType: "note" });
    expect(r.data.role).toBe("active");
    expect(r.data.title).toBe("New");
  });

  it("unions tags/aliases and appends the resolved type as a tag", () => {
    const disk = diskNote({ atlas: { id: "x", visibility: "dm", tags: ["a"], aliases: ["A1"] } });
    const vault = fm({ atlas: { tags: ["b"], aliases: ["A2"] } });
    const r = mergeImportFrontmatter({ disk, vault, inferredType: "npc", baseType: "npc" });
    const a = r.data.atlas as Record<string, unknown>;
    expect(a.tags).toEqual(expect.arrayContaining(["a", "b", "npc"]));
    expect(a.aliases).toEqual(expect.arrayContaining(["A1", "A2"]));
  });

  it("disk has no atlas block — merge still safe (new entity with vault data)", () => {
    const disk = diskNote({ title: "New Entity" });
    const vault = fm({ atlas: { summary: "intro" } }, "Content here");
    const r = mergeImportFrontmatter({ disk, vault, inferredType: "lore", baseType: undefined });
    const a = r.data.atlas as Record<string, unknown>;
    expect(a.summary).toBe("intro");
    expect(a.visibility).toBe("dm"); // no visibility anywhere → dm (ADR-0001)
    expect(r.exposureIncrease).toBe(false); // the vault doesn't ask for exposure either
  });
});
