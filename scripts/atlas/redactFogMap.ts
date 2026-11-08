/**
 * Build-time fog redaction: takes a map layer's image bytes, builds an SVG
 * mask from the fog reveals/conceals, softens its edge into the lit side only,
 * and joins it as the alpha channel of the image. Result: fogged pixels are
 * transparent, lit pixels opaque, with a soft band in between.
 *
 * Used by scripts/build-atlas.ts in player mode (Phase D).
 */
import sharp from "sharp";
import { effectivePolygons, DEFAULT_FEATHER_PX } from "../../src/atlas/fog/effectiveLit";
import type { FogOverlay, Point } from "../../src/atlas/content/schema";

export { DEFAULT_FEATHER_PX };

export class FogRedactionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FogRedactionError";
  }
}

export interface MapSize {
  width: number;
  height: number;
}
export interface LayerRect {
  x: number;
  y: number;
  width: number;
  height: number;
  tileSrc?: string;
}

/**
 * Apply a feathered fog alpha mask to a single layer image.
 *
 * @param imageBuffer raw bytes of the layer (PNG/JPEG/etc — sharp will decode)
 * @param mapSize     map dimensions (mask is built at this size)
 * @param fog         the FogOverlay (must have enabled=true to redact; caller is
 *                    responsible for skipping disabled-fog maps)
 * @param layer       the layer's position+size on the map; the relevant region
 *                    of the mask is extracted as the alpha
 * @returns PNG buffer with alpha channel applied
 * @throws FogRedactionError if the layer is tiled
 */
export async function redactLayer(
  imageBuffer: Buffer,
  mapSize: MapSize,
  fog: FogOverlay,
  layer: LayerRect,
): Promise<Buffer> {
  if (layer.tileSrc) {
    throw new FogRedactionError(
      `Tiled layer is not supported for fog redaction (layer rect ${JSON.stringify(layer)}).`,
    );
  }

  const featherPx = fog.featherPx ?? DEFAULT_FEATHER_PX;
  // sigma = featherPx/2 makes the visible feather span ~3·sigma ≈ 1.5·featherPx pixels.
  // Clamped at 0.3 to avoid no-op blur.
  const blurSigma = Math.max(0.3, featherPx / 2);
  const { reveals, conceals } = effectivePolygons(fog);

  // Fail closed (R-07b): no fogged pixel may show image, whatever the
  // feather. The hard mask is rasterized at MAP size (black background,
  // reveals white, conceals black on top) and only pixels it covers fully
  // count as lit, so an anti-aliased edge pixel is fog. The blurred copy then
  // only darkens: alpha = min(hard, blurred), so the feather softens into the
  // lit side and fog stays at 0 however small the fog shape or gap.
  const svg = buildMaskSvg(mapSize, reveals, conceals);
  const raw = await sharp(Buffer.from(svg)).toColourspace("b-w").extractChannel(0).raw().toBuffer({
    resolveWithObject: true,
  });
  const { width: mw, height: mh } = raw.info;
  const hard = Buffer.alloc(mw * mh);
  for (let i = 0; i < hard.length; i++) hard[i] = raw.data[i] === 255 ? 255 : 0;
  const blurred = await sharp(hard, { raw: { width: mw, height: mh, channels: 1 } })
    .blur(blurSigma)
    .extractChannel(0)
    .raw()
    .toBuffer();
  const mask = Buffer.alloc(hard.length);
  for (let i = 0; i < mask.length; i++) mask[i] = Math.min(hard[i], blurred[i]);

  // Extract the layer's portion as the single-channel alpha.
  const layerMask = await sharp(mask, { raw: { width: mw, height: mh, channels: 1 } })
    .extract({
      left: Math.round(layer.x),
      top: Math.round(layer.y),
      width: Math.round(layer.width),
      height: Math.round(layer.height),
    })
    .toColourspace("b-w")
    .raw()
    .toBuffer();

  // Apply mask as the alpha channel of the image.
  // joinChannel replaces/adds the alpha channel with the supplied raw buffer.
  const out = await sharp(imageBuffer)
    .ensureAlpha()
    .joinChannel(layerMask, {
      raw: {
        width: Math.round(layer.width),
        height: Math.round(layer.height),
        channels: 1,
      },
    })
    .toColourspace("srgb")
    .png()
    .toBuffer();

  return out;
}

function buildMaskSvg(mapSize: MapSize, reveals: Point[][], conceals: Point[][]): string {
  const pathFor = (poly: Point[]): string =>
    poly.map(([x, y], i) => `${i === 0 ? "M" : "L"} ${x} ${y}`).join(" ") + " Z";

  const revealPaths = reveals.map((p) => `<path d="${pathFor(p)}" fill="white" />`).join("");
  const concealPaths = conceals.map((p) => `<path d="${pathFor(p)}" fill="black" />`).join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${mapSize.width}" height="${mapSize.height}" viewBox="0 0 ${mapSize.width} ${mapSize.height}">
  <rect width="${mapSize.width}" height="${mapSize.height}" fill="black" />
  ${revealPaths}${concealPaths}
</svg>`;
}
