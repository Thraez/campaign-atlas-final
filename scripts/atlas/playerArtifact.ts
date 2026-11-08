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

/** The built site keeps atlas.json in `<dir>/atlas/`; the source store at `<dir>/`. */
export type ArtifactLayout = "built-site" | "store";

export interface PlayerAtlas {
  /** The dir holding atlas.json (and search-index.json beside it). */
  atlasDir: string;
  atlasJson: string;
  layout: ArtifactLayout;
}

/**
 * The player atlas.json in `dir` for the given layout, or null when it is not
 * there. With no layout (a scan run by hand), either one is accepted, the
 * store's first; the scan registry always passes the layout.
 */
export function locatePlayerAtlas(dir: string, layout?: ArtifactLayout): PlayerAtlas | null {
  const layouts: ArtifactLayout[] = layout ? [layout] : ["store", "built-site"];
  for (const l of layouts) {
    const atlasJson = playerAtlasJsonPath(dir, l);
    if (fs.existsSync(atlasJson)) {
      return { atlasDir: path.dirname(atlasJson), atlasJson, layout: l };
    }
  }
  return null;
}

/** Where atlas.json must be in `dir` for the layout, whether or not it is there. */
export function playerAtlasJsonPath(dir: string, layout: ArtifactLayout): string {
  return path.join(layout === "built-site" ? path.join(dir, "atlas") : dir, "atlas.json");
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
 * Every text file (`TEXT_EXTENSIONS`) under `dir`, at any depth, and the dirs
 * that could not be read (each skipped with a warning naming `scan`; a scan
 * that must fail closed fails on them).
 */
export function listTextFiles(
  dir: string,
  scan: string,
): { files: string[]; unreadable: string[] } {
  const out: string[] = [];
  const unreadable: string[] = [];
  const walk = (d: string) => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch (err) {
      console.warn(`${scan}: skipped unreadable dir ${d}: ${(err as Error).message}`);
      unreadable.push(d);
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
  return { files: out, unreadable };
}
