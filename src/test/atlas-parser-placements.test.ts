/**
 * Branch coverage for the private helpers in scripts/atlas/parseFrontmatter.ts:
 * parsePlacements, parsePinStyle, parseProfile, parseRelationships.
 *
 * These functions are only reachable through parseFrontmatter(), so all tests
 * drive them via inline YAML frontmatter strings.
 */
import { describe, it, expect } from "vitest";
import { parseFrontmatter } from "../../scripts/atlas/parseFrontmatter";

// ---------------------------------------------------------------------------
// parsePlacements
// ---------------------------------------------------------------------------

describe("parseFrontmatter — parsePlacements edge cases", () => {
  it("non-array atlas.placements emits a warning and returns undefined", () => {
    const raw = `---\natlas:\n  placements: "bad"\n---\nbody`;
    const p = parseFrontmatter(raw, "x.md");
    expect(p.atlas.placements).toBeUndefined();
    expect(p.warnings.join(" ")).toMatch(/placements must be an array/);
  });

  it("non-object item in the array is skipped with a warning; valid siblings survive", () => {
    const raw = [
      "---",
      "atlas:",
      "  placements:",
      '    - "not-an-object"',
      "    - x: 100",
      "      y: 200",
      "---",
    ].join("\n");
    const p = parseFrontmatter(raw, "x.md");
    expect(p.warnings.join(" ")).toMatch(/not an object/);
    expect(p.atlas.placements).toHaveLength(1);
    expect(p.atlas.placements![0].x).toBe(100);
    expect(p.atlas.placements![0].y).toBe(200);
  });

  it("placement missing numeric x/y is skipped with a warning", () => {
    const raw = [
      "---",
      "atlas:",
      "  placements:",
      "    - mapId: m1",
      '      x: "not-a-number"',
      "      y: 100",
      "---",
    ].join("\n");
    const p = parseFrontmatter(raw, "x.md");
    expect(p.atlas.placements).toBeUndefined();
    expect(p.warnings.join(" ")).toMatch(/missing numeric x\/y/);
  });

  it("returns undefined when every placement is invalid", () => {
    const raw = `---\natlas:\n  placements:\n    - "skip"\n---\n`;
    const p = parseFrontmatter(raw, "x.md");
    expect(p.atlas.placements).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// parsePinStyle (reached via atlas.placements[*].pin)
// ---------------------------------------------------------------------------

describe("parseFrontmatter — parsePinStyle edge cases", () => {
  it("non-object pin value emits a warning and the pin is undefined on the placement", () => {
    const raw = [
      "---",
      "atlas:",
      "  placements:",
      "    - x: 10",
      "      y: 20",
      '      pin: "teardrop"',
      "---",
    ].join("\n");
    const p = parseFrontmatter(raw, "x.md");
    expect(p.warnings.join(" ")).toMatch(/pin must be an object/);
    expect(p.atlas.placements![0].pin).toBeUndefined();
  });

  it("invalid shape is silently ignored (not in the allowed set)", () => {
    const raw = [
      "---",
      "atlas:",
      "  placements:",
      "    - x: 10",
      "      y: 20",
      "      pin:",
      "        shape: triangle",
      "---",
    ].join("\n");
    const p = parseFrontmatter(raw, "x.md");
    // "triangle" is not in VALID_SHAPES; the field is omitted, so pin is undefined (empty result).
    expect(p.atlas.placements![0].pin).toBeUndefined();
  });

  it("invalid labelMode is silently ignored", () => {
    const raw = [
      "---",
      "atlas:",
      "  placements:",
      "    - x: 10",
      "      y: 20",
      "      pin:",
      "        labelMode: blink",
      "---",
    ].join("\n");
    const p = parseFrontmatter(raw, "x.md");
    expect(p.atlas.placements![0].pin).toBeUndefined();
  });

  it("priority above 10 is clamped to 10 and a warning is emitted", () => {
    const raw = [
      "---",
      "atlas:",
      "  placements:",
      "    - x: 10",
      "      y: 20",
      "      pin:",
      "        priority: 15",
      "---",
    ].join("\n");
    const p = parseFrontmatter(raw, "x.md");
    expect(p.warnings.join(" ")).toMatch(/out of range/);
    expect(p.atlas.placements![0].pin!.priority).toBe(10);
  });

  it("negative priority is clamped to 0", () => {
    const raw = [
      "---",
      "atlas:",
      "  placements:",
      "    - x: 10",
      "      y: 20",
      "      pin:",
      "        priority: -5",
      "---",
    ].join("\n");
    const p = parseFrontmatter(raw, "x.md");
    expect(p.atlas.placements![0].pin!.priority).toBe(0);
  });

  it("empty pin object returns undefined on the placement (no fields passed validation)", () => {
    const raw = [
      "---",
      "atlas:",
      "  placements:",
      "    - x: 10",
      "      y: 20",
      "      pin: {}",
      "---",
    ].join("\n");
    const p = parseFrontmatter(raw, "x.md");
    expect(p.atlas.placements![0].pin).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// parseProfile
// ---------------------------------------------------------------------------

describe("parseFrontmatter — parseProfile edge cases", () => {
  it("string atlas.profile emits a warning and returns undefined", () => {
    const raw = `---\natlas:\n  profile: "string-not-object"\n---\n`;
    const p = parseFrontmatter(raw, "x.md");
    expect(p.atlas.profile).toBeUndefined();
    expect(p.warnings.join(" ")).toMatch(/profile must be an object/);
  });

  it("array atlas.profile emits a warning and returns undefined", () => {
    const raw = [
      "---",
      "atlas:",
      "  profile:",
      "    - not: object",
      "---",
    ].join("\n");
    const p = parseFrontmatter(raw, "x.md");
    expect(p.atlas.profile).toBeUndefined();
    expect(p.warnings.join(" ")).toMatch(/profile must be an object/);
  });
});

// ---------------------------------------------------------------------------
// parseRelationships
// ---------------------------------------------------------------------------

describe("parseFrontmatter — parseRelationships edge cases", () => {
  it("non-array atlas.relationships emits a warning and returns undefined", () => {
    const raw = `---\natlas:\n  relationships: "not-array"\n---\n`;
    const p = parseFrontmatter(raw, "x.md");
    expect(p.atlas.relationships).toBeUndefined();
    expect(p.warnings.join(" ")).toMatch(/relationships must be an array/);
  });

  it("non-object item in relationships is skipped with a warning", () => {
    const raw = [
      "---",
      "atlas:",
      "  relationships:",
      '    - "skip-me"',
      "---",
    ].join("\n");
    const p = parseFrontmatter(raw, "x.md");
    expect(p.atlas.relationships).toBeUndefined();
    expect(p.warnings.join(" ")).toMatch(/not an object/);
  });

  it("relationship missing entity id is skipped with a warning", () => {
    const raw = [
      "---",
      "atlas:",
      "  relationships:",
      "    - type: allies_with",
      "---",
    ].join("\n");
    const p = parseFrontmatter(raw, "x.md");
    expect(p.atlas.relationships).toBeUndefined();
    expect(p.warnings.join(" ")).toMatch(/missing entity id/);
  });

  it("relationship missing type is skipped with a warning", () => {
    const raw = [
      "---",
      "atlas:",
      "  relationships:",
      "    - entity: thornhold",
      "---",
    ].join("\n");
    const p = parseFrontmatter(raw, "x.md");
    expect(p.atlas.relationships).toBeUndefined();
    expect(p.warnings.join(" ")).toMatch(/missing type/);
  });

  it("invalid visibility on a relationship defaults to dm (security invariant) and emits a warning", () => {
    const raw = [
      "---",
      "atlas:",
      "  relationships:",
      "    - entity: thornhold",
      "      type: allies_with",
      "      visibility: public",
      "---",
    ].join("\n");
    const p = parseFrontmatter(raw, "x.md");
    expect(p.atlas.relationships![0].visibility).toBe("dm");
    expect(p.warnings.join(" ")).toMatch(/invalid visibility/);
  });
});
