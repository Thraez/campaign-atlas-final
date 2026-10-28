/**
 * Asset references: the shared vocabulary of the asset auditor
 * (`audit-assets.ts`) and the player-image rule (`playerImageRefs.ts`), so the
 * two read references and image types the same way.
 */
import {
  DEFAULT_RESOLVE_ASSET,
  extractImageEmbedFilenames,
} from "../../src/atlas/content/renderEntityMarkdown";

/**
 * Every file type treated as an image: whatever the player renders
 * (`IMAGE_EXT_RE` in renderEntityMarkdown.ts) plus any other type a browser
 * can show. The player build prunes, and the image-privacy scan checks, all of
 * these, so a DM image in an unusual format is never skipped.
 */
export const IMAGE_EXTENSIONS: ReadonlySet<string> = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".gif",
  ".svg",
  ".avif",
  ".bmp",
  ".tif",
  ".tiff",
  ".ico",
]);

/** True for URLs we do not own (http/https/data/blob). */
export function isExternalUrl(raw: string): boolean {
  return /^(https?:|data:|blob:)/i.test(raw);
}

/**
 * Normalize an asset reference for comparison with disk records.
 * Strips leading slashes and converts backslashes to forward slashes.
 * Returns null for external URLs and empty strings.
 */
export function normalizeRefPath(raw: string): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (isExternalUrl(trimmed)) return null;
  return trimmed.replace(/\\/g, "/").replace(/^\/+/, "");
}

/**
 * Extract Obsidian image embed references: `![[image.png]]` or
 * `![[image.png|Alt text]]`, resolved the same way `DEFAULT_RESOLVE_ASSET`
 * does in renderEntityMarkdown.ts (`/atlas/assets/images/<filename>`) so the
 * reference lines up with what the build actually ships. Filename extraction
 * is imported from renderEntityMarkdown.ts rather than duplicated here — a
 * second copy of the embed regex is what let the auditor and build-atlas.ts
 * silently drift apart (T1, 2026-08-25).
 */
export function extractEmbedImageRefs(markdown: string): string[] {
  return extractImageEmbedFilenames(markdown).map((filename) => DEFAULT_RESOLVE_ASSET(filename));
}
