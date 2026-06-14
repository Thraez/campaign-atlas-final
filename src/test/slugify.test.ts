import { describe, it, expect } from "vitest";
import { slugify } from "../../scripts/atlas/slugify";

// slugify() is the canonical build-time ID generator: build-atlas.ts mints entity
// IDs as `parsed.atlas.id || slugify(title)`, and several import-preview paths
// (e.g. src/atlas/import/stagingState.ts) deliberately mirror its rules so the
// preview matches the eventual build. These tests pin that behavior as a
// regression guard — they assert the current output, they do not change it.

describe("slugify", () => {
  it("lowercases and hyphenates words", () => {
    expect(slugify("Hello World")).toBe("hello-world");
    expect(slugify("The Sunken Temple")).toBe("the-sunken-temple");
  });

  it("does not split camelCase (lowercasing merges it)", () => {
    expect(slugify("CamelCase")).toBe("camelcase");
  });

  it("preserves digits, including leading ones", () => {
    expect(slugify("Level 3 Dungeon")).toBe("level-3-dungeon");
    expect(slugify("3rd Edition")).toBe("3rd-edition");
  });

  it("strips a straight ASCII apostrophe rather than hyphenating it", () => {
    expect(slugify("Drow's Keep")).toBe("drows-keep");
    expect(slugify("The King's Road")).toBe("the-kings-road");
  });

  it("treats a curly apostrophe (U+2019) as a separator, not a strip", () => {
    // Only the straight ASCII ' is removed; the typographic ' falls through to
    // the non-alphanumeric rule and becomes a hyphen.
    expect(slugify("Drow’s Keep")).toBe("drow-s-keep");
  });

  it("folds accented characters to their base letters", () => {
    expect(slugify("Café del Mar")).toBe("cafe-del-mar");
    expect(slugify("Crème Brûlée")).toBe("creme-brulee");
  });

  it("collapses runs of separators into a single hyphen", () => {
    expect(slugify("a  &  b")).toBe("a-b");
    expect(slugify("snake_case_name")).toBe("snake-case-name");
  });

  it("trims leading and trailing separators", () => {
    expect(slugify("  --Hello, World!--  ")).toBe("hello-world");
  });

  it("returns an empty string when nothing alphanumeric remains", () => {
    expect(slugify("")).toBe("");
    expect(slugify("   ")).toBe("");
    expect(slugify("!!!")).toBe("");
  });

  it("is idempotent on an already-valid slug", () => {
    expect(slugify("already-a-slug")).toBe("already-a-slug");
  });

  it("caps the result at 80 characters", () => {
    const out = slugify("a".repeat(100));
    expect(out).toHaveLength(80);
    expect(out).toBe("a".repeat(80));
  });
});
