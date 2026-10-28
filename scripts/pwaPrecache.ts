/**
 * What the service worker precaches, and a build check that it ships.
 *
 * Workbox installs the service worker only when every precache entry
 * downloads; one 404 fails the install and offline mode never starts. The
 * service worker is generated before the player prunes
 * (`prunePlayerAudioPlugin`, `prunePlayerImagesPlugin`) delete files from
 * `dist/atlas/`, so a precache glob that reaches into `atlas/` lists files the
 * build then removes. That shipped once: `sample-overview.svg` (ticket eval-43).
 *
 * So the precache is the app shell only, and `atlas/` is left to the runtime
 * caches in `vite.config.ts` (`atlas-data`, `atlas-assets`), which fetch what
 * a player actually opens. `precacheShippedOnlyPlugin` runs last and fails the
 * build if `sw.js` still names a file `dist/` does not hold.
 */
import fs from "node:fs";
import path from "node:path";
import type { Plugin } from "vite";

/** The built shell (HTML/JS/CSS) plus small bundled assets. */
export const PRECACHE_GLOB_PATTERNS = ["**/*.{js,css,html,ico,svg,woff2}"];

/**
 * `atlas/` is the published content: the prunes delete from it after the
 * service worker is written, and the runtime caches own it. Workbox's own
 * default ignore is kept, since setting `globIgnores` replaces it.
 */
export const PRECACHE_GLOB_IGNORES = ["**/node_modules/**/*", "atlas/**"];

/** The precache URLs in a generated `sw.js`, in manifest order. */
export function listPrecacheUrls(swSource: string): string[] {
  return [...swSource.matchAll(/\{\s*url:\s*"([^"]+)"\s*,\s*revision:/g)].map((m) => m[1]);
}

/**
 * Precache URLs in `outDir/sw.js` with no file behind them. Empty when the
 * build wrote no service worker.
 */
export function findMissingPrecacheEntries(outDir: string, swFile = "sw.js"): string[] {
  const swPath = path.join(outDir, swFile);
  if (!fs.existsSync(swPath)) return [];
  return listPrecacheUrls(fs.readFileSync(swPath, "utf8")).filter((url) => {
    const rel = decodeURIComponent(url.split(/[?#]/)[0]);
    return !fs.existsSync(path.join(outDir, rel));
  });
}

/**
 * Last build step: fail when the service worker precaches a file the build
 * does not ship. Must sit after every plugin that deletes from `dist/`.
 */
export function precacheShippedOnlyPlugin(): Plugin {
  let outDir = "dist";
  return {
    name: "atlas-precache-shipped-only",
    apply: "build",
    enforce: "post",
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      const missing = findMissingPrecacheEntries(outDir);
      if (missing.length > 0) {
        throw new Error(
          `atlas-precache-shipped-only: sw.js precaches ${missing.length} file(s) missing from ${outDir}, ` +
            `so the service worker would fail to install: ${missing.join(", ")}`,
        );
      }
    },
  };
}
