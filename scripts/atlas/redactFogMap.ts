/**
 * Build-time fog redaction: takes a map layer's image bytes, builds a fog
 * mask from the reveals/conceals in the image's own pixel space, softens its
 * edge into the lit side only, and folds it into the image's alpha
 * (min with the source alpha). Result: fogged pixels are transparent, lit
 * pixels keep their own alpha, with a soft band in between.
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
  /** Degrees; fog redaction only supports 0 or undefined. */
  rotation?: number;
}

/** sharp refuses a blur sigma above this. */
const MAX_BLUR_SIGMA = 1000;

/**
 * Apply a feathered fog alpha mask to a single layer image.
 *
 * The mask is computed in the image's own pixel space: each image pixel maps
 * to a spot in the layer's rect on the map (offset and scale), and fog is
 * tested there. The map size is not used to size any buffer, so a big map with
 * a small image stays cheap.
 *
 * Output alpha = min(source alpha, fog mask): an already transparent pixel
 * never gets more opaque, and every pixel whose centre is fogged is 0.
 *
 * @param imageBuffer raw bytes of the layer (PNG/JPEG/WebP; sharp decodes)
 * @param _mapSize    map dimensions (kept for the call site; unused)
 * @param fog         the FogOverlay (caller skips disabled-fog maps)
 * @param layer       the layer's position+size on the map, in map units
 * @returns PNG buffer (RGBA) at the source image's size
 * @throws FogRedactionError if the layer is tiled, its rect is empty, or the
 *         feather is wider than sharp can blur
 */
export async function redactLayer(
  imageBuffer: Buffer,
  _mapSize: MapSize,
  fog: FogOverlay,
  layer: LayerRect,
): Promise<Buffer> {
  if (layer.tileSrc) {
    throw new FogRedactionError(
      `Tiled layer is not supported for fog redaction (layer rect ${JSON.stringify(layer)}).`,
    );
  }
  if (layer.rotation !== undefined && layer.rotation !== 0) {
    throw new FogRedactionError(
      `Layer rotation is not supported by fog redaction (rotation ${layer.rotation}); the mask would not line up with the image.`,
    );
  }
  if (!(layer.width > 0 && layer.height > 0)) {
    throw new FogRedactionError(`Layer rect has no area (${JSON.stringify(layer)}).`);
  }

  const featherPx = fog.featherPx ?? DEFAULT_FEATHER_PX;
  // sigma = featherPx/2 makes the visible feather span ~3·sigma ≈ 1.5·featherPx
  // image pixels. Clamped at 0.3 to avoid a no-op blur.
  const blurSigma = Math.max(0.3, featherPx / 2);
  if (!(blurSigma <= MAX_BLUR_SIGMA)) {
    throw new FogRedactionError(
      `featherPx ${featherPx} is wider than the build can blur (max ${MAX_BLUR_SIGMA * 2}).`,
    );
  }

  // Decode once to RGBA so the source alpha is a channel we can combine with.
  const src = await sharp(imageBuffer)
    .toColourspace("srgb")
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width: iw, height: ih, channels } = src.info;
  if (channels !== 4) {
    throw new FogRedactionError(`Expected an RGBA decode, got ${channels} channels.`);
  }

  const { reveals, conceals } = effectivePolygons(fog);

  // Fail closed (R-07b): no fogged pixel may show image, whatever the feather.
  // A pixel counts as lit only when BOTH
  //   (a) its centre is lit by the same test as isLit (scanline, exact), and
  //   (b) the rasterized reveal-minus-conceal shape covers it fully (255),
  // so an edge pixel, or a fog sliver thinner than a pixel, is fog. The blur
  // then only darkens: mask = min(hard, blurred), so the feather softens into
  // the lit side and fog stays 0 however small the fog shape or gap.
  const centre = centreLitMask(iw, ih, layer, reveals, conceals);
  const cover = await coverageMask(iw, ih, layer, reveals, conceals);
  // Lit only if centre lit AND fully covered: both are required, so neither may be dropped alone.
  const hard = Buffer.alloc(iw * ih);
  for (let i = 0; i < hard.length; i++) hard[i] = centre[i] === 1 && cover[i] === 255 ? 255 : 0;
  const blurred = await sharp(hard, { raw: { width: iw, height: ih, channels: 1 } })
    .blur(blurSigma)
    .extractChannel(0)
    .raw()
    .toBuffer();

  // Alpha alone is not redaction: a PNG keeps RGB under alpha 0, so stripping
  // alpha would bring the fogged image back. Premultiply by the mask (RGB ×
  // m/255): fog is RGB 0 and the feather carries only scaled colour. Any
  // pixel left at alpha 0 (fog, or transparent in the source) is zeroed whole,
  // which check-fog-safety's 27 relies on.
  const px = src.data;
  for (let i = 0, a = 3; i < hard.length; i++, a += 4) {
    const m = Math.min(hard[i], blurred[i]);
    if (m < 255) {
      px[a - 3] = Math.floor((px[a - 3] * m) / 255);
      px[a - 2] = Math.floor((px[a - 2] * m) / 255);
      px[a - 1] = Math.floor((px[a - 1] * m) / 255);
    }
    if (m < px[a]) px[a] = m;
    if (px[a] === 0) px[a - 3] = px[a - 2] = px[a - 1] = 0;
  }

  return sharp(px, { raw: { width: iw, height: ih, channels: 4 } })
    .png()
    .toBuffer();
}

/** Map position of an image pixel's centre along one axis. */
function centreOf(i: number, size: number, origin: number, extent: number): number {
  return origin + ((i + 0.5) * extent) / size;
}

/**
 * 1 where the pixel centre is lit, else 0. Same rule as isLit (even-odd
 * ray cast, from geometry/polygon.ts): inside some reveal and no conceal.
 * Row by row, so the cost is rows × edges + pixels × shapes.
 */
function centreLitMask(
  iw: number,
  ih: number,
  layer: LayerRect,
  reveals: Point[][],
  conceals: Point[][],
): Uint8Array {
  const out = new Uint8Array(iw * ih);
  const xs = new Float64Array(iw);
  for (let c = 0; c < iw; c++) xs[c] = centreOf(c, iw, layer.x, layer.width);
  const inReveal = new Uint8Array(iw);
  const inConceal = new Uint8Array(iw);
  for (let r = 0; r < ih; r++) {
    const y = centreOf(r, ih, layer.y, layer.height);
    inReveal.fill(0);
    inConceal.fill(0);
    for (const p of reveals) markInside(p, y, xs, inReveal);
    for (const p of conceals) markInside(p, y, xs, inConceal);
    const row = r * iw;
    for (let c = 0; c < iw; c++) out[row + c] = inReveal[c] === 1 && inConceal[c] === 0 ? 1 : 0;
  }
  return out;
}

/**
 * Set mark[c] = 1 for every column whose centre xs[c] is inside `poly` on the
 * line at `y`. pointInPolygon is inside iff an odd number of edge crossings
 * lie strictly right of x; the crossings are computed with the same formula.
 */
function markInside(poly: Point[], y: number, xs: Float64Array, mark: Uint8Array): void {
  const hits: number[] = [];
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i],
      [xj, yj] = poly[j];
    if (yi > y !== yj > y) hits.push(((xj - xi) * (y - yi)) / (yj - yi) + xi);
  }
  if (hits.length === 0) return;
  hits.sort((a, b) => a - b);
  // Walk columns left to right; k = crossings at or left of x.
  let k = 0;
  for (let c = 0; c < xs.length; c++) {
    const x = xs[c];
    while (k < hits.length && hits[k] <= x) k++;
    if ((hits.length - k) % 2 === 1) mark[c] = 1;
  }
}

/** Rasterized coverage (0-255) of reveal-minus-conceal, at image size. */
async function coverageMask(
  iw: number,
  ih: number,
  layer: LayerRect,
  reveals: Point[][],
  conceals: Point[][],
): Promise<Buffer> {
  const svg = buildMaskSvg(iw, ih, layer, reveals, conceals);
  const raw = await sharp(Buffer.from(svg))
    .toColourspace("b-w")
    .extractChannel(0)
    .raw()
    .toBuffer({ resolveWithObject: true });
  if (raw.info.width !== iw || raw.info.height !== ih) {
    throw new FogRedactionError(
      `Fog mask rasterized at ${raw.info.width}x${raw.info.height}, expected ${iw}x${ih}.`,
    );
  }
  return raw.data;
}

function buildMaskSvg(
  iw: number,
  ih: number,
  layer: LayerRect,
  reveals: Point[][],
  conceals: Point[][],
): string {
  // Map coords → image pixels: subtract the layer origin, scale to the image.
  const sx = iw / layer.width;
  const sy = ih / layer.height;
  const pathFor = (poly: Point[]): string =>
    poly
      .map(([x, y], i) => `${i === 0 ? "M" : "L"} ${(x - layer.x) * sx} ${(y - layer.y) * sy}`)
      .join(" ") + " Z";
  // evenodd matches pointInPolygon for self-crossing shapes.
  const revealPaths = reveals
    .map((p) => `<path d="${pathFor(p)}" fill="white" fill-rule="evenodd" />`)
    .join("");
  const concealPaths = conceals
    .map((p) => `<path d="${pathFor(p)}" fill="black" fill-rule="evenodd" />`)
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${iw}" height="${ih}" viewBox="0 0 ${iw} ${ih}">
  <rect width="${iw}" height="${ih}" fill="black" />
  ${revealPaths}${concealPaths}
</svg>`;
}
