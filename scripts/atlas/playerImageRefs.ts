/**
 * Which images the player site actually shows. The player build prunes every
 * image under `atlas/` that this module does not count as shown, and the
 * image-privacy scan uses the same answer on the source asset store.
 *
 * An image counts as shown when the parsed player JSON names its whole asset
 * path, never by a substring or a bare file name: a DM-only `elf.png` must not
 * ride along with a shown `shelf.png`, nor `images/x.png` with `maps/x.png`.
 *
 * Asset paths here are relative to the atlas dir (the one holding atlas.json),
 * e.g. `assets/maps/world.png` or `maps/overlay.png`. References are collected
 * from every string value in the JSON, each read as a URL through `atlas/`
 * (with or without a leading `/` or `./`, behind a site base prefix, with a
 * query or hash, URL-encoded):
 *   - the whole value (a map layer `src`, an entity image);
 *   - markdown link and image destinations, `(<...>)` and balanced-paren forms;
 *   - HTML attribute values, quoted or not, and CSS `url(...)` values;
 *   - any other `atlas/` token in the text, as a safety net;
 *   - bare `![[name.png]]` embeds, which the player resolves the way the build
 *     does (`DEFAULT_RESOLVE_ASSET`, always `assets/images/<name>`).
 * An absolute URL to the site's own host (`https://<host>/atlas/assets/...`)
 * is not counted: the build never writes one, and it is treated as external.
 */
import fs from "node:fs";
import path from "node:path";
import { extractEmbedImageRefs, normalizeRefPath } from "./assetRefs";

/**
 * The asset path (relative to the atlas dir) a URL-like value points at, or
 * null when it is not one of ours or escapes the atlas dir.
 */
export function toAssetPath(value: string): string | null {
  const ref = normalizeRefPath(value);
  if (ref === null || /^[a-z][a-z0-9+.-]*:/i.test(ref)) return null; // mailto:, file:, ...
  let v = ref.replace(/[?#].*$/, "");
  try {
    v = decodeURIComponent(v);
  } catch {
    // Not valid percent-encoding: match the value as written.
  }
  const m = /(?:^|\/)atlas\/(.+)$/.exec(v.trim());
  if (!m) return null;
  const p = path.posix.normalize(m[1]);
  return p === "." || p === ".." || p.startsWith("../") ? null : p;
}

/** Destinations of markdown links and images: `](dest)`, `](<dest>)`, `](dest "title")`. */
function markdownDestinations(s: string): string[] {
  const out: string[] = [];
  for (let i = s.indexOf("]("); i !== -1; i = s.indexOf("](", i + 2)) {
    let j = i + 2;
    while (s[j] === " " || s[j] === "\t") j++;
    if (s[j] === "<") {
      const end = s.indexOf(">", j + 1);
      if (end !== -1) out.push(s.slice(j + 1, end));
      continue;
    }
    let depth = 0;
    let k = j;
    for (; k < s.length; k++) {
      const c = s[k];
      if (c === "\\") k++;
      else if (c === "(") depth++;
      else if (c === ")") {
        if (depth === 0) break;
        depth--;
      } else if (/\s/.test(c)) break;
    }
    out.push(s.slice(j, k));
  }
  return out;
}

/** HTML attribute values (quoted or not) and CSS `url(...)` values. */
const HTML_ATTR = /[\w:-]+\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g;
const CSS_URL = /url\(\s*(?:"([^"]*)"|'([^']*)'|([^)"']*?))\s*\)/gi;
/** Any `atlas/` token in free text. */
const ASSET_TOKEN = /[^\s"'()<>[\]]*atlas\/[^\s"'()<>]+/g;

function collectFromString(s: string, refs: Set<string>): void {
  const add = (v: string | undefined) => {
    const p = v === undefined ? null : toAssetPath(v);
    if (p) refs.add(p);
  };
  add(s);
  if (s.includes("atlas/")) {
    markdownDestinations(s).forEach(add);
    for (const m of s.matchAll(HTML_ATTR)) add(m[1] ?? m[2] ?? m[3]);
    for (const m of s.matchAll(CSS_URL)) add(m[1] ?? m[2] ?? m[3]);
    for (const m of s.matchAll(ASSET_TOKEN)) add(m[0]);
  }
  extractEmbedImageRefs(s).forEach(add);
}

function collectFromValue(value: unknown, refs: Set<string>): void {
  if (typeof value === "string") collectFromString(value, refs);
  else if (Array.isArray(value)) value.forEach((v) => collectFromValue(v, refs));
  else if (value && typeof value === "object") {
    Object.values(value).forEach((v) => collectFromValue(v, refs));
  }
}

/** Every asset path the given player JSON texts reference. */
export function collectImageRefs(jsonTexts: string[]): Set<string> {
  const refs = new Set<string>();
  for (const text of jsonTexts) collectFromValue(JSON.parse(text), refs);
  return refs;
}

/**
 * The references in every `.json` file directly in `dir` (atlas.json,
 * search-index.json). A file that is not valid JSON throws, naming the file:
 * guessing at its references could prune a shown image or keep a DM one.
 */
export function readPlayerImageRefs(dir: string): Set<string> {
  const refs = new Set<string>();
  if (!fs.existsSync(dir)) return refs;
  for (const name of fs.readdirSync(dir).filter((n) => n.endsWith(".json"))) {
    const file = path.join(dir, name);
    let parsed: unknown;
    try {
      parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    } catch (err) {
      throw new Error(`player JSON ${file} is not valid JSON: ${(err as Error).message}`);
    }
    collectFromValue(parsed, refs);
  }
  return refs;
}

/** Whether the image at `assetPath` (relative to the atlas dir) is shown. */
export function isReferenced(assetPath: string, refs: Set<string>): boolean {
  return refs.has(path.posix.normalize(assetPath.split(path.sep).join("/")));
}
