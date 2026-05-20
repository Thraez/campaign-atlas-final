/**
 * Build-time fog redaction: takes a map layer's image bytes, builds an SVG
 * mask from the fog reveals/conceals, blurs the mask edge for a soft feather,
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

export interface MapSize { width: number; height: number; }
export interface LayerRect { x: number; y: number; width: number; height: number; tileSrc?: string; }

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
  layer: LayerRect
): Promise<Buffer> {
  if (layer.tileSrc) {
    throw new FogRedactionError(
      `Tiled layer is not supported for fog redaction (layer rect ${JSON.stringify(layer)}).`
    );
  }

  const featherPx = fog.featherPx ?? DEFAULT_FEATHER_PX;
  // sigma = featherPx/2 makes the visible feather span ~3·sigma ≈ 1.5·featherPx pixels.
  // Clamped at 0.3 to avoid no-op blur.
  const blurSigma = Math.max(0.3, featherPx / 2);
  const { reveals, conceals } = effectivePolygons(fog);

  // Build SVG mask at MAP size: black background, reveals filled white,
  // conceals filled black on top. Blur applied via SVG filter so the
  // edge feathers across ~featherPx pixels.
  const svg = buildMaskSvg(mapSize, reveals, conceals, blurSigma);

  // Rasterize mask at map size, extract the layer's portion, convert to
  // single-channel (greyscale) to use as the alpha channel.
  const maskPng = await sharp(Buffer.from(svg)).png().toBuffer();
  const layerMask = await sharp(maskPng)
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

function buildMaskSvg(
  mapSize: MapSize,
  reveals: Point[][],
  conceals: Point[][],
  blurSigma: number
): string {
  const pathFor = (poly: Point[]): string =>
    poly.map(([x, y], i) => `${i === 0 ? "M" : "L"} ${x} ${y}`).join(" ") + " Z";

  const revealPaths = reveals.map((p) => `<path d="${pathFor(p)}" fill="white" />`).join("");
  const concealPaths = conceals.map((p) => `<path d="${pathFor(p)}" fill="black" />`).join("");

  // The filter extends 20% beyond the SVG viewport on each side so blur
  // near the edges isn't clipped.
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${mapSize.width}" height="${mapSize.height}" viewBox="0 0 ${mapSize.width} ${mapSize.height}">
  <defs>
    <filter id="feather" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="${blurSigma}" />
    </filter>
  </defs>
  <rect width="${mapSize.width}" height="${mapSize.height}" fill="black" />
  <g filter="url(#feather)">${revealPaths}${concealPaths}</g>
</svg>`;
}
