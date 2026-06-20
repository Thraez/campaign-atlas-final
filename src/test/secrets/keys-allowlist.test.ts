import { describe, it, expect } from "vitest";
import { isWritableSourcePath } from "@/atlas/save/sourcePathAllowlist";

describe("keys allowlist", () => {
  it("permits the single fixed DM keys file but not other _dm writes", () => {
    expect(isWritableSourcePath("content/world/_dm/character-keys.yaml")).toBe(true);
    expect(isWritableSourcePath("content/world/_dm/other.yaml")).toBe(false);
    expect(isWritableSourcePath("content/world/_dm/notes.md")).toBe(false);
  });

  it("requires at least content/<world>/_dm/character-keys.yaml depth", () => {
    expect(isWritableSourcePath("content/_dm/character-keys.yaml")).toBe(false);
  });

  it("does not regress existing _atlas yaml paths", () => {
    expect(isWritableSourcePath("content/world/_atlas/world.yaml")).toBe(true);
    expect(isWritableSourcePath("content/world/subfolder/_atlas/config.yml")).toBe(true);
  });

  it("does not regress .md paths", () => {
    expect(isWritableSourcePath("content/world/characters/vesper.md")).toBe(true);
  });
});
