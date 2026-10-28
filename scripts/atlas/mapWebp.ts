/**
 * The one way a map becomes WebP: encode with MAP_WEBP_OPTIONS, then prove
 * the result is pixel-identical (all four channels) before anyone keeps it.
 *
 * Shared by `maps:optimize` (scripts/dev/optimize-maps.ts) and the save
 * pipeline's `.webp` map branch (scripts/vite-plugin-atlas-save.ts). Node-only
 * because it needs sharp; the format rules themselves live in the
 * browser-safe src/atlas/assets/imageEncoding.ts.
 *
 * Why the check: libwebp's lossless mode may rewrite the RGB of fully
 * transparent pixels, and sharp 0.34 has no `exact` option to stop it. A
 * colour-managed PNG can shift too. Rather than trust the encoder, compare.
 */
import sharp from "sharp";
import { MAP_WEBP_OPTIONS } from "../../src/atlas/assets/imageEncoding";

export type MapWebpResult = { ok: true; webp: Buffer } | { ok: false; reason: string };

/** RGBA pixels in sRGB, so a source and its WebP compare like for like. */
async function rgbaOf(bytes: Buffer): Promise<Buffer> {
  return sharp(bytes).toColourspace("srgb").ensureAlpha().raw().toBuffer();
}

/** Encode a lossless source (PNG) as WebP, or say why that would lose pixels. */
export async function encodeMapWebp(source: Buffer): Promise<MapWebpResult> {
  const { depth } = await sharp(source).metadata();
  if (depth !== "uchar") {
    return {
      ok: false,
      reason: `${depth ?? "unknown"}-depth image; WebP is 8-bit, so it would not be lossless`,
    };
  }
  const webp = await sharp(source).webp(MAP_WEBP_OPTIONS).toBuffer();
  if (!(await rgbaOf(webp)).equals(await rgbaOf(source))) {
    return {
      ok: false,
      reason:
        "the WebP would not be pixel-identical (usually colour hidden under fully " +
        "transparent pixels, which the encoder rewrites)",
    };
  }
  return { ok: true, webp };
}
