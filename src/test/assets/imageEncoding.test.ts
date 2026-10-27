import { describe, it, expect } from "vitest";
import {
  shouldConvertToWebp,
  webpTargetName,
  editorImageTargetName,
  suffixedName,
  REENCODE_QUALITY,
  WEBP_QUALITY,
  MAX_IMAGE_WIDTH,
  MAP_WEBP_OPTIONS,
  shouldConvertMapToWebp,
  mapKeepReason,
  formatOfFileName,
} from "@/atlas/assets/imageEncoding";

describe("map encoding", () => {
  it("is lossless — maps are never lossy re-encoded", () => {
    expect(MAP_WEBP_OPTIONS).toEqual({ lossless: true });
  });

  it("converts PNG maps only; a JPG map is published as is", () => {
    expect(shouldConvertMapToWebp(".png")).toBe(true);
    expect(shouldConvertMapToWebp("image/png")).toBe(true);
    expect(shouldConvertMapToWebp(".jpg")).toBe(false);
    expect(shouldConvertMapToWebp("jpeg")).toBe(false);
    expect(shouldConvertMapToWebp(".webp")).toBe(false);
  });

  it("gives a reason for every map it keeps, and none for a PNG", () => {
    expect(mapKeepReason(formatOfFileName("Region.PNG"))).toBeNull();
    for (const name of ["Tidemarrow.JPG", "a.jpeg", "b.webp", "c.gif", "d.svg", "noext"]) {
      expect(mapKeepReason(formatOfFileName(name))).toMatch(/\S/);
    }
  });

  it("reads the format from a file name, case and dots aside", () => {
    expect(formatOfFileName("Region.PNG")).toBe("png");
    expect(formatOfFileName("map.v2.webp")).toBe("webp");
    expect(formatOfFileName("noext")).toBe("");
  });
});

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

describe("suffixedName", () => {
  it("leaves the first name alone and numbers the rest before the extension", () => {
    expect(suffixedName("corven-1.webp", 1)).toBe("corven-1.webp");
    expect(suffixedName("corven-1.webp", 2)).toBe("corven-1-2.webp");
    expect(suffixedName("map.v2.png", 3)).toBe("map.v2-3.png");
    expect(suffixedName("noext", 2)).toBe("noext-2");
  });
});

describe("encode settings", () => {
  it("keeps quality in the range that stays visually lossless on painted art", () => {
    expect(WEBP_QUALITY).toBeGreaterThanOrEqual(75);
    expect(WEBP_QUALITY).toBeLessThanOrEqual(90);
  });

  it("re-encodes kept lossy formats no lower than it converts", () => {
    // A JPEG or WebP kept as-is is already lossy; the strip pass adds a second
    // generation, so it must not be harsher than a first-time conversion.
    expect(REENCODE_QUALITY).toBeGreaterThanOrEqual(WEBP_QUALITY);
    expect(REENCODE_QUALITY).toBeLessThanOrEqual(95);
  });

  it("clamps width generously enough for retina but not for a 4000px drop", () => {
    // Portraits render at ~500px; 1600 covers 2x and then some. The clamp is a
    // ceiling for future oversized imports, not a resize of today's art.
    expect(MAX_IMAGE_WIDTH).toBeGreaterThanOrEqual(1200);
    expect(MAX_IMAGE_WIDTH).toBeLessThanOrEqual(2400);
  });
});

// The editor picker names the target file before the save batch is built, so
// this function decides what the DM's upload will be called on disk. It is the
// sibling of vaultImageTargetName; between them they cover every way an image
// enters the atlas.
describe("editorImageTargetName", () => {
  it("publishes a dropped PNG as WebP", () => {
    expect(editorImageTargetName("Corven Portrait.png", "image/png")).toBe("corven-portrait.webp");
  });

  it("publishes a dropped JPEG as WebP", () => {
    expect(editorImageTargetName("tavern.jpg", "image/jpeg")).toBe("tavern.webp");
  });

  it("leaves a GIF alone so animation survives", () => {
    expect(editorImageTargetName("banner.gif", "image/gif")).toBe("banner.gif");
  });

  it("leaves a WebP alone — it is already the target format", () => {
    expect(editorImageTargetName("map.webp", "image/webp")).toBe("map.webp");
  });

  it("falls back to the extension when the browser reports no MIME type", () => {
    // Some browsers hand back an empty File.type for a drag-and-drop. The name
    // must still agree with what the server will encode, so the extension is
    // the fallback signal rather than "give up and keep PNG".
    expect(editorImageTargetName("hero.PNG", "")).toBe("hero.webp");
  });

  it("gives an unnamed file a usable name instead of an empty one", () => {
    expect(editorImageTargetName(".png", "image/png")).toBe("image.webp");
  });

  it("slugifies a name that would otherwise be awkward in a URL", () => {
    expect(editorImageTargetName("Édric's Keep (final).png", "image/png")).toBe(
      "edrics-keep-final.webp",
    );
  });
});
