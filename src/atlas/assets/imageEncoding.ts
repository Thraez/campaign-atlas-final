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
 * Ceiling on the width of a published image, applied `withoutEnlargement` so
 * smaller art is never upscaled. Portraits display at roughly 500px, so this
 * comfortably covers 2x displays; it is a guard against a future 4000px drop
 * bloating the player payload, not a resize of the art we have today.
 */
export const MAX_IMAGE_WIDTH = 1600;

/** Formats worth converting: lossless/legacy stills that WebP shrinks hard. */
const CONVERTIBLE = new Set(["png", "jpeg", "jpg"]);

/**
 * Reduce ".PNG", "png" or "image/png" to a bare lowercase subtype.
 * Anything with parameters or structure we don't recognise falls through as-is
 * and simply won't match CONVERTIBLE.
 */
function normalizeFormat(mimeOrExt: string): string {
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
