/**
 * Branch coverage for patchHeader and dumpYaml:
 *   - patchHeader without notes → the if-branch skipped
 *   - dumpYaml → block-style YAML, no code fences
 */
import { describe, it, expect } from "vitest";
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
