/**
 * What a player build may contain under its `atlas/` dir (eval-2026-10/40).
 *
 * Vite copies all of `public/atlas/` into `dist/`, and `public/atlas/` is also
 * the DM's store, so any file dropped there (a `world.yaml` with fog polygons,
 * a note) would ship. This is the one allowlist: the prune plugin removes
 * everything else from the player output, and `check-player-files` fails a
 * build that still has anything else. Paths are relative to the atlas dir,
 * forward slashes, e.g. `assets/maps/world.fog.png`.
 *
 * Allowed:
 *   - the JSON the player fetches: `atlas.json` and `search-index.json`
 *     (`src/atlas/content/loader.ts`) and `.last-published.json`
 *     (`SearchPalette`'s "recently revealed", written by `atlas:snapshot`);
 *   - images anywhere under the atlas dir except `assets/audio/`, of any type
 *     in `IMAGE_EXTENSIONS` (fog masks and map layers are images); which
 *     images may ship is the image prune's call;
 *   - content-hashed audio directly in `assets/audio/` that `atlas.json`
 *     references (a sound area's bed `src` or `srcFallback`), whatever its
 *     extension. Not the audio `manifest.json`: only the editor reads it, and
 *     it lists the DM's source bed names. Not the source-named beds either;
 *   - empty `.gitkeep` placeholders.
 */
import fs from "node:fs";
import path from "node:path";
import { IMAGE_EXTENSIONS } from "./assetRefs";
import { HASHED_NAME } from "./hashAudioAssets";
import { toAssetPath } from "./playerImageRefs";

const ATLAS_JSON = new Set(["atlas.json", "search-index.json", ".last-published.json"]);

/**
 * True when a player build may ship `rel` (a path relative to its atlas dir)
 * of `size` bytes. `audioRefs` is the audio the player `atlas.json`
 * references (see `readPlayerAudioRefs`).
 */
export function isAllowedPlayerFile(
  rel: string,
  size: number,
  audioRefs: ReadonlySet<string>,
): boolean {
  const parts = rel.split("/");
  const name = parts[parts.length - 1];
  if (name === ".gitkeep") return size === 0;
  if (parts.length === 1 && ATLAS_JSON.has(name)) return true;
  if (parts[0] === "assets" && parts[1] === "audio") {
    return parts.length === 3 && HASHED_NAME.test(name) && audioRefs.has(rel);
  }
  return IMAGE_EXTENSIONS.has(path.extname(name).toLowerCase());
}

/**
 * The audio paths (relative to `atlasDir`) the player `atlas.json` there
 * references: every map's sound-area bed `src` and `srcFallback`. Empty when
 * there is no `atlas.json`; throws, naming the file, when it is not valid JSON.
 */
export function readPlayerAudioRefs(atlasDir: string): Set<string> {
  const refs = new Set<string>();
  const file = path.join(atlasDir, "atlas.json");
  if (!fs.existsSync(file)) return refs;
  let atlas: { maps?: { soundscape?: { areas?: { bed?: Record<string, unknown> }[] } }[] };
  try {
    atlas = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (err) {
    throw new Error(`player JSON ${file} is not valid JSON: ${(err as Error).message}`);
  }
  for (const map of atlas.maps ?? []) {
    for (const area of map.soundscape?.areas ?? []) {
      for (const src of [area.bed?.src, area.bed?.srcFallback]) {
        const p = typeof src === "string" ? toAssetPath(src) : null;
        if (p) refs.add(p);
      }
    }
  }
  return refs;
}

/** Every file under `atlasDir` the allowlist refuses, relative and sorted. [] when absent. */
export function disallowedPlayerFiles(atlasDir: string): string[] {
  if (!fs.existsSync(atlasDir)) return [];
  const audioRefs = readPlayerAudioRefs(atlasDir);
  return fs
    .readdirSync(atlasDir, { recursive: true, withFileTypes: true })
    .filter((e) => !e.isDirectory())
    .map((e) => path.join(e.parentPath, e.name))
    .filter((abs) => {
      const rel = path.relative(atlasDir, abs).split(path.sep).join("/");
      return !isAllowedPlayerFile(rel, fs.lstatSync(abs).size, audioRefs);
    })
    .map((abs) => path.relative(atlasDir, abs).split(path.sep).join("/"))
    .sort();
}
