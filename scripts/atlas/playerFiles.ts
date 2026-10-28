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
 *   - images under `assets/`, of any type in `IMAGE_EXTENSIONS` (fog masks are
 *     `*.fog.png` images); which images may ship is the image prune's call;
 *   - content-hashed audio and `manifest.json` in `assets/audio/` (the
 *     source-named beds are the audio prune's to drop; they are not allowed);
 *   - `.gitkeep` placeholders.
 */
import fs from "node:fs";
import path from "node:path";
import { IMAGE_EXTENSIONS } from "./assetRefs";
import { AUDIO_EXT, HASHED_NAME } from "./hashAudioAssets";

const ATLAS_JSON = new Set(["atlas.json", "search-index.json", ".last-published.json"]);

/** True when a player build may ship `rel` (a path relative to its atlas dir). */
export function isAllowedPlayerFile(rel: string): boolean {
  const parts = rel.split("/");
  const name = parts[parts.length - 1];
  if (name === ".gitkeep") return true;
  if (parts.length === 1) return ATLAS_JSON.has(name);
  if (parts[0] !== "assets") return false;
  if (IMAGE_EXTENSIONS.has(path.extname(name).toLowerCase())) return true;
  if (parts.length === 3 && parts[1] === "audio") {
    return name === "manifest.json" || (HASHED_NAME.test(name) && AUDIO_EXT.test(name));
  }
  return false;
}

/** Every file under `atlasDir` the allowlist refuses, relative and sorted. [] when absent. */
export function disallowedPlayerFiles(atlasDir: string): string[] {
  if (!fs.existsSync(atlasDir)) return [];
  return fs
    .readdirSync(atlasDir, { recursive: true, withFileTypes: true })
    .filter((e) => !e.isDirectory())
    .map((e) => path.relative(atlasDir, path.join(e.parentPath, e.name)).split(path.sep).join("/"))
    .filter((rel) => !isAllowedPlayerFile(rel))
    .sort();
}
