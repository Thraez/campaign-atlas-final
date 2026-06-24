import { describe, it, expect } from "vitest";
import { patchHeader, dumpYaml } from "@/atlas/yaml/dump";

describe("patchHeader", () => {
  it("includes the title as a comment line", () => {
    const out = patchHeader({ title: "Map Patch", subject: "entity:foo.md", applyTo: "content/foo.md" });
    expect(out).toContain("# Map Patch");
  });

  it("includes a Generated timestamp line matching ISO format", () => {
    const out = patchHeader({ title: "T", subject: "S", applyTo: "A" });
    expect(out).toMatch(/# Generated \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it("includes the subject prefixed with '# Subject:'", () => {
    const out = patchHeader({ title: "T", subject: "world.yaml > maps[id=astrath]", applyTo: "world.yaml" });
    expect(out).toContain("# Subject: world.yaml > maps[id=astrath]");
  });

  it("includes applyTo in the HOW TO APPLY section", () => {
    const out = patchHeader({ title: "T", subject: "S", applyTo: "content/astrath.md" });
    expect(out).toContain("content/astrath.md");
    expect(out).toContain("# HOW TO APPLY:");
  });

  it("ends with a trailing newline (blank separator before the YAML body)", () => {
    const out = patchHeader({ title: "T", subject: "S", applyTo: "A" });
    expect(out.endsWith("\n")).toBe(true);
  });

  it("includes each note line prefixed with '# ' when notes is provided", () => {
    const out = patchHeader({
      title: "T",
      subject: "S",
      applyTo: "A",
      notes: ["Be careful with this field", "Review before applying"],
    });
    expect(out).toContain("# Be careful with this field");
    expect(out).toContain("# Review before applying");
  });

  it("adds more lines when notes is provided vs absent", () => {
    const withNotes = patchHeader({ title: "T", subject: "S", applyTo: "A", notes: ["Note"] });
    const without = patchHeader({ title: "T", subject: "S", applyTo: "A" });
    expect(withNotes.split("\n").length).toBeGreaterThan(without.split("\n").length);
  });

  it("omits the notes block when notes is an empty array (same line count as absent)", () => {
    const withEmpty = patchHeader({ title: "T", subject: "S", applyTo: "A", notes: [] });
    const withAbsent = patchHeader({ title: "T", subject: "S", applyTo: "A" });
    expect(withEmpty.split("\n").length).toBe(withAbsent.split("\n").length);
  });

  it("includes CANON MODEL boilerplate", () => {
    const out = patchHeader({ title: "T", subject: "S", applyTo: "A" });
    expect(out).toContain("# CANON MODEL:");
  });
});

describe("dumpYaml", () => {
  it("serializes a flat object to YAML key-value lines", () => {
    const out = dumpYaml({ name: "Thornhold", level: 3 });
    expect(out).toContain("name: Thornhold");
    expect(out).toContain("level: 3");
  });

  it("uses 2-space indentation for nested objects", () => {
    const out = dumpYaml({ parent: { child: "value" } });
    expect(out).toContain("parent:");
    expect(out).toContain("  child: value");
  });

  it("preserves insertion key order (sortKeys: false)", () => {
    const out = dumpYaml({ z: 1, a: 2 });
    const zPos = out.indexOf("z:");
    const aPos = out.indexOf("a:");
    expect(zPos).toBeLessThan(aPos);
  });

  it("serializes arrays with dash notation", () => {
    const out = dumpYaml({ tags: ["npc", "villain"] });
    expect(out).toContain("- npc");
    expect(out).toContain("- villain");
  });

  it("does not emit YAML document markers (--- or ...)", () => {
    const out = dumpYaml({ key: "value" });
    expect(out).not.toContain("---");
    expect(out).not.toContain("...");
  });
});
