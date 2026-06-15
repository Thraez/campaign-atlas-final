/**
 * Branch coverage for buildEntityFrontmatterPatch, patchHeader, and dumpYaml.
 *
 * The existing atlas-import.test.ts has one smoke test for buildEntityFrontmatterPatch
 * but leaves these branches uncovered:
 *   - p.title absent → top object must not carry a title key
 *   - empty arrays in atlas → excluded so dumpYaml emits a clean block
 *   - undefined values in atlas → excluded
 *   - multiple patches → plural "files" suffix in header + filename
 *   - patchHeader without notes → the if-branch skipped
 *   - dumpYaml → block-style YAML, no code fences
 */
import { describe, it, expect } from "vitest";
import {
  buildEntityFrontmatterPatch,
  type EntityFrontmatterPatch,
} from "@/atlas/yaml/buildPatches";
import { patchHeader, dumpYaml } from "@/atlas/yaml/dump";
import yaml from "js-yaml";

// --------------------------------------------------------------------------
// patchHeader
// --------------------------------------------------------------------------

describe("patchHeader", () => {
  it("includes title, subject, and applyTo in the output", () => {
    const out = patchHeader({
      title: "My patch",
      subject: "entity:foo.md",
      applyTo: "foo.md",
    });
    expect(out).toContain("# My patch");
    expect(out).toContain("# Subject: entity:foo.md");
    expect(out).toContain("foo.md");
  });

  it("omits note lines when notes is not provided", () => {
    const out = patchHeader({
      title: "No-notes patch",
      subject: "entity:x.md",
      applyTo: "x.md",
    });
    // No custom note lines beyond the standard header
    const lines = out.split("\n").filter((l) => l.startsWith("#"));
    // Verify none of the lines are custom notes (only the standard six header lines exist)
    // Standard lines: title, Generated date, Subject, #, CANON MODEL, two body lines, #, HOW TO APPLY, two body lines
    // The key invariant: no notes block means no line matching "# Each" / "# Replace" etc.
    expect(out).not.toContain("# Each");
    expect(out).not.toContain("# Replace");
  });

  it("appends note lines when notes is provided", () => {
    const out = patchHeader({
      title: "With notes",
      subject: "entity:y.md",
      applyTo: "y.md",
      notes: ["First note.", "Second note."],
    });
    expect(out).toContain("# First note.");
    expect(out).toContain("# Second note.");
  });

  it("ends with a blank line separator", () => {
    const out = patchHeader({ title: "T", subject: "S", applyTo: "A" });
    expect(out.endsWith("\n")).toBe(true);
  });
});

// --------------------------------------------------------------------------
// dumpYaml
// --------------------------------------------------------------------------

describe("dumpYaml", () => {
  it("produces valid YAML for a simple object", () => {
    const out = dumpYaml({ id: "thornhold", type: "settlement" });
    const parsed = yaml.load(out) as Record<string, unknown>;
    expect(parsed.id).toBe("thornhold");
    expect(parsed.type).toBe("settlement");
  });

  it("uses 2-space indentation for nested objects", () => {
    const out = dumpYaml({ atlas: { id: "x", type: "npc" } });
    // Nested key should be indented with two spaces.
    expect(out).toMatch(/^atlas:\n {2}id:/m);
  });

  it("never emits markdown code fences", () => {
    const out = dumpYaml({ body: "```code```" });
    // The outer YAML dump should not itself be wrapped in fences.
    expect(out).not.toMatch(/^```/m);
  });
});

// --------------------------------------------------------------------------
// buildEntityFrontmatterPatch — title-absent branch
// --------------------------------------------------------------------------

describe("buildEntityFrontmatterPatch — title absent", () => {
  it("omits the title key from the YAML block when p.title is undefined", () => {
    const patch: EntityFrontmatterPatch = {
      sourcePath: "npcs/Corven.md",
      // title intentionally omitted
      atlas: { id: "corven", type: "npc", visibility: "player" },
    };
    const artifact = buildEntityFrontmatterPatch([patch]);
    // The YAML block must not have a top-level `title:` key.
    expect(artifact.content).not.toMatch(/^title:/m);
    // But the atlas block should still be present.
    expect(artifact.content).toContain("atlas:");
  });
});

// --------------------------------------------------------------------------
// buildEntityFrontmatterPatch — empty arrays and undefined values excluded
// --------------------------------------------------------------------------

describe("buildEntityFrontmatterPatch — atlas key filtering", () => {
  it("excludes empty array fields from the YAML block", () => {
    const patch: EntityFrontmatterPatch = {
      sourcePath: "settlements/X.md",
      title: "X",
      atlas: {
        id: "x",
        type: "settlement",
        aliases: [],       // empty array → must be excluded
        tags: [],          // empty array → must be excluded
        images: ["img.webp"], // non-empty → must be included
      },
    };
    const artifact = buildEntityFrontmatterPatch([patch]);
    expect(artifact.content).not.toContain("aliases:");
    expect(artifact.content).not.toContain("tags:");
    expect(artifact.content).toContain("images:");
  });

  it("excludes undefined values from the YAML block", () => {
    const patch: EntityFrontmatterPatch = {
      sourcePath: "settlements/Y.md",
      atlas: {
        id: "y",
        type: "settlement",
        summary: undefined,  // undefined → must be excluded
        visibility: "player",
      },
    };
    const artifact = buildEntityFrontmatterPatch([patch]);
    expect(artifact.content).not.toContain("summary:");
    expect(artifact.content).toContain("visibility:");
  });
});

// --------------------------------------------------------------------------
// buildEntityFrontmatterPatch — single-file singular suffix
// --------------------------------------------------------------------------

describe("buildEntityFrontmatterPatch — single file", () => {
  it('uses singular "file" in header and filename for a single patch', () => {
    const patch: EntityFrontmatterPatch = {
      sourcePath: "settlements/A.md",
      title: "A",
      atlas: { id: "a", type: "settlement" },
    };
    const artifact = buildEntityFrontmatterPatch([patch]);
    expect(artifact.filename).toBe("entity-frontmatter-patch-1.yaml");
    expect(artifact.summary[0]).toMatch(/\b1 entity file\b/);
    // Header should mention singular form.
    expect(artifact.content).toContain("1 file\n");
  });

  it("populates sections with the source path and yaml block", () => {
    const patch: EntityFrontmatterPatch = {
      sourcePath: "npcs/Edric.md",
      title: "Edric",
      atlas: { id: "edric", type: "npc" },
    };
    const artifact = buildEntityFrontmatterPatch([patch]);
    expect(artifact.sections).toHaveLength(1);
    expect(artifact.sections![0].label).toBe("npcs/Edric.md");
    expect(artifact.sections![0].yaml).toContain("atlas:");
  });
});

// --------------------------------------------------------------------------
// buildEntityFrontmatterPatch — multiple files plural suffix
// --------------------------------------------------------------------------

describe("buildEntityFrontmatterPatch — multiple files", () => {
  it('uses plural "files" in header, summary, and filename for two patches', () => {
    const patches: EntityFrontmatterPatch[] = [
      { sourcePath: "npcs/A.md", title: "A", atlas: { id: "a", type: "npc" } },
      { sourcePath: "npcs/B.md", atlas: { id: "b", type: "npc" } },
    ];
    const artifact = buildEntityFrontmatterPatch(patches);
    expect(artifact.filename).toBe("entity-frontmatter-patch-2.yaml");
    expect(artifact.summary[0]).toMatch(/\b2 entity files\b/);
    expect(artifact.content).toContain("2 files\n");
  });

  it("includes a section entry for each patch", () => {
    const patches: EntityFrontmatterPatch[] = [
      { sourcePath: "npcs/A.md", atlas: { id: "a", type: "npc" } },
      { sourcePath: "npcs/B.md", atlas: { id: "b", type: "npc" } },
      { sourcePath: "npcs/C.md", atlas: { id: "c", type: "npc" } },
    ];
    const artifact = buildEntityFrontmatterPatch(patches);
    expect(artifact.sections).toHaveLength(3);
    expect(artifact.sections!.map((s) => s.label)).toEqual([
      "npcs/A.md",
      "npcs/B.md",
      "npcs/C.md",
    ]);
  });

  it("emits a '# file:' marker in the body for each patch", () => {
    const patches: EntityFrontmatterPatch[] = [
      { sourcePath: "places/X.md", title: "X", atlas: { id: "x", type: "settlement" } },
      { sourcePath: "places/Y.md", title: "Y", atlas: { id: "y", type: "settlement" } },
    ];
    const artifact = buildEntityFrontmatterPatch(patches);
    expect(artifact.content).toContain("# file: places/X.md");
    expect(artifact.content).toContain("# file: places/Y.md");
  });
});
