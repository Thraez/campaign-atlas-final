/**
 * Service worker registration + offline cache controls.
 *
 * IMPORTANT: registration is gated to PRODUCTION builds AND skipped
 * inside iframes, where a SW causes stale content and navigation issues
 * that persist across reloads.
 *
 * Vite dev server (`npm run dev`) is also skipped — `import.meta.env.PROD`
 * is false during dev.
 */
import { Workbox } from "workbox-window";
import { logger } from "@/lib/logger";
import { normalizeAtlasAssetUrl } from "@/atlas/url";

let wb: Workbox | null = null;
let waitingWorker: ServiceWorker | null = null;
const updateListeners = new Set<() => void>();
const cacheStateListeners = new Set<() => void>();

function notifyCacheStateChange(): void {
  cacheStateListeners.forEach((fn) => fn());
}

function isInIframe(): boolean {
  try {
    return window.self !== window.top;
  } catch {
    return true; // cross-origin block → assume iframe
  }
}

export function shouldEnableServiceWorker(): boolean {
  if (!("serviceWorker" in navigator)) return false;
  if (!import.meta.env.PROD) return false; // dev mode
  if (isInIframe()) return false;
  return true;
}

export function registerServiceWorker(): void {
  if (!shouldEnableServiceWorker()) {
    // Defensive: unregister any leftover SWs from previous experiments
    // so the editor preview never serves stale content.
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .getRegistrations()
        .then((regs) => {
          regs.forEach((r) => r.unregister());
        })
        .catch((err) => logger.debug("[pwa] leftover SW cleanup failed", err));
    }
    return;
  }

  const swUrl = `${import.meta.env.BASE_URL}sw.js`;
  wb = new Workbox(swUrl, { scope: import.meta.env.BASE_URL });

  wb.addEventListener("waiting", (event) => {
    waitingWorker = (event.sw ?? null) as ServiceWorker | null;
    updateListeners.forEach((fn) => fn());
  });

  wb.addEventListener("controlling", () => {
    // New SW took control → reload to pick up fresh assets.
    window.location.reload();
  });

  // A freshly-installed SW reaching "activated" is the event-driven signal
  // that offline-ready state may have just flipped (isOfflineReady() reads
  // navigator.serviceWorker.controller, which can change right after this).
  wb.addEventListener("activated", () => {
    notifyCacheStateChange();
  });

  navigator.serviceWorker.addEventListener("controllerchange", notifyCacheStateChange);

  wb.register().catch((err) => {
    logger.warn("[pwa] service worker registration failed", err);
  });
}

export function onUpdateAvailable(fn: () => void): () => void {
  updateListeners.add(fn);
  // If an update is already waiting, fire immediately.
  if (waitingWorker) queueMicrotask(fn);
  return () => updateListeners.delete(fn);
}

/**
 * Subscribe to events that can change `getOfflineCoverage()`'s result — a
 * newly-activated service worker, this page's controller changing, or a
 * save or clear from the offline menu. Callers re-read the caches when it fires.
 */
export function onCacheStateChange(fn: () => void): () => void {
  cacheStateListeners.add(fn);
  return () => cacheStateListeners.delete(fn);
}

export function activateUpdate(): void {
  if (!wb || !waitingWorker) {
    window.location.reload();
    return;
  }
  wb.messageSkipWaiting();
}

/** Manually trigger a service-worker update check. */
export async function checkForUpdate(): Promise<void> {
  if (!wb) return;
  try {
    await wb.update();
  } catch (err) {
    logger.warn("[pwa] update check failed", err);
  }
}

/**
 * Runtime caches holding atlas *content* (as named in vite.config.ts). These
 * are what go stale when the DM publishes without the app shell changing.
 * `atlas-assets` is CacheFirst with a 60-day expiry, so a map or portrait
 * replaced under the same filename would otherwise never be re-fetched.
 */
const CONTENT_CACHES = ["atlas-data", "atlas-assets", "atlas-html", "external-images"];

export interface ReloadResult {
  ok: boolean;
  /** Set when nothing was done because the device is offline. */
  reason?: "offline";
}

/**
 * What "Reload latest atlas" should actually do.
 *
 * The old implementation only called `wb.update()`, which checks for a new
 * service-worker script. That misses the common case entirely: the DM
 * publishes new atlas content or replaces an image under the same filename,
 * the app shell is byte-identical, so no new SW exists and the player keeps
 * reading cached content while the UI reports success.
 *
 * So: drop the content caches, check for a new shell, then reload. The reload
 * re-fetches everything from the network and repopulates the caches.
 *
 * Refuses to run while offline — clearing the caches with no network would
 * turn a working offline atlas into a blank page, which is the one thing a DM
 * at a table with bad wifi cannot afford.
 */
export async function reloadLatestAtlas(): Promise<ReloadResult> {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return { ok: false, reason: "offline" };
  }

  await deleteContentCaches();

  await checkForUpdate();

  window.location.reload();
  return { ok: true };
}

async function deleteContentCaches(): Promise<void> {
  if (!("caches" in window)) return;
  await Promise.all(
    CONTENT_CACHES.map((name) =>
      caches.delete(name).catch((err) => {
        logger.warn(`[pwa] could not clear cache ${name}`, err);
        return false;
      }),
    ),
  );
}

// ---------------------------------------------------------------------------
// What is stored for offline use
// ---------------------------------------------------------------------------

/** Runtime cache names from vite.config.ts `workbox.runtimeCaching`. */
const DATA_CACHE = "atlas-data";
const ASSET_CACHE = "atlas-assets";
/** Workbox names its precache `workbox-precache-v2-<scope>`. */
const PRECACHE_PREFIX = "workbox-precache";

/**
 * What would work with no network, read from the caches themselves:
 * - "none": the app shell or the notes (`atlas.json`) are missing;
 * - "notes": shell and notes are stored, but not every layer of this map;
 * - "notes-and-map": shell, notes and every local layer of this map.
 * Portraits and audio are cached as they are opened, so any state but
 * "none" also means "pictures you have opened".
 */
export type OfflineCoverage = "none" | "notes" | "notes-and-map";

export type SaveForOfflineResult =
  { ok: true } | { ok: false; reason: "offline" | "failed" | "unsupported" };

function atlasDataUrls(): string[] {
  return [
    normalizeAtlasAssetUrl("atlas/atlas.json"),
    normalizeAtlasAssetUrl("atlas/search-index.json"),
  ];
}

/** Local layer URLs of a map, built like the viewer builds them. External
 *  layers (http, data, blob) are never promised offline and are left out. */
function localLayerUrls(layerSrcs: readonly string[]): string[] {
  const urls = layerSrcs
    .filter((src) => src && !/^(https?:|data:|blob:)/i.test(src))
    .map((src) => normalizeAtlasAssetUrl(src));
  return [...new Set(urls)];
}

async function hasShell(): Promise<boolean> {
  const names = await caches.keys();
  for (const name of names.filter((n) => n.startsWith(PRECACHE_PREFIX))) {
    const cache = await caches.open(name);
    if ((await cache.keys()).length > 0) return true;
  }
  return false;
}

async function allStored(cacheName: string, urls: string[]): Promise<boolean> {
  if (!(await caches.has(cacheName))) return urls.length === 0;
  const cache = await caches.open(cacheName);
  const hits = await Promise.all(urls.map((u) => cache.match(u)));
  return hits.every(Boolean);
}

/** Read the caches and say what of the atlas works offline for this map. */
export async function getOfflineCoverage(layerSrcs: readonly string[]): Promise<OfflineCoverage> {
  if (typeof window === "undefined" || !("caches" in window)) return "none";
  try {
    if (!(await hasShell())) return "none";
    const [atlasJson] = atlasDataUrls();
    if (!(await allStored(DATA_CACHE, [atlasJson]))) return "none";
    return (await allStored(ASSET_CACHE, localLayerUrls(layerSrcs))) ? "notes-and-map" : "notes";
  } catch (err) {
    logger.warn("[pwa] could not read the offline caches", err);
    return "none";
  }
}

/**
 * "Save this map for offline": store the notes and this map's layers in the
 * same caches the service worker reads from, so they work with no network.
 * Only URLs the player build itself serves are fetched (atlas data and the
 * map's own layers), so nothing outside the player site is stored.
 */
export async function saveForOffline(layerSrcs: readonly string[]): Promise<SaveForOfflineResult> {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return { ok: false, reason: "offline" };
  }
  if (!("caches" in window)) return { ok: false, reason: "unsupported" };
  try {
    const data = await caches.open(DATA_CACHE);
    await data.addAll(atlasDataUrls());
    const layers = localLayerUrls(layerSrcs);
    if (layers.length > 0) {
      const assets = await caches.open(ASSET_CACHE);
      await assets.addAll(layers);
    }
    return { ok: true };
  } catch (err) {
    logger.warn("[pwa] could not save the atlas for offline use", err);
    return { ok: false, reason: "failed" };
  } finally {
    notifyCacheStateChange();
  }
}

/**
 * Delete the stored atlas content (notes, maps, pictures). The app shell stays,
 * so "Save this map for offline" can make it work offline again without
 * waiting for a new service worker.
 */
export async function clearOfflineCache(): Promise<void> {
  await deleteContentCaches();
  notifyCacheStateChange();
}
