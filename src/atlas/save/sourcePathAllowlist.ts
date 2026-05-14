/**
 * Path allowlist for the dev-only local FS save endpoint.
 *
 * Only narrowly-scoped source files are writable. This module is the single
 * source of truth used by both the browser-side caller and the Vite plugin
 * server, so a malicious or buggy client cannot widen the surface.
 *
 * Allowed shapes (case-sensitive):
 *   content/<segments>/_atlas/<file>.yaml
 *   content/<segments>/_atlas/<file>.yml
 *   content/<segments>/<file>.md
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