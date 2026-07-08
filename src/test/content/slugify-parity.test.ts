import { describe, it, expect } from "vitest";
import { slugify as fromSrc } from "@/atlas/content/slugify";
import { slugify as fromScripts } from "../../../scripts/atlas/slugify";

// The build pipeline and every runtime Save path must derive the SAME id/slug
// from the same title, or the same entity can end up with two different file
// ids depending on which code path created it. This pins the single-source-of-
// truth: one implementation, re-exported to the build side.
const CASES = [
  "Hello World",
  "The Sunken Temple",
  "Drow's Keep", // straight ASCII apostrophe → stripped
  "Drow’s Keep", // curly apostrophe → separator
  "Café del Mar",
  "Crème Brûlée",
  "  --Hello, World!--  ",
  "snake_case_name",
  "Level 3 Dungeon",
  "!!!",
  "",
  "a".repeat(100),
];

describe("slugify parity (one source of truth)", () => {
  it("src and scripts entrypoints resolve to the same implementation", () => {
    for (const input of CASES) {
      expect(fromSrc(input)).toBe(fromScripts(input));
    }
  });

  it("folds accents and strips straight apostrophes (canonical contract)", () => {
    expect(fromSrc("Kael's Café")).toBe("kaels-cafe");
    expect(fromSrc("The King's Road")).toBe("the-kings-road");
  });

  it("caps the result at 80 characters", () => {
    expect(fromSrc("a".repeat(100))).toHaveLength(80);
  });
});
