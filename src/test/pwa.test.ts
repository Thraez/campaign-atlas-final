/**
 * Coverage for the service-worker enable/disable gate.
 *
 * `shouldEnableServiceWorker()` decides whether the player atlas ever
 * registers a service worker — getting this wrong ships stale content, so
 * every branch (iframe detection, preview-host detection, prod/dev, SW
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

/**
 * OfflineStatus used to poll on a 2-second `setInterval` forever, in two
 * separate components. This is the event-driven replacement: subscribers are
 * notified when the SW reaches "activated" or the page's controller changes,
 * not on a timer.
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

const ORIGIN = "https://atlas.example.com";

/**
 * In-memory CacheStorage (cache name -> URL -> stored body) plus a `fetch`
 * stand-in. Each fetch answers with a new body (`v1`, `v2`, ...) so a test can
 * see whether a save replaced an older copy; a URL in `failing` answers 404.
 */
function installFakeCaches(failing: string[] = []) {
  const store = new Map<string, Map<string, unknown>>();
  const fetches: Array<{ url: string; init?: RequestInit }> = [];
  let served = 0;
  const open = async (name: string) => {
    let entries = store.get(name);
    if (!entries) {
      entries = new Map();
      store.set(name, entries);
    }
    const cache = entries;
    return {
      match: async (url: string) => cache.get(url),
      keys: async () => [...cache.keys()].map((url) => ({ url })),
      put: async (url: string, res: { body: unknown }) => {
        cache.set(url, res.body);
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
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      fetches.push({ url, init });
      if (failing.includes(url)) return { ok: false, status: 404 };
      return { ok: true, status: 200, body: `v${++served}` };
    }),
  );
  return {
    store,
    fetches,
    stored(name: string) {
      return [...(store.get(name)?.keys() ?? [])].sort();
    },
    /** What the service worker's install leaves behind: the app shell. */
    precacheShell(revision = "a") {
      store.set(
        `workbox-precache-v2-${ORIGIN}/`,
        new Map([[`${ORIGIN}/index.html?__WB_REVISION__=${revision}`, "shell"]]),
      );
    },
    /** What visiting the atlas leaves behind (NetworkFirst on both files). */
    visitNotes() {
      store.set(
        "atlas-data",
        new Map([
          ["/atlas/atlas.json", "notes"],
          ["/atlas/search-index.json", "index"],
        ]),
      );
    },
  };
}

/** Pretend the automatic save already ran for shell revision `a`. */
function markShellAutoSaved() {
  window.localStorage.setItem(
    "atlas-offline-auto-saved-shell",
    `${ORIGIN}/index.html?__WB_REVISION__=a`,
  );
}

/** A service worker: controlling this page, only active, or none at all. */
function setWorker(state: "controlling" | "active" | "none") {
  Object.defineProperty(navigator, "serviceWorker", {
    value: {
      controller: state === "controlling" ? {} : null,
      getRegistration: async () => (state === "active" ? { active: {} } : undefined),
      getRegistrations: async () => [],
      addEventListener: () => {},
    },
    configurable: true,
  });
}

const WORLD_LAYERS = ["atlas/assets/maps/world-1.webp", "/atlas/assets/maps/world-2.webp"];
const WORLD_URLS = ["/atlas/assets/maps/world-1.webp", "/atlas/assets/maps/world-2.webp"];

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  delete (window as { caches?: unknown }).caches;
  vi.unstubAllGlobals();
  Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
});

/**
 * The offline menu used to say "Available offline" whenever a service worker
 * controlled the page, even right after "Clear offline cache" had deleted
 * every cache. Coverage now comes from what the caches actually hold.
 */
describe("offline coverage", () => {
  beforeEach(() => {
    setWorker("controlling");
  });

  it("is 'none' before anything is stored, even with a controlling SW", async () => {
    installFakeCaches();
    const { getOfflineCoverage } = await loadPwa();
    expect(await getOfflineCoverage(WORLD_LAYERS)).toBe("none");
  });

  it("is 'none' when the caches are full but no service worker is there to serve them", async () => {
    setWorker("none");
    const fake = installFakeCaches();
    fake.precacheShell();
    fake.visitNotes();
    const { getOfflineCoverage } = await loadPwa();
    expect(await getOfflineCoverage(WORLD_LAYERS)).toBe("none");
  });

  it("counts an active registration as a worker even before it controls the page", async () => {
    setWorker("active");
    const fake = installFakeCaches();
    fake.precacheShell();
    fake.visitNotes();
    const { getOfflineCoverage } = await loadPwa();
    expect(await getOfflineCoverage(WORLD_LAYERS)).toBe("notes");
  });

  it("is 'none' when the notes are stored but the app shell is not", async () => {
    const fake = installFakeCaches();
    fake.visitNotes();
    const { getOfflineCoverage } = await loadPwa();
    expect(await getOfflineCoverage(WORLD_LAYERS)).toBe("none");
  });

  it("is 'none' when atlas.json is stored but search-index.json is not", async () => {
    const fake = installFakeCaches();
    fake.precacheShell();
    fake.store.set("atlas-data", new Map([["/atlas/atlas.json", "notes"]]));
    const { getOfflineCoverage } = await loadPwa();
    expect(await getOfflineCoverage(WORLD_LAYERS)).toBe("none");
  });

  it("is 'notes' after a visit: shell and notes stored, map layers not", async () => {
    const fake = installFakeCaches();
    fake.precacheShell();
    fake.visitNotes();
    const { getOfflineCoverage } = await loadPwa();
    expect(await getOfflineCoverage(WORLD_LAYERS)).toBe("notes");
  });

  it("is 'notes-and-map' after saving this map, fetched past the HTTP cache", async () => {
    const fake = installFakeCaches();
    fake.precacheShell();
    const { getOfflineCoverage, saveForOffline } = await loadPwa();

    const result = await saveForOffline(WORLD_LAYERS);

    expect(result).toEqual({ ok: true });
    expect(fake.stored("atlas-data")).toEqual(["/atlas/atlas.json", "/atlas/search-index.json"]);
    // Layer URLs go through the shared asset-URL helper: one leading slash.
    expect(fake.stored("atlas-assets")).toEqual(WORLD_URLS);
    expect(fake.fetches.every((f) => f.init?.cache === "reload")).toBe(true);
    expect(await getOfflineCoverage(WORLD_LAYERS)).toBe("notes-and-map");
  });

  it("a re-save replaces a stored layer, so a map replaced under the same name refreshes", async () => {
    const fake = installFakeCaches();
    fake.precacheShell();
    const { saveForOffline } = await loadPwa();
    await saveForOffline(WORLD_LAYERS);
    const first = fake.store.get("atlas-assets")?.get(WORLD_URLS[0]);

    await saveForOffline(WORLD_LAYERS);

    expect(fake.store.get("atlas-assets")?.get(WORLD_URLS[0])).not.toEqual(first);
  });

  it("never claims a map with a layer from another site, and never stores that layer", async () => {
    const fake = installFakeCaches();
    fake.precacheShell();
    const { getOfflineCoverage, saveForOffline } = await loadPwa();
    const layers = [...WORLD_LAYERS, "https://i.pinimg.com/x.jpg"];

    await saveForOffline(layers);

    expect(fake.stored("atlas-assets")).toEqual(WORLD_URLS);
    expect(await getOfflineCoverage(layers)).toBe("notes-map-online");
  });

  it("never claims a map with no layers of its own", async () => {
    const fake = installFakeCaches();
    fake.precacheShell();
    fake.visitNotes();
    const { getOfflineCoverage } = await loadPwa();
    expect(await getOfflineCoverage([])).toBe("notes-map-online");
    expect(await getOfflineCoverage(["data:image/png;base64,AAAA"])).toBe("notes-map-online");
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
    const fake = installFakeCaches([WORLD_URLS[1]]);
    fake.precacheShell();
    const { saveForOffline, getOfflineCoverage } = await loadPwa();
    expect(await saveForOffline(WORLD_LAYERS)).toEqual({ ok: false, reason: "failed" });
    expect(await getOfflineCoverage(WORLD_LAYERS)).toBe("notes");
  });

  it("saving says when the browser has no Cache API", async () => {
    const { saveForOffline } = await loadPwa();
    expect(await saveForOffline(WORLD_LAYERS)).toEqual({ ok: false, reason: "unsupported" });
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

/** One read of the caches, shared by the menu and the offline banner. */
describe("offline store", () => {
  beforeEach(() => {
    setWorker("controlling");
  });

  it("reads the caches for the map on screen and tells subscribers", async () => {
    const fake = installFakeCaches();
    fake.precacheShell();
    fake.visitNotes();
    markShellAutoSaved();
    const pwa = await loadPwa();
    let heard = 0;
    pwa.subscribeOfflineCoverage(() => heard++);

    expect(pwa.getOfflineCoverageSnapshot()).toBeNull();
    pwa.setOfflineMap({ key: "world", layerSrcs: WORLD_LAYERS });

    await vi.waitFor(() => expect(pwa.getOfflineCoverageSnapshot()).toBe("notes"));
    expect(heard).toBe(1);
  });

  it("switching to a map that isn't saved drops the map claim", async () => {
    const fake = installFakeCaches();
    fake.precacheShell();
    const pwa = await loadPwa();
    await pwa.saveForOffline(WORLD_LAYERS);
    pwa.setOfflineMap({ key: "world", layerSrcs: WORLD_LAYERS });
    await vi.waitFor(() => expect(pwa.getOfflineCoverageSnapshot()).toBe("notes-and-map"));

    pwa.setOfflineMap({ key: "underdark", layerSrcs: ["atlas/assets/maps/underdark.webp"] });

    await vi.waitFor(() => expect(pwa.getOfflineCoverageSnapshot()).toBe("notes"));
  });

  it("save and clear from the menu update the shared state", async () => {
    const fake = installFakeCaches();
    fake.precacheShell();
    fake.visitNotes();
    // Same shell already auto-saved: only the menu's actions change anything.
    markShellAutoSaved();
    const pwa = await loadPwa();
    pwa.setOfflineMap({ key: "world", layerSrcs: WORLD_LAYERS });
    await vi.waitFor(() => expect(pwa.getOfflineCoverageSnapshot()).toBe("notes"));

    expect(await pwa.saveCurrentMapForOffline()).toEqual({ ok: true });
    await vi.waitFor(() => expect(pwa.getOfflineCoverageSnapshot()).toBe("notes-and-map"));

    await pwa.clearOfflineCache();
    await vi.waitFor(() => expect(pwa.getOfflineCoverageSnapshot()).toBe("none"));
  });
});

/**
 * Installing the app (a service worker activating) saves the notes and the
 * map on screen, once per app shell: first install and each new deploy.
 */
describe("automatic save on install", () => {
  let wbActivated: () => void;

  beforeEach(() => {
    wbListeners = {};
    setWorker("controlling");
    wbActivated = () => wbListeners["activated"]?.forEach((fn) => fn());
  });

  it("saves the notes and the current map when a service worker activates", async () => {
    const fake = installFakeCaches();
    const pwa = await loadPwa();
    pwa.registerServiceWorker();
    pwa.setOfflineMap({ key: "world", layerSrcs: WORLD_LAYERS });
    await vi.waitFor(() => expect(pwa.getOfflineCoverageSnapshot()).toBe("none"));

    fake.precacheShell(); // the worker's install filled the precache
    wbActivated();

    await vi.waitFor(() => expect(pwa.getOfflineCoverageSnapshot()).toBe("notes-and-map"));
    expect(fake.stored("atlas-assets")).toEqual(WORLD_URLS);
  });

  it("does not refill a cleared cache for the same app shell", async () => {
    const fake = installFakeCaches();
    fake.precacheShell();
    const pwa = await loadPwa();
    pwa.setOfflineMap({ key: "world", layerSrcs: WORLD_LAYERS });
    await vi.waitFor(() => expect(pwa.getOfflineCoverageSnapshot()).toBe("notes-and-map"));
    await pwa.clearOfflineCache();
    await vi.waitFor(() => expect(pwa.getOfflineCoverageSnapshot()).toBe("none"));
    const fetchesBefore = fake.fetches.length;

    // A reload: same shell, fresh module.
    const again = await loadPwa();
    again.setOfflineMap({ key: "world", layerSrcs: WORLD_LAYERS });
    await vi.waitFor(() => expect(again.getOfflineCoverageSnapshot()).toBe("none"));
    expect(fake.fetches.length).toBe(fetchesBefore);
  });

  it("saves again after a deploy brings a new shell, refreshing the map", async () => {
    const fake = installFakeCaches();
    fake.precacheShell("a");
    const pwa = await loadPwa();
    pwa.setOfflineMap({ key: "world", layerSrcs: WORLD_LAYERS });
    await vi.waitFor(() => expect(pwa.getOfflineCoverageSnapshot()).toBe("notes-and-map"));
    const before = fake.store.get("atlas-assets")?.get(WORLD_URLS[0]);

    fake.precacheShell("b");
    const next = await loadPwa();
    next.setOfflineMap({ key: "world", layerSrcs: WORLD_LAYERS });

    await vi.waitFor(() =>
      expect(fake.store.get("atlas-assets")?.get(WORLD_URLS[0])).not.toEqual(before),
    );
  });

  it("does nothing while offline", async () => {
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
    const fake = installFakeCaches();
    fake.precacheShell();
    const pwa = await loadPwa();
    pwa.setOfflineMap({ key: "world", layerSrcs: WORLD_LAYERS });
    await vi.waitFor(() => expect(pwa.getOfflineCoverageSnapshot()).toBe("none"));
    expect(fake.fetches).toEqual([]);
  });
});
