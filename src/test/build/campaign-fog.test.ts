// @vitest-environment node
/**
 * R-18: fog is baked per campaign, and the fog scan reads it from source.
 * Built from a temp copy of the v2 test world (`content-next/`): `oskmark` is
 * fogged in `sandbox` (west half revealed) and open in `main`; `tallowford`'s
 * frame on oskmark is under sandbox's fog (ADR-0004 rule 4).
 *
 * - Each campaign's store holds only its own picture of oskmark: sandbox a
 *   redacted `.fog.png` (never the original), main the original (never
 *   sandbox's redacted one). Compared by bytes.
 * - The pin under sandbox's fog is absent from sandbox's atlas.json and
 *   search index, and present in main's.
 * - The frame-fogged city ships nothing to sandbox (map entry, image, pins,
 *   region, route, sound, child map) and ships in full to main.
 * - The fog scan, reading sandbox's campaign file: clean on the store; a
 *   dropped fog marker is 26, main's original image in the store is 13, and
 *   the city's map entry planted back is 15.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { runBuild } from "../../../scripts/build-atlas";
import { planMapImages } from "../../../scripts/atlas/build/campaignStore";
import { run as checkFogSafety } from "../../../scripts/check-fog-safety";

const ROOT = path.resolve(__dirname, "../../..");
const tmps: string[] = [];
afterAll(() => {
  for (const t of tmps.splice(0)) fs.rmSync(t, { recursive: true, force: true });
});
afterEach(() => vi.restoreAllMocks());

const silence = () => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
};

function edit(root: string, rel: string, from: string, to: string) {
  const file = path.join(root, "content-next", rel);
  const text = fs.readFileSync(file, "utf8");
  expect(text, rel).toContain(from);
  fs.writeFileSync(file, text.replace(from, to));
}

const storeOf = (root: string, c: string) => path.join(root, ".atlas-campaigns", c, "atlas");
const content = (root: string, rel: string) => path.join(root, "content-next", rel);

function walk(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
}

/** True when `needle`'s bytes are inside any file under `dir`. */
const bytesInDir = (dir: string, needle: Buffer) =>
  walk(dir).some((f) => fs.readFileSync(f).indexOf(needle) !== -1);

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const wordsIn = (dir: string, words: string[]) => {
  const texts = walk(dir).map((f) => fs.readFileSync(f).toString("latin1"));
  return words.filter((w) =>
    texts.some((t) =>
      new RegExp(`(?<![\\p{L}\\p{N}])${escape(w)}(?![\\p{L}\\p{N}])`, "iu").test(t),
    ),
  );
};

interface Layer {
  id: string;
  src: string;
  x: number;
  y: number;
  width: number;
  height: number;
}
interface AtlasMap {
  id: string;
  parent?: string;
  layers: Layer[];
  fog?: Record<string, unknown>;
  regions?: { id: string }[];
  routes?: { id: string }[];
  soundscape?: { areas?: { regionId?: string }[] };
}
interface Atlas {
  maps: AtlasMap[];
  placements: { entityId: string; mapId: string; x: number; y: number }[];
}
const readAtlas = (store: string): Atlas =>
  JSON.parse(fs.readFileSync(path.join(store, "atlas.json"), "utf8"));
const readJson = (file: string): unknown => JSON.parse(fs.readFileSync(file, "utf8"));
const mapOf = (a: Atlas, id: string) => a.maps.find((m) => m.id === id);
const fileOf = (store: string, src: string) => path.join(store, src.replace(/^atlas\//, ""));

/** The city's items, added in the temp copy (the shared fixture's counts stay). */
const CITY_WORDS = [
  "tallowford",
  "Tallowford",
  "tallow-docks",
  "Tallow Docks",
  "chandler-lane",
  "Chandler Lane",
  "tallow-bells",
  "Tallow Bells",
  "tallowford-vaults",
  "Tallowford Vaults",
];

/** content-next with a region, route, sound area and child map on tallowford. */
async function cityWorld(): Promise<string> {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "atlas-r18-"));
  tmps.push(root);
  fs.cpSync(path.join(ROOT, "content-next"), path.join(root, "content-next"), { recursive: true });
  fs.copyFileSync(path.join(ROOT, "atlas.next.config.json"), path.join(root, "atlas.config.json"));
  edit(
    root,
    "quessaly/_atlas/world.yaml",
    "      - { note: pellam-ferry, x: 300, y: 200, visibility: player }\n",
    [
      "      - { note: pellam-ferry, x: 300, y: 200, visibility: player }",
      "    regions:",
      "      - id: tallow-docks",
      "        name: Tallow Docks",
      "        points: [[20, 20], [120, 20], [120, 90], [20, 90]]",
      "        visibility: player",
      "    routes:",
      "      - id: chandler-lane",
      "        name: Chandler Lane",
      "        waypoints: [[30, 150], [350, 160]]",
      "        visibility: player",
      "    sound:",
      "      - id: tallow-bells",
      "        name: Tallow Bells",
      "        points: [[200, 40], [280, 40], [280, 110]]",
      "        visibility: player",
      "        bed: { src: audio/tallow-bells.ogg }",
      "",
      "  - id: tallowford-vaults",
      "    name: Tallowford Vaults",
      "    width: 200",
      "    height: 100",
      "    visibility: player",
      "    parent: tallowford",
      "    frame: { x: 150, y: 150, width: 80, height: 40, rotation: 0 }",
      "    enterZoom: 2",
      "    layers:",
      "      - { id: base, src: images/tallowford-vaults.png, x: 0, y: 0, width: 200, height: 100 }",
      "    scale: { unitsPerPixel: 0.01, unitLabel: mi }",
      "    zoom: { min: 0, max: 4 }",
      "",
    ].join("\n"),
  );
  for (const c of ["main", "sandbox"]) {
    edit(
      root,
      `_atlas/campaigns/${c}.yaml`,
      "  tallowford:\n    state: open\n",
      "  tallowford:\n    state: open\n  tallowford-vaults:\n    state: open\n",
    );
  }
  await sharp({
    create: { width: 200, height: 100, channels: 4, background: { r: 90, g: 60, b: 30, alpha: 1 } },
  })
    .png()
    .toFile(content(root, "quessaly/_atlas/images/tallowford-vaults.png"));
  // Bytes no other sound has, so the store can be searched for them.
  const bells = Buffer.concat([
    fs.readFileSync(content(root, "quessaly/_atlas/audio/reed-whisper.ogg")),
    Buffer.from("tallow-bells-r18"),
  ]);
  fs.writeFileSync(content(root, "quessaly/_atlas/audio/tallow-bells.ogg"), bells);
  return root;
}

describe("R-18: fog baked per campaign", () => {
  let root: string;
  let original: Buffer;

  beforeAll(async () => {
    root = await cityWorld();
    original = fs.readFileSync(content(root, "quessaly/_atlas/images/oskmark.png"));
    silence();
    const r = await runBuild({ player: true, strict: true }, root);
    vi.restoreAllMocks();
    expect(r, r.error).toMatchObject({ ok: true, exitCode: 0 });
  });

  it("sandbox ships oskmark redacted, never the original; its fog geometry is stripped", async () => {
    const store = storeOf(root, "sandbox");
    const oskmark = mapOf(readAtlas(store), "oskmark");
    expect(oskmark).toBeDefined();
    expect(oskmark!.fog).toEqual({ mapId: "oskmark", enabled: true });
    expect(oskmark!.layers).toHaveLength(1);
    const layer = oskmark!.layers[0];
    expect(layer.src).toMatch(/^atlas\/assets\/maps\/[0-9a-f]{16}\.fog\.png$/);
    const baked = fs.readFileSync(fileOf(store, layer.src));
    expect(baked.equals(original)).toBe(false);
    expect(bytesInDir(store, original)).toBe(false);

    // The east half (x >= 300 on a 600-wide map) is transparent, the west isn't.
    const { data, info } = await sharp(baked)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const alphaAt = (mx: number, my: number) => {
      const ix = Math.floor((mx / 600) * info.width);
      const iy = Math.floor((my / 400) * info.height);
      return data[(iy * info.width + ix) * info.channels + 3];
    };
    expect(alphaAt(590, 10)).toBe(0);
    expect(alphaAt(450, 200)).toBe(0);
    expect(alphaAt(100, 200)).toBeGreaterThan(200);
  });

  it("main ships oskmark's original and not sandbox's redacted image", () => {
    const main = storeOf(root, "main");
    const oskmark = mapOf(readAtlas(main), "oskmark");
    expect(oskmark!.fog).toBeUndefined();
    expect(fs.readFileSync(fileOf(main, oskmark!.layers[0].src)).equals(original)).toBe(true);
    const sandboxLayer = mapOf(readAtlas(storeOf(root, "sandbox")), "oskmark")!.layers[0];
    const baked = fs.readFileSync(fileOf(storeOf(root, "sandbox"), sandboxLayer.src));
    expect(bytesInDir(main, baked)).toBe(false);
    expect(walk(main).some((f) => f.endsWith(".fog.png"))).toBe(false);
  });

  it("the pin under sandbox's fog is absent from sandbox's atlas.json and search index, present in main's", () => {
    const pinsOn = (c: string) =>
      readAtlas(storeOf(root, c)).placements.filter(
        (p) => p.entityId === "haskel-thimbleby" && p.mapId === "oskmark",
      );
    expect(pinsOn("sandbox")).toEqual([]);
    expect(pinsOn("main")).toEqual([
      expect.objectContaining({ entityId: "haskel-thimbleby", mapId: "oskmark", x: 450, y: 120 }),
    ]);
    // A search row carries no map or spot (`SearchIndexEntry`), so the pin
    // can't reach players through it: sandbox's row names no map and no spot.
    const hit = (c: string) =>
      (
        readJson(path.join(storeOf(root, c), "search-index.json")) as Record<string, unknown>[]
      ).find((e) => e.id === "haskel-thimbleby")!;
    const ROW_KEYS = [
      "id",
      "title",
      "type",
      "aliases",
      "tags",
      "summary",
      "excerpt",
      "bodyText",
      "dateLabel",
      "dateValue",
      "dateYear",
    ];
    for (const c of ["main", "sandbox"]) {
      for (const k of Object.keys(hit(c))) expect(ROW_KEYS, `${c}: ${k}`).toContain(k);
    }
    expect(JSON.stringify(hit("sandbox"))).not.toMatch(/oskmark|\b450\b/);
  });

  it("the frame-fogged city ships nothing to sandbox", () => {
    const store = storeOf(root, "sandbox");
    const atlas = readAtlas(store);
    expect(atlas.maps.map((m) => m.id)).not.toContain("tallowford");
    expect(atlas.maps.map((m) => m.id)).not.toContain("tallowford-vaults");
    expect(atlas.placements.filter((p) => p.mapId.startsWith("tallowford"))).toEqual([]);
    expect(wordsIn(store, CITY_WORDS)).toEqual([]);
    for (const rel of [
      "quessaly/_atlas/images/tallowford.png",
      "quessaly/_atlas/images/tallowford-vaults.png",
      "quessaly/_atlas/audio/tallow-bells.ogg",
    ]) {
      expect(bytesInDir(store, fs.readFileSync(content(root, rel))), rel).toBe(false);
    }
  });

  it("the city ships in full to main", () => {
    const store = storeOf(root, "main");
    const atlas = readAtlas(store);
    const city = mapOf(atlas, "tallowford");
    expect(city).toBeDefined();
    expect(city!.regions?.map((r) => r.id)).toContain("tallow-docks");
    expect(city!.routes?.map((r) => r.id)).toContain("chandler-lane");
    expect(city!.soundscape?.areas?.filter((a) => !a.regionId)).toHaveLength(1);
    expect(mapOf(atlas, "tallowford-vaults")?.parent).toBe("tallowford");
    expect(atlas.placements.filter((p) => p.mapId === "tallowford").length).toBeGreaterThan(0);
    for (const rel of [
      "quessaly/_atlas/images/tallowford.png",
      "quessaly/_atlas/images/tallowford-vaults.png",
      "quessaly/_atlas/audio/tallow-bells.ogg",
    ]) {
      expect(bytesInDir(store, fs.readFileSync(content(root, rel))), rel).toBe(true);
    }
  });

  describe("the fog scan reads sandbox's fog from source", () => {
    const config = () => path.join(root, "atlas.config.json");
    function copyOfSandbox(label: string): { dir: string; atlas: Atlas; save: (a: Atlas) => void } {
      const dir = path.join(root, "scan", label, "atlas");
      fs.cpSync(storeOf(root, "sandbox"), dir, { recursive: true });
      const file = path.join(dir, "atlas.json");
      return {
        dir,
        atlas: JSON.parse(fs.readFileSync(file, "utf8")),
        save: (a) => fs.writeFileSync(file, JSON.stringify(a)),
      };
    }
    const scan = async (dir: string) => {
      silence();
      const code = await checkFogSafety({
        dir,
        config: config(),
        layout: "store",
        campaign: "sandbox",
        publish: true,
      });
      vi.restoreAllMocks();
      return code;
    };

    it("is clean on sandbox's store", async () => {
      expect(await scan(copyOfSandbox("clean").dir)).toBe(0);
    });

    it("a fogged map shipped without its fog marker is 26", async () => {
      const { dir, atlas, save } = copyOfSandbox("no-marker");
      delete mapOf(atlas, "oskmark")!.fog;
      save(atlas);
      expect(await scan(dir)).toBe(26);
    });

    it("the unfogged original in the store, under any name, is 13", async () => {
      const { dir } = copyOfSandbox("original");
      fs.copyFileSync(
        content(root, "quessaly/_atlas/images/oskmark.png"),
        path.join(dir, "assets", "maps", "0123456789abcdef.png"),
      );
      expect(await scan(dir)).toBe(13);
    });

    it("the frame-fogged city's map entry planted back is 15", async () => {
      const { dir, atlas, save } = copyOfSandbox("city");
      const city = mapOf(readAtlas(storeOf(root, "main")), "tallowford")!;
      atlas.maps.push({ ...city, layers: [], regions: [], routes: [], soundscape: undefined });
      save(atlas);
      expect(await scan(dir)).toBe(15);
    });

    it("the frame-fogged city's child map planted back is 15", async () => {
      const { dir, atlas, save } = copyOfSandbox("vaults");
      const vaults = mapOf(readAtlas(storeOf(root, "main")), "tallowford-vaults")!;
      atlas.maps.push({ ...vaults, layers: [] });
      save(atlas);
      expect(await scan(dir)).toBe(15);
    });

    it("a pin on the city planted back is 15", async () => {
      const { dir, atlas, save } = copyOfSandbox("city-pin");
      atlas.placements.push({ entityId: "pellam-ferry", mapId: "tallowford", x: 300, y: 200 });
      save(atlas);
      expect(await scan(dir)).toBe(15);
    });

    it("the legacy pair (no campaign) says so in one plain line, and fog maps are still 17", async () => {
      const run = async (dir: string) => {
        silence();
        const code = await checkFogSafety({
          dir,
          config: config(),
          layout: "store",
          publish: true,
        });
        const calls = [console.log, console.warn, console.error].flatMap(
          (fn) => vi.mocked(fn).mock.calls,
        );
        vi.restoreAllMocks();
        return { code, calls };
      };
      // The legacy pair's store names no campaign.
      const legacy = (label: string, change: (a: Atlas) => void = () => {}) => {
        const c = copyOfSandbox(label);
        delete (c.atlas as { campaign?: unknown }).campaign;
        change(c.atlas);
        c.save(c.atlas);
        return c.dir;
      };
      const fogged = await run(legacy("legacy-fogged"));
      expect(fogged.code).toBe(17);
      const args = fogged.calls.flat();
      expect(args.some((a) => a instanceof Error)).toBe(false);
      expect(args.map(String).join("\n")).not.toMatch(/\n\s+at /);
      expect(args.map(String).join("\n")).toMatch(
        /no campaign: v1 store, fog campaign checks skipped/,
      );

      const open = await run(
        legacy("legacy-open", (atlas) => {
          for (const m of atlas.maps) delete m.fog;
        }),
      );
      expect(open.code).toBe(0);
      expect(open.calls.flat().some((a) => a instanceof Error)).toBe(false);
    });
  });
});

describe("R-18: a fog that can't be baked fails the build (fail closed)", () => {
  async function failing(change: (root: string) => void | Promise<void>) {
    const root = await cityWorld();
    await change(root);
    silence();
    const r = await runBuild({ player: true, strict: true }, root);
    const logged = [console.log, console.warn, console.error]
      .flatMap((fn) => vi.mocked(fn).mock.calls.flat())
      .map(String)
      .join("\n");
    vi.restoreAllMocks();
    return { root, r, logged };
  }

  it("a rotated layer on a fogged map: exit 1, nothing written", async () => {
    const { root, r, logged } = await failing((root) =>
      edit(
        root,
        "quessaly/_atlas/world.yaml",
        "src: images/oskmark.png, x: 0, y: 0, width: 600, height: 400 }",
        "src: images/oskmark.png, x: 0, y: 0, width: 600, height: 400, rotation: 90 }",
      ),
    );
    expect(r).toMatchObject({ ok: false, exitCode: 1 });
    expect(logged).toMatch(/map "oskmark" layer "base": fog can't be baked/);
    expect(fs.existsSync(path.join(root, ".atlas-campaigns"))).toBe(false);
  });

  it("an open map sharing a fogged map's image: exit 1, nothing written", async () => {
    const { root, r, logged } = await failing((root) =>
      edit(root, "quessaly/_atlas/world.yaml", "images/quessaly-world.png", "images/oskmark.png"),
    );
    expect(r).toMatchObject({ ok: false, exitCode: 1 });
    expect(logged).toMatch(/map "oskmark": its unfogged image would ship/);
    expect(fs.existsSync(path.join(root, ".atlas-campaigns"))).toBe(false);
  });

  it("an open map using a re-encoded copy of a fogged map's image: exit 1, nothing written", async () => {
    const { root, r, logged } = await failing(async (root) => {
      const images = content(root, "quessaly/_atlas/images");
      const original = fs.readFileSync(path.join(images, "oskmark.png"));
      // Same pixels, other bytes: a byte compare alone would let it ship.
      await sharp(original).png({ compressionLevel: 1 }).toFile(path.join(images, "copy.png"));
      expect(fs.readFileSync(path.join(images, "copy.png")).equals(original)).toBe(false);
      edit(root, "quessaly/_atlas/world.yaml", "images/quessaly-world.png", "images/copy.png");
    });
    expect(r).toMatchObject({ ok: false, exitCode: 1 });
    expect(logged).toMatch(/map "oskmark": its unfogged image would ship as .* \(same pixels;/);
    expect(fs.existsSync(path.join(root, ".atlas-campaigns"))).toBe(false);
  });
});

describe("R-18: planMapImages finds a fogged layer's pixels under other bytes", () => {
  it("checks every layer of a fogged map, even two of the same file size", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "atlas-r18-layers-"));
    const solid = (r: number) =>
      sharp({ create: { width: 40, height: 40, channels: 3, background: { r, g: 10, b: 10 } } })
        .png()
        .toBuffer();
    const a = await solid(100);
    const b = await solid(200);
    expect(a.length).toBe(b.length); // same size, different pixels
    fs.writeFileSync(path.join(dir, "a.png"), a);
    fs.writeFileSync(path.join(dir, "b.png"), b);
    // b's pixels, other bytes
    await sharp(b).png({ compressionLevel: 1 }).toFile(path.join(dir, "b-copy.png"));
    expect(fs.readFileSync(path.join(dir, "b-copy.png")).equals(b)).toBe(false);
    const layer = (id: string, src: string) => ({ id, src, x: 0, y: 0, width: 40, height: 40 });
    const maps = [
      {
        id: "f",
        worldId: "w",
        width: 40,
        height: 40,
        layers: [layer("one", "a.png"), layer("two", "b.png")],
        fog: { mapId: "f", enabled: true, reveals: [] },
      },
      { id: "o", worldId: "w", width: 40, height: 40, layers: [layer("base", "b-copy.png")] },
    ];
    const errors: string[] = [];
    await planMapImages(maps as never, () => dir, new Map(), errors);
    expect(errors.join("\n")).toMatch(
      /map "f": its unfogged image would ship as .* \(same pixels;/,
    );
  });
});
