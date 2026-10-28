/**
 * Coverage for the service-worker enable/disable gate.
 *
 * `shouldEnableServiceWorker()` decides whether the player atlas ever
 * registers a service worker — getting this wrong ships stale content, so
 * every branch (iframe detection, prod/dev, SW
 * support) is covered here rather than left implicit.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

/**
 * `registerServiceWorker()` wires event-driven cache-state notifications
 * through the real `workbox-window` Workbox class — capture the handlers it
 * registers so tests can simulate SW lifecycle events without a real SW.
 */
let wbListeners: Record<string, Array<(event?: unknown) => void>> = {};
class FakeWorkbox {
  addEventListener(type: string, fn: (event?: unknown) => void) {
    (wbListeners[type] ??= []).push(fn);
  }
  register() {
    return Promise.resolve();
  }
  update() {
    return Promise.resolve();
  }
  messageSkipWaiting() {}
}
vi.mock("workbox-window", () => ({ Workbox: FakeWorkbox }));

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
  it("enabled when prod, not iframed, and SW is supported", async () => {
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
});

/**
 * OfflineStatus used to poll `isOfflineReady()` on a 2-second `setInterval`
 * forever, in two separate components. This is the event-driven replacement:
 * subscribers are notified when the SW reaches "activated" or the page's
 * controller changes, not on a timer.
 */
describe("onCacheStateChange", () => {
  let swListeners: Record<string, Array<() => void>>;

  beforeEach(() => {
    wbListeners = {};
    swListeners = {};
    Object.defineProperty(navigator, "serviceWorker", {
      value: {
        addEventListener: (type: string, fn: () => void) => {
          (swListeners[type] ??= []).push(fn);
        },
        getRegistrations: async () => [],
      },
      configurable: true,
    });
  });

  afterEach(() => {
    setServiceWorkerSupported(hadServiceWorker);
  });

  it("notifies subscribers when the SW reports activated", async () => {
    const { registerServiceWorker, onCacheStateChange } = await loadPwa();
    registerServiceWorker();

    let fired = 0;
    const unsub = onCacheStateChange(() => {
      fired++;
    });

    wbListeners["activated"]?.forEach((fn) => fn());

    expect(fired).toBe(1);
    unsub();
  });

  it("notifies subscribers on a native controllerchange event", async () => {
    const { registerServiceWorker, onCacheStateChange } = await loadPwa();
    registerServiceWorker();

    let fired = 0;
    onCacheStateChange(() => {
      fired++;
    });

    swListeners["controllerchange"]?.forEach((fn) => fn());

    expect(fired).toBe(1);
  });

  it("stops notifying after unsubscribe", async () => {
    const { registerServiceWorker, onCacheStateChange } = await loadPwa();
    registerServiceWorker();

    let fired = 0;
    const unsub = onCacheStateChange(() => {
      fired++;
    });
    unsub();

    wbListeners["activated"]?.forEach((fn) => fn());
    swListeners["controllerchange"]?.forEach((fn) => fn());

    expect(fired).toBe(0);
  });

  it("never registers a controllerchange listener when the SW is disabled (dev mode)", async () => {
    vi.stubEnv("PROD", false);
    const { registerServiceWorker } = await loadPwa();
    registerServiceWorker();

    expect(swListeners["controllerchange"]).toBeUndefined();
  });
});

/**
 * "Reload latest atlas" used to call only `wb.update()`, which checks for a new
 * service-worker script. When the DM publishes new content (or swaps an image
 * under the same filename) the app shell is unchanged, so there is no new SW —
 * the player kept reading CacheFirst content while the menu said it had checked
 * for updates. These cover the caches actually being dropped.
 */
describe("reloadLatestAtlas", () => {
  let deleted: string[];
  let reloadCalls: number;

  beforeEach(() => {
    deleted = [];
    reloadCalls = 0;
    Object.defineProperty(window, "caches", {
      value: {
        keys: async () => [],
        delete: async (name: string) => {
          deleted.push(name);
          return true;
        },
      },
      configurable: true,
      writable: true,
    });
    Object.defineProperty(window, "location", {
      value: {
        hostname: "atlas.example.com",
        reload: () => {
          reloadCalls++;
        },
      },
      writable: true,
      configurable: true,
    });
    Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
  });

  afterEach(() => {
    delete (window as { caches?: unknown }).caches;
    Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
  });

  it("clears the atlas content caches, not just the service worker", async () => {
    const { reloadLatestAtlas } = await loadPwa();
    const result = await reloadLatestAtlas();

    expect(result.ok).toBe(true);
    // atlas-assets is the critical one: CacheFirst with a 60-day expiry, so a
    // replaced same-filename image is invisible until this cache is dropped.
    expect(deleted).toContain("atlas-assets");
    expect(deleted).toContain("atlas-data");
    expect(deleted).toContain("atlas-html");
  });

  it("reloads the page so the cleared caches refill from the network", async () => {
    const { reloadLatestAtlas } = await loadPwa();
    await reloadLatestAtlas();
    expect(reloadCalls).toBe(1);
  });

  it("does nothing while offline — never strips a working offline atlas", async () => {
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
    const { reloadLatestAtlas } = await loadPwa();
    const result = await reloadLatestAtlas();

    expect(result).toEqual({ ok: false, reason: "offline" });
    expect(deleted).toEqual([]);
    expect(reloadCalls).toBe(0);
  });

  it("still reloads when an individual cache delete fails", async () => {
    Object.defineProperty(window, "caches", {
      value: {
        keys: async () => [],
        delete: async () => {
          throw new Error("quota error");
        },
      },
      configurable: true,
      writable: true,
    });
    const { reloadLatestAtlas } = await loadPwa();
    const result = await reloadLatestAtlas();

    expect(result.ok).toBe(true);
    expect(reloadCalls).toBe(1);
  });
});

/**
 * In-memory CacheStorage: cache name -> stored request URLs. `addAll` stands in
 * for the fetch-and-store the browser does; a URL in `failing` makes it reject
 * like a 404 would.
 */
function installFakeCaches(failing: string[] = []) {
  const store = new Map<string, Set<string>>();
  const open = async (name: string) => {
    let entries = store.get(name);
    if (!entries) {
      entries = new Set();
      store.set(name, entries);
    }
    const set = entries;
    return {
      match: async (url: string) => (set.has(url) ? { ok: true } : undefined),
      keys: async () => [...set].map((url) => ({ url })),
      addAll: async (urls: string[]) => {
        const bad = urls.find((u) => failing.includes(u));
        if (bad) throw new Error(`404 ${bad}`);
        urls.forEach((u) => set.add(u));
      },
    };
  };
  Object.defineProperty(window, "caches", {
    value: {
      open,
      keys: async () => [...store.keys()],
      has: async (name: string) => store.has(name),
      delete: async (name: string) => store.delete(name),
    },
    configurable: true,
    writable: true,
  });
  return {
    store,
    /** What the service worker's install step leaves behind: the app shell. */
    precacheShell() {
      store.set("workbox-precache-v2-https://atlas.example.com/", new Set(["/index.html"]));
    },
    /** What visiting the atlas leaves behind: atlas.json via NetworkFirst. */
    visitNotes() {
      store.set("atlas-data", new Set(["/atlas/atlas.json"]));
    },
  };
}

const WORLD_LAYERS = ["atlas/assets/maps/world-1.webp", "/atlas/assets/maps/world-2.webp"];

/**
 * The offline menu used to say "Available offline" whenever a service worker
 * controlled the page, even right after "Clear offline cache" had deleted
 * every cache. Coverage now comes from what the caches actually hold.
 */
describe("offline coverage", () => {
  beforeEach(() => {
    Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
  });

  afterEach(() => {
    delete (window as { caches?: unknown }).caches;
  });

  it("is 'none' before anything is stored, even with a controlling SW", async () => {
    Object.defineProperty(navigator, "serviceWorker", {
      value: { controller: {} },
      configurable: true,
    });
    installFakeCaches();
    const { getOfflineCoverage } = await loadPwa();
    expect(await getOfflineCoverage(WORLD_LAYERS)).toBe("none");
  });

  it("is 'none' when the notes are stored but the app shell is not", async () => {
    const fake = installFakeCaches();
    fake.visitNotes();
    const { getOfflineCoverage } = await loadPwa();
    expect(await getOfflineCoverage(WORLD_LAYERS)).toBe("none");
  });

  it("is 'notes' after a visit: shell and atlas.json stored, map layers not", async () => {
    const fake = installFakeCaches();
    fake.precacheShell();
    fake.visitNotes();
    const { getOfflineCoverage } = await loadPwa();
    expect(await getOfflineCoverage(WORLD_LAYERS)).toBe("notes");
  });

  it("is 'notes-and-map' after saving this map for offline", async () => {
    const fake = installFakeCaches();
    fake.precacheShell();
    const { getOfflineCoverage, saveForOffline } = await loadPwa();

    const result = await saveForOffline(WORLD_LAYERS);

    expect(result).toEqual({ ok: true });
    expect(fake.store.get("atlas-data")).toContain("/atlas/atlas.json");
    // Layer URLs go through the shared asset-URL helper: one leading slash.
    expect([...(fake.store.get("atlas-assets") ?? [])].sort()).toEqual([
      "/atlas/assets/maps/world-1.webp",
      "/atlas/assets/maps/world-2.webp",
    ]);
    expect(await getOfflineCoverage(WORLD_LAYERS)).toBe("notes-and-map");
  });

  it("ignores external layer URLs: they are never promised offline", async () => {
    const fake = installFakeCaches();
    fake.precacheShell();
    const { getOfflineCoverage, saveForOffline } = await loadPwa();
    const layers = [...WORLD_LAYERS, "https://i.pinimg.com/x.jpg"];

    await saveForOffline(layers);

    expect(fake.store.get("atlas-assets")).not.toContain("https://i.pinimg.com/x.jpg");
    expect(await getOfflineCoverage(layers)).toBe("notes-and-map");
  });

  it("only claims the map for the map it was saved for", async () => {
    const fake = installFakeCaches();
    fake.precacheShell();
    const { getOfflineCoverage, saveForOffline } = await loadPwa();
    await saveForOffline(WORLD_LAYERS);
    expect(await getOfflineCoverage(["atlas/assets/maps/underdark.webp"])).toBe("notes");
  });

  it("saving refuses while offline and stores nothing", async () => {
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
    const fake = installFakeCaches();
    const { saveForOffline } = await loadPwa();
    expect(await saveForOffline(WORLD_LAYERS)).toEqual({ ok: false, reason: "offline" });
    expect(fake.store.size).toBe(0);
  });

  it("saving reports failure when a file can't be fetched", async () => {
    const fake = installFakeCaches(["/atlas/assets/maps/world-2.webp"]);
    fake.precacheShell();
    const { saveForOffline, getOfflineCoverage } = await loadPwa();
    expect(await saveForOffline(WORLD_LAYERS)).toEqual({ ok: false, reason: "failed" });
    expect(await getOfflineCoverage(WORLD_LAYERS)).toBe("notes");
  });

  it("after clearing, coverage drops to 'none' and subscribers hear about it", async () => {
    const fake = installFakeCaches();
    fake.precacheShell();
    const { getOfflineCoverage, saveForOffline, clearOfflineCache, onCacheStateChange } =
      await loadPwa();
    await saveForOffline(WORLD_LAYERS);
    let fired = 0;
    onCacheStateChange(() => fired++);

    await clearOfflineCache();

    expect(await getOfflineCoverage(WORLD_LAYERS)).toBe("none");
    expect(fired).toBe(1);
  });

  it("clearing keeps the app shell so a later save can make it work offline again", async () => {
    const fake = installFakeCaches();
    fake.precacheShell();
    const { getOfflineCoverage, saveForOffline, clearOfflineCache } = await loadPwa();
    await saveForOffline(WORLD_LAYERS);
    await clearOfflineCache();

    await saveForOffline(WORLD_LAYERS);

    expect(await getOfflineCoverage(WORLD_LAYERS)).toBe("notes-and-map");
  });

  it("is 'none' when the browser has no Cache API", async () => {
    const { getOfflineCoverage } = await loadPwa();
    expect(await getOfflineCoverage(WORLD_LAYERS)).toBe("none");
  });
});
