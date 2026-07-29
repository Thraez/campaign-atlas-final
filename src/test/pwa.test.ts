/**
 * Coverage for the service-worker enable/disable gate.
 *
 * `shouldEnableServiceWorker()` decides whether the player atlas ever
 * registers a service worker — getting this wrong ships stale content, so
 * every branch (iframe detection, preview-host detection, prod/dev, SW
 * support) is covered here rather than left implicit.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

function setServiceWorkerSupported(supported: boolean) {
  if (supported) {
    Object.defineProperty(navigator, "serviceWorker", {
      value: {},
      configurable: true,
    });
  } else {
    // `"serviceWorker" in navigator` checks property presence, not
    // truthiness — must delete, not set to undefined.
    delete (navigator as { serviceWorker?: unknown }).serviceWorker;
  }
}

function setHostname(hostname: string) {
  Object.defineProperty(window, "location", {
    value: { hostname },
    writable: true,
    configurable: true,
  });
}

function setInIframe(inIframe: boolean) {
  Object.defineProperty(window, "top", {
    value: inIframe ? {} : window,
    configurable: true,
  });
}

function setIframeCheckThrows() {
  Object.defineProperty(window, "top", {
    get() {
      throw new Error("cross-origin frame access blocked");
    },
    configurable: true,
  });
}

const originalLocation = window.location;
const originalTop = window.top;
const hadServiceWorker = "serviceWorker" in navigator;

async function loadPwa() {
  vi.resetModules();
  return await import("@/pwa");
}

beforeEach(() => {
  vi.stubEnv("PROD", true);
  setServiceWorkerSupported(true);
  setInIframe(false);
  setHostname("atlas.example.com");
});

afterEach(() => {
  vi.unstubAllEnvs();
  Object.defineProperty(window, "location", {
    value: originalLocation,
    writable: true,
    configurable: true,
  });
  Object.defineProperty(window, "top", {
    value: originalTop,
    configurable: true,
  });
  setServiceWorkerSupported(hadServiceWorker);
  vi.resetModules();
});

describe("shouldEnableServiceWorker()", () => {
  it("enabled when prod, not iframed, not a preview host, and SW is supported", async () => {
    const { shouldEnableServiceWorker } = await loadPwa();
    expect(shouldEnableServiceWorker()).toBe(true);
  });

  it("disabled when the browser has no serviceWorker support", async () => {
    setServiceWorkerSupported(false);
    const { shouldEnableServiceWorker } = await loadPwa();
    expect(shouldEnableServiceWorker()).toBe(false);
  });

  it("disabled in dev mode (import.meta.env.PROD false)", async () => {
    vi.stubEnv("PROD", false);
    const { shouldEnableServiceWorker } = await loadPwa();
    expect(shouldEnableServiceWorker()).toBe(false);
  });

  it("disabled when running inside an iframe (window.self !== window.top)", async () => {
    setInIframe(true);
    const { shouldEnableServiceWorker } = await loadPwa();
    expect(shouldEnableServiceWorker()).toBe(false);
  });

  it("disabled when reading window.top throws (cross-origin iframe) — treated as iframed", async () => {
    setIframeCheckThrows();
    const { shouldEnableServiceWorker } = await loadPwa();
    expect(shouldEnableServiceWorker()).toBe(false);
  });

  it.each([
    ["id-preview--foo.lovable.app", "id-preview-- prefix"],
    ["preview--bar.lovable.app", "preview-- prefix"],
    ["myatlas.lovableproject.com", "lovableproject.com suffix"],
    ["myatlas.lovableproject-dev.com", "lovableproject-dev.com suffix"],
    ["preview.myatlas.lovable.app", "lovable.app suffix containing 'preview'"],
  ])("disabled on preview host: %s (%s)", async (hostname) => {
    setHostname(hostname);
    const { shouldEnableServiceWorker } = await loadPwa();
    expect(shouldEnableServiceWorker()).toBe(false);
  });

  it("enabled on a plain lovable.app host without 'preview' in it", async () => {
    setHostname("myatlas.lovable.app");
    const { shouldEnableServiceWorker } = await loadPwa();
    expect(shouldEnableServiceWorker()).toBe(true);
  });
});
