/**
 * The service worker's precache list must name only files the build ships.
 * Workbox fails the whole install when one precache entry 404s, so a single
 * stale URL turns offline mode off for every player (ticket eval-43).
 *
 * The SW is generated before the player prunes delete files from dist/, so
 * the precache leaves atlas/ to the runtime caches, and a last build step
 * fails the build if sw.js names anything dist/ does not hold.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { getManifest } from "workbox-build";
import { IMAGE_EXTENSIONS } from "../../scripts/atlas/assetRefs";
import {
  PRECACHE_GLOB_IGNORES,
  PRECACHE_GLOB_PATTERNS,
  findMissingPrecacheEntries,
  listPrecacheUrls,
  precacheShippedOnlyPlugin,
} from "../../scripts/pwaPrecache";

const ROOT = path.resolve(__dirname, "../..");

function write(dir: string, rel: string, body = "x") {
  const abs = path.join(dir, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, body);
}

describe("precache globs", () => {
  let dist: string;

  beforeEach(() => {
    dist = fs.mkdtempSync(path.join(os.tmpdir(), "pwa-precache-"));
    write(dist, "index.html", "<html></html>");
    write(dist, "favicon.ico");
    write(dist, "assets/index-abc123.js");
    write(dist, "assets/index-abc123.css");
    write(dist, "placeholder.svg");
    write(dist, "atlas/atlas.json", "{}");
    // Every image the player prune may delete, plus the .ico case.
    for (const ext of [...IMAGE_EXTENSIONS, ".ico"]) {
      write(dist, `atlas/assets/maps/sample-overview${ext}`);
      write(dist, `atlas/assets/icons/deep/pin${ext}`);
    }
  });

  afterEach(() => fs.rmSync(dist, { recursive: true, force: true }));

  async function precached(): Promise<string[]> {
    const { manifestEntries } = await getManifest({
      globDirectory: dist,
      globPatterns: PRECACHE_GLOB_PATTERNS,
      globIgnores: PRECACHE_GLOB_IGNORES,
    });
    return (manifestEntries ?? []).map((e) => (typeof e === "string" ? e : e.url));
  }

  it("never precaches anything under atlas/, which the player prunes may delete", async () => {
    const urls = await precached();
    expect(urls.filter((u) => u.startsWith("atlas/"))).toEqual([]);
  });

  it("still precaches the app shell", async () => {
    const urls = await precached();
    expect(urls).toEqual(
      expect.arrayContaining([
        "index.html",
        "favicon.ico",
        "placeholder.svg",
        "assets/index-abc123.js",
        "assets/index-abc123.css",
      ]),
    );
  });
});

describe("findMissingPrecacheEntries", () => {
  let dist: string;
  const sw = (urls: string[]) =>
    `define(["./workbox-1"],(function(e){"use strict";e.precacheAndRoute([${urls
      .map((u) => `{url:"${u}",revision:"r1"}`)
      .join(",")}],{}),e.registerRoute((({url:e})=>e.pathname.includes("/atlas/assets/")))}));`;

  beforeEach(() => {
    dist = fs.mkdtempSync(path.join(os.tmpdir(), "pwa-missing-"));
    write(dist, "index.html");
    write(dist, "assets/app.js");
  });

  afterEach(() => fs.rmSync(dist, { recursive: true, force: true }));

  it("reads the precache URLs out of a generated sw.js", () => {
    expect(listPrecacheUrls(sw(["index.html", "assets/app.js"]))).toEqual([
      "index.html",
      "assets/app.js",
    ]);
  });

  it("names a precached file the build no longer ships", () => {
    write(dist, "sw.js", sw(["index.html", "assets/app.js", "atlas/assets/maps/gone.svg"]));
    expect(findMissingPrecacheEntries(dist)).toEqual(["atlas/assets/maps/gone.svg"]);
  });

  it("passes when every precached file exists", () => {
    write(dist, "sw.js", sw(["index.html", "assets/app.js"]));
    expect(findMissingPrecacheEntries(dist)).toEqual([]);
  });

  it("decodes URL-encoded names before checking", () => {
    write(dist, "assets/old map.svg");
    write(dist, "sw.js", sw(["assets/old%20map.svg"]));
    expect(findMissingPrecacheEntries(dist)).toEqual([]);
  });

  it("returns nothing when the build wrote no service worker", () => {
    expect(findMissingPrecacheEntries(dist)).toEqual([]);
  });

  it("fails rather than passing when it can't read the precache list", () => {
    write(dist, "sw.js", `e.precacheAndRoute([{revision:"r1",url:"index.html"}],{})`);
    expect(() => findMissingPrecacheEntries(dist)).toThrow(/no precache URLs/);
  });

  it("reads the sw.js a real player build wrote (workbox 7.4.1)", () => {
    const real = fs.readFileSync(path.join(__dirname, "fixtures/pwa/sw.workbox-7.4.1.js"), "utf8");
    const urls = listPrecacheUrls(real);
    expect(urls).toHaveLength(26);
    expect(urls).toContain("index.html");
    expect(urls.filter((u) => u.startsWith("atlas/"))).toEqual([]);
  });
});

describe("vite.config wiring", () => {
  const config = fs.readFileSync(path.join(ROOT, "vite.config.ts"), "utf8");

  it("uses the shared precache globs", () => {
    expect(config).toMatch(/globPatterns:\s*PRECACHE_GLOB_PATTERNS/);
    expect(config).toMatch(/globIgnores:\s*PRECACHE_GLOB_IGNORES/);
  });

  it("checks the precache after the SW is written and the player prunes have run", () => {
    expect(config).toContain("precacheShippedOnlyPlugin()");
    const hook = precacheShippedOnlyPlugin().closeBundle;
    expect(hook).toMatchObject({ order: "post", sequential: true });
  });
});
