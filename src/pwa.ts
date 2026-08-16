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

/** Manually trigger an update check (used by "Reload latest atlas"). */
export async function checkForUpdate(): Promise<void> {
  if (!wb) return;
  try {
    await wb.update();
  } catch (err) {
    logger.warn("[pwa] update check failed", err);
  }
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
