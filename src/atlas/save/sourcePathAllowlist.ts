/**
 * Path allowlist for the dev-only local FS save endpoint.
 *
 * Only narrowly-scoped source files and map assets are writable. This module
 * is the single source of truth used by both the browser-side caller and the
 * Vite plugin server, so a malicious or buggy client cannot widen the surface.
 *
 * Source-path branch (`isWritableSourcePath`):
 *   content/<segments>/_atlas/<file>.yaml
 *   content/<segments>/_atlas/<file>.yml
 *   content/<segments>/<file>.md
 *
 * Asset-path branch (`isWritableAssetPath`):
 *   public/atlas/assets/maps/<file>.<png|jpg|jpeg|webp|gif>
 *   public/atlas/assets/images/<file>.<png|jpg|jpeg|webp|gif>
 *
 * Note: .gif is intentionally included — animated portraits and tokens are a
 * valid DM use case. The list regex in vite-plugin-atlas-save.ts is kept
 * case-sensitive (no /i flag) to match this allowlist exactly.
 *
 * <segments> is one or more path segments. Traversal (".."), absolute paths,
 * leading "./", empty segments, and any other extension are rejected.
 */

const SEGMENT = /^[A-Za-z0-9_\-. ]+$/;

function hasBadSegments(parts: string[]): boolean {
  if (parts.length === 0) return true;
  for (const p of parts) {
    if (p === "" || p === "." || p === "..") return true;
    if (!SEGMENT.test(p)) return true;
  }
  return false;
}

export function isWritableSourcePath(input: string): boolean {
  if (typeof input !== "string" || input.length === 0) return false;
  // Reject absolute or "./"-prefixed paths up front.
  if (input.startsWith("/") || input.startsWith("./") || input.startsWith("\\")) return false;
  // Reject any backslashes (Windows-style) — repo paths are POSIX.
  if (input.includes("\\")) return false;
  // Reject literal ".." anywhere as a segment.
  const parts = input.split("/");
  if (hasBadSegments(parts)) return false;
  if (parts[0] !== "content") return false;

  // content/<...>/_atlas/<file>.(yaml|yml)
  // content/<...>/<file>.md
  // We need at least: content / seg / file → length >= 3
  if (parts.length < 3) return false;

  const last = parts[parts.length - 1];
  const secondLast = parts[parts.length - 2];

  // _atlas yaml/yml branch
  if (secondLast === "_atlas") {
    if (parts.length < 4) return false; // content/<seg>/_atlas/<file>
    if (!/^[A-Za-z0-9_\-. ]+\.(yaml|yml)$/.test(last)) return false;
    return true;
  }

  // .md branch — last segment must end .md (case-sensitive)
  if (!/^[A-Za-z0-9_\-. ]+\.md$/.test(last)) return false;
  // Disallow _atlas anywhere in the middle for .md files (atlas dir is yaml-only)
  for (let i = 1; i < parts.length - 1; i++) {
    if (parts[i] === "_atlas") return false;
  }
  return true;
}

/**
 * Asset-path allowlist for image uploads (map tiles and entity images).
 * Used by the unified Save when a file carrying a `data:` URL needs to land
 * on disk so the next atlas build can reference it.
 *
 * Allowed prefixes (both same 5-part shape, same extension rules):
 *   public/atlas/assets/maps/<file>.<image-ext>
 *   public/atlas/assets/images/<file>.<image-ext>
 *
 * Note: images/ is intentionally NOT secret-scanned. All files in
 * public/atlas/assets/ are served as static public assets; there is no
 * per-image visibility or DM/player distinction.
 */
export function isWritableAssetPath(input: string): boolean {
  if (typeof input !== "string" || input.length === 0) return false;
  if (input.startsWith("/") || input.startsWith("./") || input.startsWith("\\")) return false;
  if (input.includes("\\")) return false;
  const parts = input.split("/");
  if (hasBadSegments(parts)) return false;
  // Exact 5-part prefix: public/atlas/assets/{maps|images}/<file>.<ext>
  if (parts.length !== 5) return false;
  if (parts[0] !== "public" || parts[1] !== "atlas" || parts[2] !== "assets") return false;
  if (parts[3] !== "maps" && parts[3] !== "images") return false;
  const last = parts[4];
  if (!/^[A-Za-z0-9_\-. ]+\.(png|jpg|jpeg|webp|gif)$/.test(last)) return false;
  return true;
}