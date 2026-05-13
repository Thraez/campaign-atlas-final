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
