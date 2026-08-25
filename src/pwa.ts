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
 * Subscribe to events that can flip `isOfflineReady()`'s result — a
 * newly-activated service worker, or this page's controller changing.
 * Replaces polling: callers re-read `isOfflineReady()` when this fires.
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

  if ("caches" in window) {
    await Promise.all(
      CONTENT_CACHES.map((name) =>
        caches.delete(name).catch((err) => {
          logger.warn(`[pwa] could not clear cache ${name}`, err);
          return false;
        }),
      ),
    );
  }

  await checkForUpdate();

  window.location.reload();
  return { ok: true };
}

/** Wipe all caches managed by the SW. */
export async function clearOfflineCache(): Promise<void> {
  if (!("caches" in window)) return;
  const names = await caches.keys();
  await Promise.all(names.map((n) => caches.delete(n)));
}

/** True if a SW is currently controlling this page (i.e. offline-ready). */
export function isOfflineReady(): boolean {
  return !!navigator.serviceWorker?.controller;
}
