// Shared image-encoding policy: the single answer to "what format does a
// published image take, and what is it called".
//
// This module exists because the encode rules used to be duplicated. The
// editor's image picker (scripts/vite-plugin-atlas-save.ts, asset-binary) and
// the vault-import embed copier (handleVaultImageCopyRequest) each re-encoded
// images to strip metadata, and each independently kept the source format —
// so a 2.3 MB painted PNG stayed a 2.3 MB PNG on both paths. Fixing one would
// have left the other shipping the same bloat.
//
// Kept free of node built-ins (no fs/path), like its neighbour assetSize.ts,
// so the Node scripts and the browser-bundled editor can both import it and
// agree on the target name before a byte is written. `slugify` is a pure
// sibling module and safe on both sides.
import { slugify } from "../content/slugify";

/** WebP quality for converted stills. Visually lossless on painted art. */
export const WEBP_QUALITY = 82;

/**
 * Quality for re-encoding a JPEG or WebP kept in its own format (the metadata
 * strip). Higher than WEBP_QUALITY because the source is already lossy and
 * this pass adds a second generation of loss.
 */
export const REENCODE_QUALITY = 85;

/**
 * Ceiling on the width of a published image, applied `withoutEnlargement` so
 * smaller art is never upscaled. Portraits display at roughly 500px, so this
 * comfortably covers 2x displays; it is a guard against a future 4000px drop
 * bloating the player payload, not a resize of the art we have today.
 */
export const MAX_IMAGE_WIDTH = 1600;

/**
 * Sharp WebP options for a map. Maps are never lossy re-encoded: fog redaction
 * and map labels both smear under a lossy encode. `maps:optimize` and the save
 * pipeline's map branch both encode through scripts/atlas/mapWebp.ts, which
 * uses exactly this. Maps are never resized either; MAX_IMAGE_WIDTH is for
 * portraits, not cartography.
 *
 * libwebp would also want `exact` to keep the RGB under fully transparent
 * pixels, but sharp 0.34 doesn't expose it (it would be silently ignored), so
 * mapWebp.ts checks every pixel and refuses a map that wouldn't survive.
 */
export const MAP_WEBP_OPTIONS = { lossless: true } as const;

/**
 * Whether `maps:optimize` turns a map of this format into a lossless WebP twin.
 *
 * Only PNG, the one lossless source format WebP can hold exactly (8-bit;
 * 16-bit PNGs are the caller's to check). Every other format is left as is;
 * see `mapKeepReason`.
 */
export function shouldConvertMapToWebp(mimeOrExt: string): boolean {
  return normalizeFormat(mimeOrExt) === "png";
}

/**
 * Why a map of this format is published as is, or null when it is a PNG that
 * `maps:optimize` converts. Never re-encode any of these:
 *   - JPG is already lossy: a lossy re-encode adds a second generation of loss,
 *     and a lossless one only makes it bigger;
 *   - WebP is already the target;
 *   - GIF may be animated, and a WebP twin would flatten it to one frame;
 *   - anything else (SVG, unknown) is not ours to guess at.
 */
export function mapKeepReason(mimeOrExt: string): string | null {
  const format = normalizeFormat(mimeOrExt);
  if (format === "png") return null;
  if (format === "jpg" || format === "jpeg") return "JPG map, already lossy; published as is";
  if (format === "webp") return "already WebP";
  if (format === "gif") return "GIF map, may be animated; published as is";
  return `not a raster format maps:optimize converts (${format || "no extension"})`;
}

/** The normalised format of a file name's extension: "Region.PNG" → "png". */
export function formatOfFileName(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot === -1 ? "" : normalizeFormat(name.slice(dot));
}

/** Formats worth converting: lossless/legacy stills that WebP shrinks hard. */
const CONVERTIBLE = new Set(["png", "jpeg", "jpg"]);

/**
 * Reduce ".PNG", "png" or "image/png" to a bare lowercase subtype.
 * Anything with parameters or structure we don't recognise falls through as-is
 * and simply won't match CONVERTIBLE.
 */
export function normalizeFormat(mimeOrExt: string): string {
  const s = mimeOrExt.trim().toLowerCase();
  if (!s) return "";
  const withoutPrefix = s.startsWith("image/") ? s.slice("image/".length) : s;
  return withoutPrefix.startsWith(".") ? withoutPrefix.slice(1) : withoutPrefix;
}

/**
 * Whether an image of this format should be published as WebP.
 *
 * Deliberately false for two cases:
 *   - GIF, because sharp would flatten a multi-frame image to one still frame;
 *   - WebP, which is already the target.
 * Unknown formats are false too — we convert what we understand, never guess.
 */
export function shouldConvertToWebp(mimeOrExt: string): boolean {
  return CONVERTIBLE.has(normalizeFormat(mimeOrExt));
}

/** The same filename with a `.webp` extension. Dots inside the stem survive. */
export function webpTargetName(name: string): string {
  const dot = name.lastIndexOf(".");
  const stem = dot === -1 ? name : name.slice(0, dot);
  return `${stem}.webp`;
}

/**
 * `name` with `-n` before the extension, for the n-th image wanting the same
 * name (`corven-1.webp` → `corven-1-2.webp`). n = 1 is the name itself.
 */
export function suffixedName(name: string, n: number): string {
  if (n === 1) return name;
  const dot = name.lastIndexOf(".");
  return dot === -1 ? `${name}-${n}` : `${name.slice(0, dot)}-${n}${name.slice(dot)}`;
}

/**
 * On-disk name for an image added through the editor's picker.
 *
 * The client decides this *before* the save batch is built, which makes the
 * filename the single instruction the server acts on — the name and the bytes
 * can never disagree. Sibling of `vaultImageTargetName`; between them they
 * cover every way an image enters the atlas.
 *
 * `mimeType` is the primary signal because it is what the server sees in the
 * data URL. Browsers sometimes report an empty `File.type` on a drag-and-drop,
 * so the extension is the fallback rather than silently keeping PNG.
 */
export function editorImageTargetName(fileName: string, mimeType: string): string {
  const dot = fileName.lastIndexOf(".");
  const ext = dot === -1 ? "" : fileName.slice(dot).toLowerCase();
  const stem = dot === -1 ? fileName : fileName.slice(0, dot);
  const base = `${slugify(stem) || "image"}${ext}`;
  return shouldConvertToWebp(mimeType || ext) ? webpTargetName(base) : base;
}
