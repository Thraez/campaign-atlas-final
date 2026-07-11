import { describe, it, expect } from "vitest";
import path from "node:path";
import {
  isReadableVaultPath,
  isReadableLocalAtlasPath,
  isWritableSourcePath,
  isWritableAssetPath,
} from "@/atlas/save/sourcePathAllowlist";

describe("isReadableVaultPath", () => {
  it("accepts .md files within vault root", () => {
    const root = path.resolve("/vault");
    expect(isReadableVaultPath(root, path.resolve(root, "notes/a.md"))).toBe(true);
  });

  it("accepts nested .md files", () => {
    const root = path.resolve("/vault");
    expect(isReadableVaultPath(root, path.resolve(root, "a/b/c/deep.md"))).toBe(true);
  });

  it("rejects path traversal that escapes root", () => {
    const root = path.resolve("/vault");
    expect(isReadableVaultPath(root, path.resolve("/escape.md"))).toBe(false);
  });

  it("rejects sibling directory (separator boundary)", () => {
    const root = path.resolve("/vault");
    // /vault-secrets/ must not match /vault/
    expect(isReadableVaultPath(root, path.resolve("/vault-secrets/x.md"))).toBe(false);
  });

  it("rejects non-.md extensions", () => {
    const root = path.resolve("/vault");
    expect(isReadableVaultPath(root, path.resolve(root, "notes/a.yaml"))).toBe(false);
    expect(isReadableVaultPath(root, path.resolve(root, "notes/a.txt"))).toBe(false);
    expect(isReadableVaultPath(root, path.resolve(root, "notes/a.json"))).toBe(false);
  });

  it("accepts .MD extension (case-insensitive)", () => {
    const root = path.resolve("/vault");
    expect(isReadableVaultPath(root, path.resolve(root, "notes/a.MD"))).toBe(true);
  });
});

describe("isReadableLocalAtlasPath", () => {
  it("accepts .local-atlas/editor-settings.json", () => {
    expect(isReadableLocalAtlasPath(".local-atlas/editor-settings.json")).toBe(true);
  });

  it("accepts .local-atlas/sync-map.json", () => {
    expect(isReadableLocalAtlasPath(".local-atlas/sync-map.json")).toBe(true);
  });

  it("rejects other filenames in .local-atlas", () => {
    expect(isReadableLocalAtlasPath(".local-atlas/other.json")).toBe(false);
    expect(isReadableLocalAtlasPath(".local-atlas/atlas.json")).toBe(false);
    expect(isReadableLocalAtlasPath(".local-atlas/secrets.yaml")).toBe(false);
  });

  it("rejects files in other directories", () => {
    expect(isReadableLocalAtlasPath("content/world/file.json")).toBe(false);
    expect(isReadableLocalAtlasPath("editor-settings.json")).toBe(false);
  });

  it("rejects path-traversal attempts", () => {
    expect(isReadableLocalAtlasPath(".local-atlas/../content/file.json")).toBe(false);
  });
});

describe("isWritableSourcePath — input guards", () => {
  it("rejects empty string", () => {
    expect(isWritableSourcePath("")).toBe(false);
  });

  it("rejects absolute paths (leading /)", () => {
    expect(isWritableSourcePath("/content/world/file.md")).toBe(false);
  });

  it("rejects ./-prefixed paths", () => {
    expect(isWritableSourcePath("./content/world/file.md")).toBe(false);
  });

  it("rejects backslash (Windows-style) paths", () => {
    expect(isWritableSourcePath("content\\world\\file.md")).toBe(false);
  });

  it("rejects non-.yaml extension in _atlas branch", () => {
    expect(isWritableSourcePath("content/world/_atlas/config.json")).toBe(false);
  });
});

describe("isWritableAssetPath", () => {
  it("accepts public/atlas/assets/maps/<file>.png", () => {
    expect(isWritableAssetPath("public/atlas/assets/maps/region.png")).toBe(true);
  });

  it("accepts public/atlas/assets/images/<file>.jpg", () => {
    expect(isWritableAssetPath("public/atlas/assets/images/portrait.jpg")).toBe(true);
  });

  it("accepts .gif extension (animated portraits/tokens are valid)", () => {
    expect(isWritableAssetPath("public/atlas/assets/images/token.gif")).toBe(true);
  });

  it("rejects empty string", () => {
    expect(isWritableAssetPath("")).toBe(false);
  });

  it("rejects absolute path", () => {
    expect(isWritableAssetPath("/public/atlas/assets/maps/x.png")).toBe(false);
  });

  it("rejects audio bucket (only maps and images are writable)", () => {
    expect(isWritableAssetPath("public/atlas/assets/audio/theme.png")).toBe(false);
  });

  it("rejects non-image extension", () => {
    expect(isWritableAssetPath("public/atlas/assets/maps/x.yaml")).toBe(false);
  });

  it("rejects sub-directory (must be exactly 5 path parts)", () => {
    expect(isWritableAssetPath("public/atlas/assets/maps/sub/x.png")).toBe(false);
  });
});
