/**
 * Vite build plugin: prune the player `dist/atlas/` down to the files players
 * need. Two passes, both on the OUTPUT only (`public/` is untouched, so the
 * editor keeps everything):
 *
 *   1. Every file off the player allowlist (`atlas/playerFiles.ts`) goes: a
 *      `world.yaml`, a note, a stray JSON, the audio manifest, hashed audio
 *      `atlas.json` does not reference. This is the fail-safe half of
 *      eval-2026-10/40; `check-player-files` is the fail-closed half.
 *   2. Every image anywhere under `dist/atlas/` that the player JSON does not
 *      name by its whole path goes (see `playerImageRefs`). Vite copies all of
 *      `public/` into `dist/`, and `public/atlas/` is also the DM's asset
 *      store: a portrait of a dm-only NPC saved there shipped to players even
 *      though no player note embeds it.
 *
 * Scope and ordering match `prunePlayerAudioPlugin`: player builds only,
 * `apply: "build"`, and `closeBundle` with `enforce: "post"`, after the public
 * copy and the PWA precache. Source-named audio beds are off the allowlist
 * too, so whichever of the two plugins runs first removes them.
 */
import fs from "node:fs";
import path from "node:path";
import type { Plugin, Logger } from "vite";
import { IMAGE_EXTENSIONS } from "./atlas/assetRefs";
import { isReferenced, readPlayerImageRefs } from "./atlas/playerImageRefs";
import { disallowedPlayerFiles } from "./atlas/playerFiles";

const ATLAS_DIR = "atlas";

/**
 * Delete every image under `atlasDir` that is not in `refs`, the asset paths
 * (relative to `atlasDir`) the player JSON names. Returns the removed paths
 * (relative to `atlasDir`) and the bytes freed. No-op when the directory is
 * absent.
 */
export function pruneUnreferencedImages(
  atlasDir: string,
  refs: Set<string>,
): { removed: string[]; bytes: number } {
  const removed: string[] = [];
  let bytes = 0;
  if (!fs.existsSync(atlasDir)) return { removed, bytes };
  for (const entry of fs.readdirSync(atlasDir, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue;
    if (!IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) continue;
    const abs = path.join(entry.parentPath, entry.name);
    const rel = path.relative(atlasDir, abs);
    if (isReferenced(rel, refs)) continue;
    bytes += fs.statSync(abs).size;
    fs.rmSync(abs);
    removed.push(rel.split(path.sep).join("/"));
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

export function prunePlayerFilesPlugin(): Plugin {
  let root = process.cwd();
  let outDir = "dist";
  let logger: Logger | undefined;

  return {
    name: "atlas-prune-player-files",
    apply: "build",
    enforce: "post",
    configResolved(config) {
      root = config.root;
      outDir = config.build.outDir;
      logger = config.logger;
    },
    closeBundle() {
      const atlasDir = path.join(path.resolve(root, outDir), ATLAS_DIR);
      const log = (msg: string) => (logger ? logger.info(msg) : console.log(msg));
      const dropped = pruneDisallowedFiles(atlasDir);
      log(
        `atlas-prune-player-files: removed ${dropped.length} file(s) not on the player allowlist from ${outDir}/${ATLAS_DIR}` +
          (dropped.length ? `: ${dropped.join(", ")}` : ""),
      );
      const refs = readPlayerImageRefs(atlasDir);
      const { removed, bytes } = pruneUnreferencedImages(atlasDir, refs);
      log(
        `atlas-prune-player-files: removed ${removed.length} image(s) no player note shows from ${outDir}/${ATLAS_DIR} (${(
          bytes / 1024
        ).toFixed(1)} KiB)`,
      );
    },
  };
}
