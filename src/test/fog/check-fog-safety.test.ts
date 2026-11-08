/**
 * Tests for scripts/check-fog-safety.ts — fog safety scanner.
 *
 * Each test plants a player artifact in a temp dir in one of the two layouts
 * the scan registry runs it on (`scripts/atlas/scanRegistry.ts`):
 *   - "dist":  the built site, `dist/atlas/atlas.json` + `dist/atlas/assets/…`
 *   - "store": the source store, `public/atlas/atlas.json` + `public/atlas/assets/…`
 * Layer `src` values are site-root relative (`atlas/assets/maps/…`), as the
 * build writes them.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { main, run } from "../../../scripts/check-fog-safety";

type Layout = "dist" | "store";

let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "fog-safety-"));
});
afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

/** Write atlas.config.json + content/<worldId>/_atlas/world.yaml; returns the config path. */
function writeSourceConfig(worldYaml: string | null): string {
  const config = path.join(root, "atlas.config.json");
  fs.writeFileSync(config, JSON.stringify({ contentRoot: "content", defaultWorld: "w" }));
  if (worldYaml !== null) {
    const worldAtlasDir = path.join(root, "content", "w", "_atlas");
    fs.mkdirSync(worldAtlasDir, { recursive: true });
    fs.writeFileSync(path.join(worldAtlasDir, "world.yaml"), worldYaml);
  }
  return config;
}

/**
 * Plant a player artifact: atlas.json plus `files` (paths relative to the
 * atlas dir). Returns the dir the registry would hand the scan.
 */
function plant(layout: Layout, atlas: object, files: Record<string, Buffer> = {}): string {
  const target = layout === "dist" ? path.join(root, "dist") : path.join(root, "public", "atlas");
  const atlasDir = layout === "dist" ? path.join(target, "atlas") : target;
  fs.mkdirSync(atlasDir, { recursive: true });
  fs.writeFileSync(path.join(atlasDir, "atlas.json"), JSON.stringify(atlas));
  for (const [rel, bytes] of Object.entries(files)) {
    const file = path.join(atlasDir, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, bytes);
  }
  return target;
}

/** A 10×10 RGBA PNG, fully transparent or fully opaque white. */
function png(alpha: 0 | 1): Promise<Buffer> {
  return sharp({
    create: { width: 10, height: 10, channels: 4, background: { r: 255, g: 255, b: 255, alpha } },
  })
    .png()
    .toBuffer();
}

const FOG_SRC = "atlas/assets/maps/world.fog.png";
const FOG_FILE = "assets/maps/world.fog.png";

/** A player atlas with one fog-enabled 100×100 map, stripped to {mapId, enabled}. */
function fogAtlas(
  over: { src?: string; fog?: object; placements?: object[]; sound?: object[] } = {},
): Record<string, unknown> {
  return {
    maps: [
      {
        id: "world",
        width: 100,
        height: 100,
        layers: [{ id: "lyr", src: over.src ?? FOG_SRC, x: 0, y: 0, width: 100, height: 100 }],
        fog: over.fog ?? { mapId: "world", enabled: true },
        ...(over.sound ? { soundscape: { areas: over.sound } } : {}),
      },
    ],
    placements: over.placements ?? [],
  };
}

// Reveal covering [20,20]-[60,60] inside a 100×100 map: the corners are fogged.
const CLEAN_WORLD_YAML = `schemaVersion: 1
maps:
  - id: world
    worldId: w
    name: World
    width: 100
    height: 100
    layers:
      - id: lyr
        src: atlas/assets/maps/world.png
        x: 0
        "y": 0
        width: 100
        height: 100
        opacity: 1
        zIndex: 1
fog:
  - mapId: world
    enabled: true
    reveals:
      - [[20, 20], [60, 20], [60, 60], [20, 60]]
    featherPx: 4
`;

describe("check-fog-safety", () => {
  describe.each<Layout>(["dist", "store"])("%s layout", (layout) => {
    it("clean fog-enabled map → exit 0", async () => {
      const config = writeSourceConfig(CLEAN_WORLD_YAML);
      const dir = plant(
        layout,
        fogAtlas({ placements: [{ entityId: "e1", mapId: "world", x: 40, y: 40 }] }),
        { [FOG_FILE]: await png(0) },
      );
      expect(await run({ dir, config })).toBe(0);
    });

    it("alpha-leak (16): redacted PNG opaque at a known-fogged corner", async () => {
      const config = writeSourceConfig(CLEAN_WORLD_YAML);
      const dir = plant(layout, fogAtlas(), { [FOG_FILE]: await png(1) });
      expect(await run({ dir, config })).toBe(16);
    });

    it("a fog layer whose .fog.png is missing is a finding (17), not a skip", async () => {
      const config = writeSourceConfig(CLEAN_WORLD_YAML);
      const dir = plant(layout, fogAtlas());
      expect(await run({ dir, config })).toBe(17);
    });

    it("image-leak (13): layer src is a plain .png on a fog-enabled map", async () => {
      const dir = plant(layout, fogAtlas({ src: "atlas/assets/maps/world.png" }));
      expect(await run({ dir, config: path.join(root, "none.json") })).toBe(13);
    });

    it("geometry-leak (14): player atlas.fog.reveals not stripped", async () => {
      const fog = { mapId: "world", enabled: true, reveals: [[[1, 1]]] };
      const dir = plant(layout, fogAtlas({ fog }), { [FOG_FILE]: await png(0) });
      expect(await run({ dir, config: path.join(root, "none.json") })).toBe(14);
    });

    it("in-fog-content (15): placement outside the source reveal", async () => {
      const config = writeSourceConfig(CLEAN_WORLD_YAML);
      const placements = [{ entityId: "secret-entity", mapId: "world", x: 90, y: 90 }];
      const dir = plant(layout, fogAtlas({ placements }), { [FOG_FILE]: await png(0) });
      expect(await run({ dir, config })).toBe(15);
    });

    it("sound-in-fog (21): a shipped sound-only area with a point outside the source reveal", async () => {
      const config = writeSourceConfig(CLEAN_WORLD_YAML);
      const area = (points: number[][], regionId?: string) => ({
        id: "area-0",
        ...(regionId ? { regionId } : {}),
        points,
        bed: { src: "atlas/assets/audio/a.ogg" },
      });
      const lit = area([
        [30, 30],
        [50, 30],
        [50, 50],
      ]);
      const fogged = area([
        [30, 30],
        [90, 30],
        [50, 50],
      ]);
      const files = { [FOG_FILE]: await png(0) };
      expect(await run({ dir: plant(layout, fogAtlas({ sound: [lit] }), files), config })).toBe(0);
      expect(
        await run({ dir: plant(layout, fogAtlas({ sound: [lit, fogged] }), files), config }),
      ).toBe(21);
      // A ride-on area plays in its region's polygon, which 15 checks.
      const rideOn = area([[90, 90]], "r1");
      expect(await run({ dir: plant(layout, fogAtlas({ sound: [rideOn] }), files), config })).toBe(
        0,
      );
    });

    it("sound-in-fog (21): fog between lit corners counts (whole area tested)", async () => {
      // Lit strips x 0-300 and 700-1000, fog between; the area spans 100-900.
      const config = writeSourceConfig(`schemaVersion: 1
maps:
  - id: world
    worldId: w
    name: World
    width: 1000
    height: 1000
    layers: []
fog:
  - mapId: world
    enabled: true
    reveals:
      - [[0, 0], [300, 0], [300, 1000], [0, 1000]]
      - [[700, 0], [1000, 0], [1000, 1000], [700, 1000]]
`);
      const atlas = (x0: number, x1: number) => ({
        maps: [
          {
            id: "world",
            width: 1000,
            height: 1000,
            layers: [],
            fog: { mapId: "world", enabled: true },
            soundscape: {
              areas: [
                {
                  id: "area-0",
                  points: [
                    [x0, 100],
                    [x1, 100],
                    [x1, 900],
                    [x0, 900],
                  ],
                  bed: { src: "atlas/assets/audio/a.ogg" },
                },
              ],
            },
          },
        ],
        placements: [],
      });
      expect(await run({ dir: plant(layout, atlas(100, 200)), config })).toBe(0);
      expect(await run({ dir: plant(layout, atlas(100, 900)), config })).toBe(21);
    });

    it("could-not-verify (17): present-but-broken world.yaml on a clean fog map", async () => {
      // Markdown fences make loadWorldConfig throw (its hard-fail guard).
      const config = writeSourceConfig("```yaml\nschemaVersion: 1\n```");
      const dir = plant(layout, fogAtlas(), { [FOG_FILE]: await png(0) });
      expect(await run({ dir, config })).toBe(17);
    });

    it("absent world.yaml is legitimate → exit 0 (distinct from broken/17)", async () => {
      const config = writeSourceConfig(null);
      const dir = plant(layout, fogAtlas(), { [FOG_FILE]: await png(0) });
      expect(await run({ dir, config })).toBe(0);
    });
  });

  it("image-leak (13): the original map ships beside the redacted one in dist", async () => {
    const config = writeSourceConfig(CLEAN_WORLD_YAML);
    const dir = plant("dist", fogAtlas(), {
      [FOG_FILE]: await png(0),
      "assets/maps/world.png": await png(1),
    });
    expect(await run({ dir, config })).toBe(13);
  });

  it.each([".webp", ".jpg"])(
    "image-leak (13): a %s original ships beside the redacted one in dist",
    async (ext) => {
      const config = writeSourceConfig(CLEAN_WORLD_YAML);
      const dir = plant("dist", fogAtlas(), {
        [FOG_FILE]: await png(0),
        [`assets/maps/world${ext}`]: Buffer.from("not really an image"),
      });
      expect(await run({ dir, config })).toBe(13);
    },
  );

  it("a built site with no atlas/atlas.json fails (17) when the layout is given", async () => {
    const dir = path.join(root, "dist");
    fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, "index.html"), "<html>");
    expect(await run({ dir, layout: "built-site" })).toBe(17);
  });

  it("a built site is not read from <dir>/atlas.json when the layout is given", async () => {
    const dir = plant("store", fogAtlas()); // atlas.json at the top, as the store has it
    expect(await run({ dir, layout: "built-site" })).toBe(17);
  });

  it("a store with no atlas.json is skipped (exit 0)", async () => {
    const dir = path.join(root, "public", "atlas");
    fs.mkdirSync(dir, { recursive: true });
    expect(await run({ dir, layout: "store" })).toBe(0);
  });

  it("the original map beside the redacted one in the source store is not a leak", async () => {
    // public/atlas is the DM's store: the build reads the original from there,
    // and the player build prunes it from dist.
    const config = writeSourceConfig(CLEAN_WORLD_YAML);
    const dir = plant("store", fogAtlas(), {
      [FOG_FILE]: await png(0),
      "assets/maps/world.png": await png(1),
    });
    expect(await run({ dir, config })).toBe(0);
  });

  it("missing artifact dir → exit 0", async () => {
    expect(await run({ dir: path.join(root, "nonexistent-dir") })).toBe(0);
  });

  it("bad invocation (no args) → exit 1", async () => {
    const argv = process.argv;
    process.argv = ["node", "check-fog-safety.ts"];
    try {
      expect(await main()).toBe(1);
    } finally {
      process.argv = argv;
    }
  });
});
