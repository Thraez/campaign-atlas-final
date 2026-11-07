/**
 * Where things are in a player artifact, for the publish scans.
 *
 * The scan registry (`scanRegistry.ts`) hands each scan one of two dirs:
 *   - the built site, `dist`, with the player JSON in `dist/atlas/atlas.json`;
 *   - the source store, `public/atlas`, with it in `public/atlas/atlas.json`.
 * Either way the "atlas dir" is the one holding atlas.json. Asset paths in the
 * JSON are site-root relative (`atlas/assets/maps/world.fog.png`), so they
 * resolve against the atlas dir through `toAssetPath`, never `path.join(dir, src)`.
 */
import fs from "node:fs";
import path from "node:path";
import { toAssetPath } from "./playerImageRefs";

export interface PlayerAtlas {
  /** The dir holding atlas.json (and search-index.json beside it). */
  atlasDir: string;
  atlasJson: string;
}

/** The player atlas.json in `dir` (the store layout) or `dir/atlas` (the built site), else null. */
export function locatePlayerAtlas(dir: string): PlayerAtlas | null {
  for (const atlasDir of [dir, path.join(dir, "atlas")]) {
    const atlasJson = path.join(atlasDir, "atlas.json");
    if (fs.existsSync(atlasJson)) return { atlasDir, atlasJson };
  }
  return null;
}

/** The file a site-root asset URL (`atlas/assets/…`) points at, or null when it is not one of ours. */
export function resolveAssetFile(atlasDir: string, src: string): string | null {
  const rel = toAssetPath(src);
  return rel === null ? null : path.join(atlasDir, rel);
}

/** File types the text scans read. */
export const TEXT_EXTENSIONS = new Set([
  ".html",
  ".js",
  ".mjs",
  ".cjs",
  ".css",
  ".json",
  ".txt",
  ".xml",
  ".webmanifest",
  ".svg",
  ".md",
]);

/**
 * Every text file (`TEXT_EXTENSIONS`) under `dir`, at any depth. A dir that
 * cannot be read is skipped with a warning naming `scan`.
 */
export function listTextFiles(dir: string, scan: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch (err) {
      console.warn(`${scan}: skipped unreadable dir ${d}: ${(err as Error).message}`);
      return;
    }
    for (const e of entries) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.isFile() && TEXT_EXTENSIONS.has(path.extname(e.name).toLowerCase())) {
        out.push(full);
      }
    }
  };
  walk(dir);
  return out;
}
