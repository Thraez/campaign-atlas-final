import { describe, it, expect } from "vitest";
import { normalizeAtlasAssetUrl } from "@/atlas/url";

describe("normalizeAtlasAssetUrl", () => {
  it("passes external https URLs through unchanged", () => {
    const u = "https://example.com/img.webp";
    expect(normalizeAtlasAssetUrl(u, "/repo/")).toBe(u);
  });

  it("passes http URLs through unchanged", () => {
    const u = "http://example.com/img.webp";
    expect(normalizeAtlasAssetUrl(u, "/repo/")).toBe(u);
  });

  it("passes data URLs through unchanged", () => {
    const u = "data:image/png;base64,iVBORw0K";
    expect(normalizeAtlasAssetUrl(u, "/repo/")).toBe(u);
  });

  it("passes blob URLs through unchanged", () => {
    const u = "blob:https://example.com/abc-123";
    expect(normalizeAtlasAssetUrl(u, "/repo/")).toBe(u);
  });

  it("prefixes BASE_URL to absolute /atlas paths", () => {
    expect(normalizeAtlasAssetUrl("/atlas/assets/maps/foo.webp", "/repo/"))
      .toBe("/repo/atlas/assets/maps/foo.webp");
  });

  it("prefixes BASE_URL to relative atlas paths", () => {
    expect(normalizeAtlasAssetUrl("atlas/assets/maps/foo.webp", "/repo/"))
      .toBe("/repo/atlas/assets/maps/foo.webp");
  });

  it("works under root base", () => {
    expect(normalizeAtlasAssetUrl("/atlas/assets/maps/foo.webp", "/"))
      .toBe("/atlas/assets/maps/foo.webp");
  });

  it("normalizes base without trailing slash", () => {
    expect(normalizeAtlasAssetUrl("/atlas/x.webp", "/repo"))
      .toBe("/repo/atlas/x.webp");
  });
});
