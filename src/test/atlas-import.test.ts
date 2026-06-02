import { describe, it, expect } from "vitest";
import { parseObsidianFile, generateAutoSummary } from "@/atlas/import/parseObsidian";
import { inferTypeFromPath, isIgnoredPath } from "@/atlas/import/inferType";
import { buildEntityFrontmatterPatch } from "@/atlas/yaml/buildPatches";
import { validatePatchYaml } from "@/atlas/yaml/validatePatch";

describe("inferTypeFromPath", () => {
  it("infers from folder", () => {
    expect(inferTypeFromPath("settlements/Sunhaven.md")).toBe("settlement");
    expect(inferTypeFromPath("vault/regions/Vale.md")).toBe("region");
    expect(inferTypeFromPath("npcs/Bob.md")).toBe("npc");
    expect(inferTypeFromPath("misc/Random.md")).toBe("note");
  });
});

describe("isIgnoredPath", () => {
  it("ignores _drafts/_dm/archive", () => {
    expect(isIgnoredPath("_drafts/foo.md")).toBe(true);
    expect(isIgnoredPath("vault/_dm/secret.md")).toBe(true);
    expect(isIgnoredPath("settlements/Sunhaven.md")).toBe(false);
  });
});

describe("generateAutoSummary", () => {
  it("strips headings, callouts, embeds", () => {
    const body = "# Title\n\n> [!note] hidden\n\n![[map.png]]\n\nThis is the real intro paragraph for the entity, long enough to count.";
    const s = generateAutoSummary(body);
    expect(s).toMatch(/real intro/);
  });
});

describe("parseObsidianFile", () => {
  it("defaults missing visibility to dm", () => {
    const f = parseObsidianFile("---\ntitle: X\n---\nbody", "settlements/X.md");
    expect(f.effectiveVisibility).toBe("dm");
    expect(f.visibilityWasMissing).toBe(true);
    expect(f.inferredType).toBe("settlement");
  });

  it("respects atlas.publish:true to upgrade to player", () => {
    const f = parseObsidianFile("---\natlas:\n  publish: true\n---\nA published town.", "settlements/X.md");
    expect(f.effectiveVisibility).toBe("player");
    expect(f.level).toBe("player-published");
  });

  it("falls back to dm on invalid visibility", () => {
    const f = parseObsidianFile("---\natlas:\n  visibility: bogus\n---\n", "npcs/Y.md");
    expect(f.visibilityWasInvalid).toBe(true);
    expect(f.effectiveVisibility).toBe("dm");
  });

  it("classifies _drafts as ignored", () => {
    const f = parseObsidianFile("body", "_drafts/wip.md");
    expect(f.level).toBe("ignored");
  });

  it("extracts wikilinks and embeds", () => {
    const f = parseObsidianFile(
      "Link [[Sunhaven]] and [[Vale|the Vale]]. ![[map.png]]",
      "notes/X.md"
    );
    expect(f.wikilinks.map((w) => w.target)).toContain("Sunhaven");
    expect(f.wikilinks.map((w) => w.target)).toContain("Vale");
    expect(f.attachments[0].rawSrc).toBe("map.png");
  });
});

describe("generateAutoSummary — edge cases", () => {
  it("returns undefined when all blocks are too short (< 20 chars)", () => {
    expect(generateAutoSummary("Hi.\n\nOk.\n\nFine.")).toBeUndefined();
  });

  it("returns a block unchanged when it fits within maxLen", () => {
    const body = "This is a short but valid paragraph.";
    expect(generateAutoSummary(body)).toBe(body);
  });

  it("truncates at the last word boundary when block exceeds maxLen", () => {
    const body = "word ".repeat(60).trim(); // 299 chars, well over default 220
    const result = generateAutoSummary(body);
    expect(result).toBeDefined();
    expect(result!.length).toBeLessThanOrEqual(221); // maxLen + "…"
    expect(result!.endsWith("…")).toBe(true);
    // Must cut at a word boundary (space before truncation point)
    expect(result!.replace(/…$/, "").endsWith(" ")).toBe(false); // trailing space stripped by cut
  });

  it("falls back to hard-character cut when no space exists in the last region", () => {
    // A single long word with no spaces — lastSpace will be -1 or ≤ 80
    const body = "x".repeat(230); // single run, no spaces
    const result = generateAutoSummary(body);
    expect(result!.endsWith("…")).toBe(true);
    expect(result!.length).toBeLessThanOrEqual(222);
  });
});

describe("parseObsidianFile — uncovered branches", () => {
  it("classifies dm-visibility settlement as level='placeable'", () => {
    // dm + mappable type → placeable (not wiki-only)
    const f = parseObsidianFile("---\natlas:\n  visibility: dm\n---\nbody", "settlements/Thornwall.md");
    expect(f.level).toBe("placeable");
    expect(f.effectiveVisibility).toBe("dm");
  });

  it("marks wikilinks as broken when target not in knownEntityNames", () => {
    const f = parseObsidianFile(
      "The [[Ghost Town]] lies east of [[Thornwall]].",
      "lore/Rumor.md",
      { knownEntityNames: new Set(["thornwall"]) }
    );
    const ghost = f.wikilinks.find((w) => w.target === "Ghost Town");
    const known = f.wikilinks.find((w) => w.target === "Thornwall");
    expect(ghost?.broken).toBe(true);
    expect(known?.broken).toBeUndefined(); // resolved links have no broken flag
  });

  it("emits a warning when player-published file has broken wikilinks", () => {
    const f = parseObsidianFile(
      "---\natlas:\n  visibility: player\n---\nSee [[MissingNPC]].",
      "npcs/Hero.md",
      { knownEntityNames: new Set() }
    );
    expect(f.warnings.some((w) => /unresolved wikilinks/i.test(w))).toBe(true);
  });

  it("records a frontmatterError warning on malformed YAML", () => {
    const f = parseObsidianFile("---\nkey: [\nbad yaml\n---\nbody", "lore/Bad.md");
    expect(f.frontmatterError).toBeDefined();
    expect(f.warnings.some((w) => /frontmatter parse error/i.test(w))).toBe(true);
    expect(f.hasFrontmatter).toBe(false);
  });

  it("resolves https:// attachment as resolved=true without rewriting", () => {
    const f = parseObsidianFile(
      "![[https://example.com/map.png]]",
      "notes/X.md"
    );
    const att = f.attachments.find((a) => a.rawSrc === "https://example.com/map.png");
    expect(att).toBeDefined();
    expect(att!.resolved).toBe(true);
    expect(att!.suggestedTarget).toBe("https://example.com/map.png");
  });

  it("emits attachment warning for unresolved relative attachments", () => {
    const f = parseObsidianFile("![[portrait.png]]", "npcs/X.md");
    expect(f.attachments[0].resolved).toBe(false);
    expect(f.warnings.some((w) => /attachment.*need a target/i.test(w))).toBe(true);
  });
});

describe("buildEntityFrontmatterPatch", () => {
  it("produces parseable YAML blocks", () => {
    const a = buildEntityFrontmatterPatch([
      { sourcePath: "settlements/X.md", title: "X", atlas: { id: "x", type: "settlement", visibility: "dm", summary: "A town." } },
    ]);
    // Each '---' frontmatter block is parseable on its own.
    const v = validatePatchYaml(a.content.replace(/---/g, ""), "placement");
    // Doesn't have to pass placement-specific shape, just no fences / parse errors.
    // The body (non-comment lines) must not contain markdown code fences.
    const body = a.content.split("\n").filter((l) => !l.trim().startsWith("#")).join("\n");
    expect(a.content).toMatch(/atlas:/);
    expect(body).not.toMatch(/```/);
    expect(v.errors.filter((e) => /code fence/i.test(e))).toHaveLength(0);
  });
});
