/**
 * Vite build plugin: drop images the player site never shows from `dist/`.
 *
 * Vite copies all of `public/` into `dist/`, and `public/atlas/assets/` is
 * also the DM's asset store: a portrait of a dm-only NPC saved there shipped
 * to players even though no player note embeds it. This plugin removes, from
 * the OUTPUT only, every image under `dist/atlas/assets/` that the player JSON
 * in `dist/atlas/` does not name (see `isReferenced`). `public/` is untouched,
 * so the editor keeps every image.
 *
 * Scope and ordering match `prunePlayerAudioPlugin`: player builds only,
 * `apply: "build"`, and `closeBundle` with `enforce: "post"`, after the public
 * copy and the PWA precache (whose globs never match images anyway). Audio is
 * not an image and is left to the audio plugin.
 */
import fs from "node:fs";
import path from "node:path";
import type { Plugin, Logger } from "vite";
import { IMAGE_EXTENSIONS, isReferenced, readPlayerJson } from "./atlas/playerImageRefs";

const ATLAS_DIR = "atlas";
const ASSETS_DIR = "atlas/assets";

/**
 * Delete every image under `assetsDir` whose file name `playerJson` does not
 * mention. Returns the removed paths (relative to `assetsDir`) and the bytes
 * freed. No-op when the directory is absent.
 */
export function pruneUnreferencedImages(
  assetsDir: string,
  playerJson: string,
): { removed: string[]; bytes: number } {
  const removed: string[] = [];
  let bytes = 0;
  if (!fs.existsSync(assetsDir)) return { removed, bytes };
  for (const entry of fs.readdirSync(assetsDir, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue;
    if (!IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) continue;
    if (isReferenced(entry.name, playerJson)) continue;
    const abs = path.join(entry.parentPath, entry.name);
    bytes += fs.statSync(abs).size;
    fs.rmSync(abs);
    removed.push(path.relative(assetsDir, abs).split(path.sep).join("/"));
  }
  return { removed, bytes };
}

export function prunePlayerImagesPlugin(): Plugin {
  let root = process.cwd();
  let outDir = "dist";
  let logger: Logger | undefined;

  return {
    name: "atlas-prune-player-images",
    apply: "build",
    enforce: "post",
    configResolved(config) {
      root = config.root;
      outDir = config.build.outDir;
      logger = config.logger;
    },
    closeBundle() {
      const out = path.resolve(root, outDir);
      const playerJson = readPlayerJson(path.join(out, ATLAS_DIR));
      const { removed, bytes } = pruneUnreferencedImages(path.join(out, ASSETS_DIR), playerJson);
      const msg = `atlas-prune-player-images: removed ${removed.length} image(s) no player note shows from ${outDir}/${ASSETS_DIR} (${(
        bytes / 1024
      ).toFixed(1)} KiB)`;
      if (logger) logger.info(msg);
      else console.log(msg);
    },
  };
}
