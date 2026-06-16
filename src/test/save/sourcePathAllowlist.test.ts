import { describe, it, expect } from "vitest";
import path from "node:path";
import { isReadableVaultPath, isReadableLocalAtlasPath } from "@/atlas/save/sourcePathAllowlist";

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
