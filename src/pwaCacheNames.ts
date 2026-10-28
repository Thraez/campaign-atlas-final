/**
 * Names of the service worker's runtime caches. One source for both sides:
 * `vite.config.ts` names the caches in `workbox.runtimeCaching`, and
 * `src/pwa.ts` reads, fills and clears them. No imports, so the Vite config
 * can load it.
 */

/** HTML navigations (NetworkFirst). */
export const ATLAS_HTML_CACHE = "atlas-html";
/** `atlas.json` and `search-index.json` (NetworkFirst). */
export const ATLAS_DATA_CACHE = "atlas-data";
/** Maps, portraits, icons and audio under `/atlas/assets/` (CacheFirst). */
export const ATLAS_ASSETS_CACHE = "atlas-assets";
/** Pictures from other sites (StaleWhileRevalidate), never promised offline. */
export const EXTERNAL_IMAGES_CACHE = "external-images";

/** The caches that hold atlas content, as opposed to the app shell and fonts. */
export const CONTENT_CACHES: readonly string[] = [
  ATLAS_DATA_CACHE,
  ATLAS_ASSETS_CACHE,
  ATLAS_HTML_CACHE,
  EXTERNAL_IMAGES_CACHE,
];
