/**
 * Vite build plugin: drop the source-named audio beds from the player `dist/`.
 *
 * Each referenced ambience bed ships twice to the build output:
 *   - a source-named file (e.g. `cavern-drone.ogg` / `cavern-drone.m4a`), and
 *   - a content-hashed copy (e.g. `ce5af482.ogg`) produced by
 *     `scripts/atlas/hashAudioAssets.ts`.
 * The built `atlas.json` points every `bed.src` / `bed.srcFallback` at the
 * HASHED name (see `rewriteAudioSrcs`), so the player never requests the
 * source-named files. Those exist only for the DM sound picker (which lists
 * them from `public/` via `writeAudioManifest`) and as transcode/hash input —
 * in the player bundle they are dead weight (~1.7 MB across the three beds).
 *
 * Vite copies all of `public/` into `dist/` verbatim, so both copies land in
 * `dist/atlas/assets/audio/`. This plugin removes the non-hashed ones from the
 * OUTPUT only; `public/` is untouched, so the DM picker keeps working.
 *
 * Scope: added to the Vite config only for player builds (`!includeEditor`),
 * so the editor build keeps every bed. `apply: "build"` also keeps it inert
 * during `vite dev`.
 *
 * Ordering / PWA safety: runs in `closeBundle` with `enforce: "post"`, i.e.
 * after Vite has copied `public/` into `dist/` and after VitePWA has generated
 * its precache manifest. That manifest never references audio anyway — the
 * workbox `globPatterns` only match js/css/html/ico/svg/woff2, and audio is
 * served through `runtimeCaching` (CacheFirst), not precached — so pruning it
 * cannot leave stale precache entries. Running post keeps that invariant even
 * if the glob patterns are widened later.
 */
import fs from "node:fs";
import path from "node:path";
import type { Plugin, Logger } from "vite";
import { AUDIO_EXT, HASHED_NAME } from "./atlas/hashAudioAssets";

const AUDIO_DIR = "atlas/assets/audio";

/**
 * A file in the audio dir is a prunable source-named bed when it is an audio
 * file that is NOT content-hashed — the exact inverse of the set
 * `writeAudioManifest` exposes to the DM picker. Non-audio files (e.g. the
 * picker's `manifest.json`) are never touched.
 */
export function isSourceNamedBed(name: string): boolean {
  return AUDIO_EXT.test(name) && !HASHED_NAME.test(name);
}

/**
 * Delete every source-named bed from an audio output directory, leaving the
 * content-hashed copies (and any non-audio files) in place. Returns the names
 * removed and the total bytes freed. No-op when the directory is absent.
 */
export function pruneSourceNamedBeds(dir: string): { removed: string[]; bytes: number } {
  const removed: string[] = [];
  let bytes = 0;
  if (!fs.existsSync(dir)) return { removed, bytes };
  for (const name of fs.readdirSync(dir)) {
    if (!isSourceNamedBed(name)) continue;
    const abs = path.join(dir, name);
    bytes += fs.statSync(abs).size;
    fs.rmSync(abs);
    removed.push(name);
  }
  return { removed, bytes };
}

export function prunePlayerAudioPlugin(): Plugin {
  let root = process.cwd();
  let outDir = "dist";
  let logger: Logger | undefined;

  return {
    name: "atlas-prune-player-audio",
    apply: "build",
    enforce: "post",
    configResolved(config) {
      root = config.root;
      outDir = config.build.outDir;
      logger = config.logger;
    },
    closeBundle() {
      const dir = path.resolve(root, outDir, AUDIO_DIR);
      const { removed, bytes } = pruneSourceNamedBeds(dir);
      const msg = `atlas-prune-player-audio: removed ${removed.length} source-named bed(s) from ${outDir}/${AUDIO_DIR} (${(
        bytes / 1024
      ).toFixed(1)} KiB) — players use the content-hashed copies`;
      if (logger) logger.info(msg);
      else console.log(msg);
    },
  };
}
