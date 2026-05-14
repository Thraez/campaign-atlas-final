import { describe, it, expect } from "vitest";
import { isWritableSourcePath } from "@/atlas/save/sourcePathAllowlist";

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
});