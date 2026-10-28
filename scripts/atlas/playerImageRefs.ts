/**
 * Which images the player site actually shows. The player build prunes every
 * image under `atlas/assets/` that this module does not count as shown, and
 * the image-privacy scan uses the same answer on the source asset store.
 *
 * An image counts as shown when the parsed player JSON names its whole asset
 * path, never by a substring or a bare file name: a DM-only `elf.png` must not
 * ride along with a shown `shelf.png`, nor `images/x.png` with `maps/x.png`.
 *
 * Asset paths here are relative to the atlas dir (the one holding atlas.json),
 * e.g. `assets/maps/world.png`. References are collected from every string
 * value in the JSON:
 *   - URL-like paths through `atlas/assets/` (`atlas/assets/...`, with or
 *     without a leading `/` or `./`, behind a site base prefix, with a query or
 *     hash, URL-encoded), whether the whole value or inside markdown or HTML;
 *   - bare `![[name.png]]` embeds, which the player resolves the way the build
 *     does (`DEFAULT_RESOLVE_ASSET`, always `assets/images/<name>`).
 */
import fs from "node:fs";
import path from "node:path";
import {
  DEFAULT_RESOLVE_ASSET,
  extractImageEmbedFilenames,
} from "../../src/atlas/content/renderEntityMarkdown";

export const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"]);

/** A path through `atlas/assets/` inside a longer string (markdown, HTML). */
const EMBEDDED_ASSET_URL = /[^\s"'()<>[\]]*atlas\/assets\/[^\s"'()<>]+/g;

/** The asset path a URL-like value points at, or null when it is not one of ours. */
export function toAssetPath(value: string): string | null {
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return null; // http:, data:, blob:, ...
  let v = value.replace(/[?#].*$/, "");
  try {
    v = decodeURIComponent(v);
  } catch {
    // Not valid percent-encoding: match the value as written.
  }
  const m = /(?:^|\/)atlas\/(assets\/.+)$/.exec(v.trim());
  if (!m) return null;
  const p = path.posix.normalize(m[1]);
  return p.startsWith("assets/") ? p : null;
}

function collectFromString(s: string, refs: Set<string>): void {
  const add = (v: string) => {
    const p = toAssetPath(v);
    if (p) refs.add(p);
  };
  add(s);
  for (const m of s.matchAll(EMBEDDED_ASSET_URL)) add(m[0]);
  for (const name of extractImageEmbedFilenames(s)) add(DEFAULT_RESOLVE_ASSET(name));
}

/** Every asset path the given player JSON texts reference. */
export function collectImageRefs(jsonTexts: string[]): Set<string> {
  const refs = new Set<string>();
  const walk = (v: unknown): void => {
    if (typeof v === "string") collectFromString(v, refs);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  for (const text of jsonTexts) walk(JSON.parse(text));
  return refs;
}

/** The references in every `.json` file directly in `dir` (atlas.json, search-index.json). */
export function readPlayerImageRefs(dir: string): Set<string> {
  if (!fs.existsSync(dir)) return new Set();
  return collectImageRefs(
    fs
      .readdirSync(dir)
      .filter((n) => n.endsWith(".json"))
      .map((n) => fs.readFileSync(path.join(dir, n), "utf8")),
  );
}

/** Whether the image at `assetPath` (relative to the atlas dir) is shown. */
export function isReferenced(assetPath: string, refs: Set<string>): boolean {
  return refs.has(path.posix.normalize(assetPath.split(path.sep).join("/")));
}
