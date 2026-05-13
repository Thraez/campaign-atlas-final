import { describe, it, expect } from "vitest";
import { validatePatchYaml } from "@/atlas/yaml/validatePatch";
import { classifyDraftStatus } from "@/atlas/yaml/canon";

describe("validatePatchYaml — map", () => {
  it("accepts a well-formed map patch", () => {
    const r = validatePatchYaml(
      `# header\nmaps:\n  - id: foo\n    width: 100\n    height: 100\n`,
      "map"
    );
    expect(r.ok).toBe(true);
    expect(r.errors).toEqual([]);
  });

  it("rejects markdown code fences", () => {
    const r = validatePatchYaml("```yaml\nmaps: []\n```", "map");
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toMatch(/code fence/i);
  });

  it("rejects missing maps array", () => {
    const r = validatePatchYaml("foo: bar\n", "map");
    expect(r.ok).toBe(false);
  });

  it("rejects map entry without id", () => {
    const r = validatePatchYaml("maps:\n  - width: 1\n    height: 1\n", "map");
    expect(r.ok).toBe(false);
  });
});

describe("validatePatchYaml — placement", () => {
  it("accepts entity placement blocks", () => {
    const content = `# entity: Town\n# file: x.md\natlas:\n  placements:\n    - mapId: m1\n      x: 10\n      y: 20\n`;
    const r = validatePatchYaml(content, "placement");
    expect(r.ok).toBe(true);
  });

  it("rejects non-numeric coords", () => {
    const content = `atlas:\n  placements:\n    - mapId: m1\n      x: nope\n      y: 20\n`;
    const r = validatePatchYaml(content, "placement");
    expect(r.ok).toBe(false);
  });
});

describe("classifyDraftStatus", () => {
  it("clean state = built-from-yaml", () => {
    expect(classifyDraftStatus({ dirtyCount: 0 })).toBe("built-from-yaml");
  });
  it("dirty state = ready-to-export", () => {
    expect(classifyDraftStatus({ dirtyCount: 3 })).toBe("ready-to-export");
  });
  it("just exported, clean = exported-patch", () => {
    expect(classifyDraftStatus({ dirtyCount: 0, lastExportAt: Date.now() })).toBe("exported-patch");
  });
  it("old export = needs-commit", () => {
    const old = Date.now() - 10 * 60_000;
    expect(classifyDraftStatus({ dirtyCount: 0, lastExportAt: old })).toBe("needs-commit");
  });
});
