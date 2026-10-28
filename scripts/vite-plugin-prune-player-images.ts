/**
 * Vite build plugin: drop images the player site never shows from `dist/`,
 * and every file the player allowlist (`atlas/playerFiles.ts`) refuses.
 *
 * Vite copies all of `public/` into `dist/`, and `public/atlas/assets/` is
 * also the DM's asset store: a portrait of a dm-only NPC saved there shipped
 * to players even though no player note embeds it. This plugin removes, from
 * the OUTPUT only, every image under `dist/atlas/assets/` that the player JSON
 * in `dist/atlas/` does not name by its whole path (see `playerImageRefs`).
 * `public/` is untouched, so the editor keeps every image.
 *
 * Before that it removes from `dist/atlas/` every file that is not on the
 * player allowlist (a `world.yaml`, a note, a stray JSON): the fail-safe half
 * of eval-2026-10/40. `check-player-files` is the fail-closed half.
 *
 * Scope and ordering match `prunePlayerAudioPlugin`: player builds only,
 * `apply: "build"`, and `closeBundle` with `enforce: "post"`, after the public
 * copy and the PWA precache (whose globs never match images anyway). The
 * image prune leaves audio to the audio plugin; source-named beds are also off
 * the allowlist, so whichever plugin runs first removes them.
 */
import fs from "node:fs";
import path from "node:path";
import type { Plugin, Logger } from "vite";
import { IMAGE_EXTENSIONS, isReferenced, readPlayerImageRefs } from "./atlas/playerImageRefs";
import { disallowedPlayerFiles } from "./atlas/playerFiles";

const ATLAS_DIR = "atlas";
const ASSETS_DIR = "atlas/assets";

/**
 * Delete every image under `assetsDir` (the atlas dir's `assets/`) that is not
 * in `refs`, the asset paths the player JSON names. Returns the removed paths
 * (relative to `assetsDir`) and the bytes freed. No-op when the directory is
 * absent.
 */
export function pruneUnreferencedImages(
  assetsDir: string,
  refs: Set<string>,
): { removed: string[]; bytes: number } {
  const removed: string[] = [];
  let bytes = 0;
  if (!fs.existsSync(assetsDir)) return { removed, bytes };
  for (const entry of fs.readdirSync(assetsDir, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue;
    if (!IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) continue;
    const abs = path.join(entry.parentPath, entry.name);
    if (isReferenced(path.join("assets", path.relative(assetsDir, abs)), refs)) continue;
    bytes += fs.statSync(abs).size;
    fs.rmSync(abs);
    removed.push(path.relative(assetsDir, abs).split(path.sep).join("/"));
  }
  return { removed, bytes };
}

/**
 * Delete every file under `atlasDir` the player allowlist refuses. Returns the
 * removed paths (relative to `atlasDir`). No-op when the directory is absent.
 */
export function pruneDisallowedFiles(atlasDir: string): string[] {
  const removed = disallowedPlayerFiles(atlasDir);
  for (const rel of removed) fs.rmSync(path.join(atlasDir, rel));
  return removed;
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
      const log = (msg: string) => (logger ? logger.info(msg) : console.log(msg));
      const dropped = pruneDisallowedFiles(path.join(out, ATLAS_DIR));
      log(
        `atlas-prune-player-images: removed ${dropped.length} file(s) not on the player allowlist from ${outDir}/${ATLAS_DIR}` +
          (dropped.length ? `: ${dropped.join(", ")}` : ""),
      );
      const refs = readPlayerImageRefs(path.join(out, ATLAS_DIR));
      const { removed, bytes } = pruneUnreferencedImages(path.join(out, ASSETS_DIR), refs);
      const msg = `atlas-prune-player-images: removed ${removed.length} image(s) no player note shows from ${outDir}/${ASSETS_DIR} (${(
        bytes / 1024
      ).toFixed(1)} KiB)`;
      log(msg);
    },
  };
}
