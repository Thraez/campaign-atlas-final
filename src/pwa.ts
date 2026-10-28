/**
 * Service worker registration + offline cache controls.
 *
 * IMPORTANT: registration is gated to PRODUCTION builds AND skipped
 * inside iframes / Lovable preview hosts. The Lovable editor renders
 * the app in an iframe on `id-preview--*.lovable.app` /
 * `*.lovableproject.com`; registering a SW there causes stale-content
 * and navigation issues that persist across reloads.
 *
 * Vite dev server (`npm run dev`) is also skipped — `import.meta.env.PROD`
 * is false during dev.
 */
import { Workbox } from "workbox-window";
import { logger } from "@/lib/logger";
import { normalizeAtlasAssetUrl } from "@/atlas/url";
import { ATLAS_ASSETS_CACHE, ATLAS_DATA_CACHE, CONTENT_CACHES } from "@/pwaCacheNames";

let wb: Workbox | null = null;
let waitingWorker: ServiceWorker | null = null;
const updateListeners = new Set<() => void>();
const cacheStateListeners = new Set<() => void>();

function notifyCacheStateChange(): void {
  cacheStateListeners.forEach((fn) => fn());
  void refreshOfflineCoverage();
}

function isInIframe(): boolean {
  try {
    return window.self !== window.top;
  } catch {
    return true; // cross-origin block → assume iframe
  }
}

function isPreviewHost(): boolean {
  const h = window.location.hostname;
  return (
    h.includes("id-preview--") ||
    h.includes("preview--") ||
    h.endsWith("lovableproject.com") ||
    h.endsWith("lovableproject-dev.com") ||
    (h.endsWith("lovable.app") && h.includes("preview"))
  );
}

export function shouldEnableServiceWorker(): boolean {
  if (!("serviceWorker" in navigator)) return false;
  if (!import.meta.env.PROD) return false; // dev mode
  if (isInIframe()) return false; // Lovable editor preview
  if (isPreviewHost()) return false; // Lovable preview hosts
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

  // A service worker reaching "activated" has just filled its precache (the
  // app shell): save the notes and the current map with it, then re-read.
  wb.addEventListener("activated", () => {
    notifyCacheStateChange();
    void autoSaveForNewShell();
  });

  navigator.serviceWorker.addEventListener("controllerchange", notifyCacheStateChange);

  wb.register()
    .then(() => autoSaveForNewShell())
    .catch((err) => {
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
 * Subscribe to events that can change what is stored offline — a
 * newly-activated service worker, this page's controller changing, or a
 * save or clear from the offline menu.
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

/** Workbox names its precache `workbox-precache-v2-<scope>`. */
const PRECACHE_PREFIX = "workbox-precache";
/** localStorage key: the app shell the last automatic save was made for. */
const AUTO_SAVED_SHELL_KEY = "atlas-offline-auto-saved-shell";

/**
 * What would work with no network, read from the caches themselves:
 * - "none": no service worker, no app shell, or the notes (`atlas.json` and
 *   `search-index.json`) are missing;
 * - "notes": shell and notes are stored, but not every layer of this map;
 * - "notes-map-online": shell and notes are stored, but this map's pictures
 *   come from another site (or it has none of its own), so it can't be saved;
 * - "notes-and-map": shell, notes and every layer of this map.
 * Portraits and audio are cached as they are opened, so any state but
 * "none" also means "pictures you have opened".
 */
export type OfflineCoverage = "none" | "notes" | "notes-map-online" | "notes-and-map";

export type SaveForOfflineResult =
  { ok: true } | { ok: false; reason: "offline" | "failed" | "unsupported" };

function atlasDataUrls(): string[] {
  return [
    normalizeAtlasAssetUrl("atlas/atlas.json"),
    normalizeAtlasAssetUrl("atlas/search-index.json"),
  ];
}

function isExternal(src: string): boolean {
  return /^(https?:|data:|blob:)/i.test(src);
}

/** Local layer URLs of a map, built like the viewer builds them. External
 *  layers (http, data, blob) are never promised offline and are left out. */
function localLayerUrls(layerSrcs: readonly string[]): string[] {
  const urls = layerSrcs
    .filter((src) => src && !isExternal(src))
    .map((src) => normalizeAtlasAssetUrl(src));
  return [...new Set(urls)];
}

async function hasWorker(): Promise<boolean> {
  const sw = typeof navigator !== "undefined" ? navigator.serviceWorker : undefined;
  if (!sw) return false;
  if (sw.controller) return true;
  try {
    const reg = await sw.getRegistration?.();
    return !!reg?.active;
  } catch {
    return false;
  }
}

/**
 * The precached app shell, as one string that changes with every deploy that
 * changes the shell (Workbox keys carry a revision). `null` when there is no
 * service worker or no precache: caches without a worker serve nothing.
 */
async function shellSignature(): Promise<string | null> {
  if (!(await hasWorker())) return null;
  const names = (await caches.keys()).filter((n) => n.startsWith(PRECACHE_PREFIX));
  const urls: string[] = [];
  for (const name of names) {
    const cache = await caches.open(name);
    (await cache.keys()).forEach((req) => urls.push(req.url));
  }
  return urls.length > 0 ? urls.sort().join("\n") : null;
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
    if ((await shellSignature()) === null) return "none";
    if (!(await allStored(ATLAS_DATA_CACHE, atlasDataUrls()))) return "none";
    const local = localLayerUrls(layerSrcs);
    if (local.length === 0 || layerSrcs.some(isExternal)) return "notes-map-online";
    return (await allStored(ATLAS_ASSETS_CACHE, local)) ? "notes-and-map" : "notes";
  } catch (err) {
    logger.warn("[pwa] could not read the offline caches", err);
    return "none";
  }
}

/**
 * Fetch each URL past the browser's HTTP cache and store it. `put` replaces
 * any older copy, so a re-save always refreshes a map whose file was replaced
 * under the same name (the `atlas-assets` route is CacheFirst).
 */
async function storeFresh(cacheName: string, urls: string[]): Promise<void> {
  if (urls.length === 0) return;
  const cache = await caches.open(cacheName);
  await Promise.all(
    urls.map(async (url) => {
      const res = await fetch(url, { cache: "reload" });
      if (!res.ok) throw new Error(`${res.status} ${url}`);
      await cache.put(url, res);
    }),
  );
}

/**
 * Store the notes and this map's layers in the same caches the service worker
 * reads from, so they work with no network. Only URLs the player build itself
 * serves are fetched (atlas data and the map's own layers).
 */
export async function saveForOffline(layerSrcs: readonly string[]): Promise<SaveForOfflineResult> {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return { ok: false, reason: "offline" };
  }
  if (!("caches" in window)) return { ok: false, reason: "unsupported" };
  try {
    await storeFresh(ATLAS_DATA_CACHE, atlasDataUrls());
    await storeFresh(ATLAS_ASSETS_CACHE, localLayerUrls(layerSrcs));
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

// ---------------------------------------------------------------------------
// The map on screen and what is stored for it: one read, shared by every view
// ---------------------------------------------------------------------------

export interface OfflineMap {
  /** Changes whenever the map or its layers change (e.g. map id + srcs). */
  key: string;
  /** `src` of every layer, as in `atlas.json`. */
  layerSrcs: readonly string[];
}

let currentMap: OfflineMap | null = null;
let coverage: OfflineCoverage | null = null;
let readId = 0;
const coverageListeners = new Set<() => void>();

/** What is stored for the map on screen; `null` until the first read ends. */
export function getOfflineCoverageSnapshot(): OfflineCoverage | null {
  return coverage;
}

export function subscribeOfflineCoverage(fn: () => void): () => void {
  coverageListeners.add(fn);
  return () => coverageListeners.delete(fn);
}

/** Re-read the caches for the map on screen and tell subscribers. */
export async function refreshOfflineCoverage(): Promise<void> {
  if (!currentMap) return;
  const id = ++readId;
  const next = await getOfflineCoverage(currentMap.layerSrcs);
  // Only the newest read wins; an older one may describe another map.
  if (id !== readId || next === coverage) return;
  coverage = next;
  coverageListeners.forEach((fn) => fn());
}

/** Tell the offline store which map is on screen. */
export function setOfflineMap(map: OfflineMap | null): void {
  if (map?.key === currentMap?.key) return;
  currentMap = map;
  if (!map) return;
  void refreshOfflineCoverage();
  void autoSaveForNewShell();
}

/** "Save this map for offline" for the map on screen. */
export function saveCurrentMapForOffline(): Promise<SaveForOfflineResult> {
  return saveForOffline(currentMap?.layerSrcs ?? []);
}

function readAutoSavedShell(): string | null {
  try {
    return window.localStorage.getItem(AUTO_SAVED_SHELL_KEY);
  } catch {
    return null;
  }
}

function writeAutoSavedShell(signature: string): void {
  try {
    window.localStorage.setItem(AUTO_SAVED_SHELL_KEY, signature);
  } catch {
    // Private mode: the next load saves again, which is harmless.
  }
}

let autoSaving = false;

/**
 * Installing the app saves the notes and the map on screen. Runs once per
 * app shell: on the first install and after each deploy that brings a new
 * service worker, which also refreshes that map's layers. A cleared cache is
 * not refilled until the next deploy.
 */
export async function autoSaveForNewShell(): Promise<void> {
  if (autoSaving || !currentMap || !("caches" in window)) return;
  if (typeof navigator !== "undefined" && !navigator.onLine) return;
  autoSaving = true;
  try {
    const signature = await shellSignature();
    if (signature === null || signature === readAutoSavedShell()) return;
    const result = await saveForOffline(currentMap.layerSrcs);
    if (result.ok) writeAutoSavedShell(signature);
  } catch (err) {
    logger.warn("[pwa] automatic offline save failed", err);
  } finally {
    autoSaving = false;
  }
}
