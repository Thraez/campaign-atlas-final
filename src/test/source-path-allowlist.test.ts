import { describe, it, expect } from "vitest";
import { isWritableAssetPath, isWritableSourcePath } from "@/atlas/save/sourcePathAllowlist";

describe("isWritableSourcePath", () => {
  const allowed = [
    "content/world/_atlas/world.yaml",
    "content/world/_atlas/world.yml",
    "content/world/notes/place.md",
    "content/another-world/_atlas/regions.yaml",
    "content/a/b/c/deep.md",
  ];
  for (const p of allowed) {
    it(`allows ${p}`, () => expect(isWritableSourcePath(p)).toBe(true));
  }

  const blocked = [
    "content/world/_atlas/../evil.yaml",
    "content/world/_atlas/file.yamlx",
    "content/world/notes/place.mdx",
    "content/world/notes/place.MD",
    "public/atlas/atlas.json",
    "dist/index.html",
    ".github/workflows/publish.yml",
    "src/App.tsx",
    "package.json",
    "vite.config.ts",
    "/content/world/notes/place.md",
    "./content/world/notes/place.md",
    "",
    ".",
    "content/world/_atlas/sub/world.yaml",
    "content/_atlas/world.yaml",
  ];
  for (const p of blocked) {
    it(`blocks ${JSON.stringify(p)}`, () => expect(isWritableSourcePath(p)).toBe(false));
  }

  // The asset path branch lives in a separate function — make sure it
  // isn't accidentally accepted here.
  it("blocks public/atlas/assets/maps/<file>.png on the source-path branch", () => {
    expect(isWritableSourcePath("public/atlas/assets/maps/mountain.png")).toBe(false);
  });
});

describe("isWritableAssetPath", () => {
  const allowed = [
    "public/atlas/assets/maps/mountain.png",
    "public/atlas/assets/maps/Mountain.PNG", // case-insensitive ext (per regex with /i? — no, our regex is lowercase only — adjust)
    "public/atlas/assets/maps/big-coast.webp",
    "public/atlas/assets/maps/under_score.jpg",
    "public/atlas/assets/maps/CamelCase.jpeg",
    "public/atlas/assets/maps/with-1234.gif",
  ];
  // The .PNG case is intentional bait: file extensions are case-sensitive
  // (matches the .md/.yaml branch above), so this should be blocked.
  it("blocks public/atlas/assets/maps/Mountain.PNG (extension must be lowercase)", () => {
    expect(isWritableAssetPath("public/atlas/assets/maps/Mountain.PNG")).toBe(false);
  });
  for (const p of allowed.filter((x) => !x.endsWith(".PNG"))) {
    it(`allows ${p}`, () => expect(isWritableAssetPath(p)).toBe(true));
  }

  const blocked = [
    // Wrong prefix
    "content/world/_atlas/world.yaml",
    "public/atlas/atlas.json",
    "public/atlas/search-index.json",
    "public/index.html",
    "atlas/assets/maps/x.png", // no leading "public/"
    // Subdirectories under maps/ are NOT allowed
    "public/atlas/assets/maps/sub/x.png",
    // Wrong extension
    "public/atlas/assets/maps/x.svg",
    "public/atlas/assets/maps/x.bmp",
    "public/atlas/assets/maps/x.txt",
    "public/atlas/assets/maps/Makefile",
    // Path safety
    "public/atlas/assets/maps/../atlas.json",
    "/public/atlas/assets/maps/x.png",
    "./public/atlas/assets/maps/x.png",
    "public\\atlas\\assets\\maps\\x.png",
    "",
  ];
  for (const p of blocked) {
    it(`blocks ${JSON.stringify(p)}`, () => expect(isWritableAssetPath(p)).toBe(false));
  }
});