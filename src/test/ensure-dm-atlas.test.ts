import { describe, it, expect } from "vitest";
import { isAtlasStale } from "../../scripts/ensure-dm-atlas";

describe("isAtlasStale", () => {
  it("returns true when atlas is missing (null mtime)", () => {
    expect(isAtlasStale(null, 1000)).toBe(true);
  });

  it("returns true when a source file is newer than the atlas", () => {
    expect(isAtlasStale(1000, 2000)).toBe(true);
  });

  it("returns false when atlas is newer than all sources", () => {
    expect(isAtlasStale(2000, 1000)).toBe(false);
  });

  it("returns false when atlas and newest source have the same mtime", () => {
    expect(isAtlasStale(1000, 1000)).toBe(false);
  });
});
