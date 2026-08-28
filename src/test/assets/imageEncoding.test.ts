import { describe, it, expect } from "vitest";
import {
  shouldConvertToWebp,
  webpTargetName,
  WEBP_QUALITY,
  MAX_IMAGE_WIDTH,
} from "@/atlas/assets/imageEncoding";

/**
 * The single source of truth for "what format does a published image take".
 *
 * It exists because the two ingest paths (the editor's image picker and the
 * vault-import embed copier) each had their own encode rules, so a fix to one
 * silently left the other shipping 2 MB PNGs. Both now ask this module.
 */
describe("shouldConvertToWebp", () => {
  it("converts PNG, the format that makes painted portraits enormous", () => {
    expect(shouldConvertToWebp("png")).toBe(true);
    expect(shouldConvertToWebp(".png")).toBe(true);
    expect(shouldConvertToWebp("image/png")).toBe(true);
  });

  it("converts JPEG under either spelling", () => {
    expect(shouldConvertToWebp("jpg")).toBe(true);
    expect(shouldConvertToWebp(".jpeg")).toBe(true);
    expect(shouldConvertToWebp("image/jpeg")).toBe(true);
  });

  it("leaves GIF alone so animation survives", () => {
    // sharp would flatten a multi-frame GIF to a single still frame.
    expect(shouldConvertToWebp("gif")).toBe(false);
    expect(shouldConvertToWebp("image/gif")).toBe(false);
  });

  it("leaves an image that is already WebP alone", () => {
    expect(shouldConvertToWebp("webp")).toBe(false);
    expect(shouldConvertToWebp("image/webp")).toBe(false);
  });

  it("refuses anything it does not recognise rather than guessing", () => {
    expect(shouldConvertToWebp("svg")).toBe(false);
    expect(shouldConvertToWebp("image/svg+xml")).toBe(false);
    expect(shouldConvertToWebp("")).toBe(false);
    expect(shouldConvertToWebp("application/pdf")).toBe(false);
  });

  it("ignores case, so a file named Corven.PNG still converts", () => {
    expect(shouldConvertToWebp(".PNG")).toBe(true);
    expect(shouldConvertToWebp("IMAGE/JPEG")).toBe(true);
  });
});

describe("webpTargetName", () => {
  it("swaps the extension", () => {
    expect(webpTargetName("corven.png")).toBe("corven.webp");
    expect(webpTargetName("edric.JPEG")).toBe("edric.webp");
  });

  it("keeps dots that are part of the stem", () => {
    expect(webpTargetName("map.v2.png")).toBe("map.v2.webp");
  });

  it("appends an extension when the name has none", () => {
    expect(webpTargetName("portrait")).toBe("portrait.webp");
  });

  it("leaves a name that is already .webp unchanged", () => {
    expect(webpTargetName("corven.webp")).toBe("corven.webp");
  });
});

describe("encode settings", () => {
  it("keeps quality in the range that stays visually lossless on painted art", () => {
    expect(WEBP_QUALITY).toBeGreaterThanOrEqual(75);
    expect(WEBP_QUALITY).toBeLessThanOrEqual(90);
  });

  it("clamps width generously enough for retina but not for a 4000px drop", () => {
    // Portraits render at ~500px; 1600 covers 2x and then some. The clamp is a
    // ceiling for future oversized imports, not a resize of today's art.
    expect(MAX_IMAGE_WIDTH).toBeGreaterThanOrEqual(1200);
    expect(MAX_IMAGE_WIDTH).toBeLessThanOrEqual(2400);
  });
});
