/**
 * Tests for scripts/check-fog-safety.ts — fog safety scanner.
 *
 * Each test builds a minimal temp fixture (atlas.json + optional PNGs +
 * optional source config) in a scratch dir, then calls main() directly.
 *
 * CWD is changed per-test so the script resolves atlas.config.json from the
 * fixture root. Restored in afterEach.
 */
import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";

const origCwd = process.cwd();

afterEach(() => {
  // Ensure CWD is always restored so temp dirs can be deleted on Windows.
  process.chdir(origCwd);
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a temp dir and return its path. Caller cleans up. */
function mkTmp(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "fog-safety-"));
}

/** Write atlas.config.json + content/<worldId>/_atlas/world.yaml */
function writeSourceConfig(
  dir: string,
  worldId: string,
  worldYaml: string,
): void {
  fs.writeFileSync(
    path.join(dir, "atlas.config.json"),
    JSON.stringify({
      contentRoot: "content",
      outputDir: "out",
      defaultWorld: worldId,
      include: ["**/*.md"],
      exclude: [],
    }),
  );
  const worldAtlasDir = path.join(dir, "content", worldId, "_atlas");
  fs.mkdirSync(worldAtlasDir, { recursive: true });
  fs.writeFileSync(path.join(worldAtlasDir, "world.yaml"), worldYaml);
}

/** Write a minimal player atlas.json to <dir>/atlas.json */
function writePlayerAtlas(dir: string, atlas: object): void {
  fs.writeFileSync(path.join(dir, "atlas.json"), JSON.stringify(atlas));
}

/** Build a 10×10 RGBA PNG that is fully transparent. */
async function buildTransparentPng(): Promise<Buffer> {
  return sharp({
    create: { width: 10, height: 10, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .png()
    .toBuffer();
}

/** Build a 10×10 RGBA PNG that is fully opaque (white). */
async function buildOpaquePng(): Promise<Buffer> {
  return sharp({
    create: { width: 10, height: 10, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } },
  })
    .png()
    .toBuffer();
}

// ---------------------------------------------------------------------------
// World YAML with a reveal covering [20,20]-[60,60] inside a 100×100 map.
// Corners (0,0) etc. are outside the reveal — guaranteed fogged.
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// Test 1: Clean fog-enabled map → exit 0
// ---------------------------------------------------------------------------
describe("check-fog-safety", () => {
  it("clean fog-enabled map → exit 0", async () => {
    const dir = mkTmp();
    try {
      // Source config: fog reveals [20,20]-[60,60]
      writeSourceConfig(dir, "w", CLEAN_WORLD_YAML);

      // Player atlas: .fog.png layer, fog stripped to {mapId, enabled}
      const artifactDir = path.join(dir, "out");
      fs.mkdirSync(artifactDir, { recursive: true });
      writePlayerAtlas(artifactDir, {
        maps: [
          {
            id: "world",
            width: 100,
            height: 100,
            layers: [
              {
                id: "lyr",
                src: "atlas/assets/maps/world.fog.png",
                x: 0,
                y: 0,
                width: 100,
                height: 100,
              },
            ],
            fog: { mapId: "world", enabled: true },
          },
        ],
        placements: [
          // Placement inside the reveal — should be clean
          { entityId: "e1", mapId: "world", x: 40, y: 40 },
        ],
      });

      // Write a transparent .fog.png (all fogged pixels have alpha=0)
      // The corner probe (0,0) is outside reveal → should be transparent.
      const pngBuf = await buildTransparentPng();
      const layerDir = path.join(artifactDir, "atlas", "assets", "maps");
      fs.mkdirSync(layerDir, { recursive: true });
      fs.writeFileSync(path.join(layerDir, "world.fog.png"), pngBuf);

      process.chdir(dir);
      const { main } = await import("../../../scripts/check-fog-safety");
      process.argv = ["node", "check-fog-safety.ts", "out"];
      const code = await main();
      expect(code).toBe(0);
    } finally {
      process.chdir(origCwd);
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  // -------------------------------------------------------------------------
  // Test 2: IMAGE-LEAK (13) — layer src does not end in .fog.png
  // -------------------------------------------------------------------------
  it("image-leak (13): layer src is plain .png on fog-enabled map", async () => {
    const dir = mkTmp();
    try {
      const artifactDir = path.join(dir, "out");
      fs.mkdirSync(artifactDir, { recursive: true });
      writePlayerAtlas(artifactDir, {
        maps: [
          {
            id: "world",
            width: 100,
            height: 100,
            layers: [
              {
                id: "lyr",
                src: "atlas/assets/maps/world.png",  // NOT .fog.png
                x: 0,
                y: 0,
                width: 100,
                height: 100,
              },
            ],
            fog: { mapId: "world", enabled: true },
          },
        ],
        placements: [],
      });

      process.chdir(dir);
      const { main } = await import("../../../scripts/check-fog-safety");
      process.argv = ["node", "check-fog-safety.ts", "out"];
      const code = await main();
      expect(code).toBe(13);
    } finally {
      process.chdir(origCwd);
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  // -------------------------------------------------------------------------
  // Test 3: GEOMETRY-LEAK (14) — fog object retains reveals
  // -------------------------------------------------------------------------
  it("geometry-leak (14): player atlas.fog.reveals not stripped", async () => {
    const dir = mkTmp();
    try {
      const artifactDir = path.join(dir, "out");
      fs.mkdirSync(artifactDir, { recursive: true });
      writePlayerAtlas(artifactDir, {
        maps: [
          {
            id: "world",
            width: 100,
            height: 100,
            layers: [
              {
                id: "lyr",
                src: "atlas/assets/maps/world.fog.png",
                x: 0,
                y: 0,
                width: 100,
                height: 100,
              },
            ],
            fog: {
              mapId: "world",
              enabled: true,
              reveals: [[[1, 1], [2, 1], [2, 2], [1, 2]]],  // LEAK: geometry not stripped
            },
          },
        ],
        placements: [],
      });

      process.chdir(dir);
      const { main } = await import("../../../scripts/check-fog-safety");
      process.argv = ["node", "check-fog-safety.ts", "out"];
      const code = await main();
      expect(code).toBe(14);
    } finally {
      process.chdir(origCwd);
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  // -------------------------------------------------------------------------
  // Test 4: IN-FOG-CONTENT (15) — placement is inside fog by source geometry
  // -------------------------------------------------------------------------
  it("in-fog-content (15): placement at (90,90) is outside the source reveal", async () => {
    const dir = mkTmp();
    try {
      writeSourceConfig(dir, "w", CLEAN_WORLD_YAML);

      const artifactDir = path.join(dir, "out");
      fs.mkdirSync(artifactDir, { recursive: true });
      writePlayerAtlas(artifactDir, {
        maps: [
          {
            id: "world",
            width: 100,
            height: 100,
            layers: [
              {
                id: "lyr",
                src: "atlas/assets/maps/world.fog.png",
                x: 0,
                y: 0,
                width: 100,
                height: 100,
              },
            ],
            fog: { mapId: "world", enabled: true },
          },
        ],
        placements: [
          // (90,90) is outside the reveal [20,20]-[60,60] — should be in fog
          { entityId: "secret-entity", mapId: "world", x: 90, y: 90 },
        ],
      });

      process.chdir(dir);
      const { main } = await import("../../../scripts/check-fog-safety");
      process.argv = ["node", "check-fog-safety.ts", "out"];
      const code = await main();
      expect(code).toBe(15);
    } finally {
      process.chdir(origCwd);
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  // -------------------------------------------------------------------------
  // Test 5: ALPHA-LEAK (16) — redacted PNG is opaque at a known-fogged corner
  // -------------------------------------------------------------------------
  it("alpha-leak (16): redacted PNG opaque at known-fogged corner (0,0)", async () => {
    const dir = mkTmp();
    try {
      writeSourceConfig(dir, "w", CLEAN_WORLD_YAML);

      const artifactDir = path.join(dir, "out");
      fs.mkdirSync(artifactDir, { recursive: true });
      writePlayerAtlas(artifactDir, {
        maps: [
          {
            id: "world",
            width: 100,
            height: 100,
            layers: [
              {
                id: "lyr",
                src: "atlas/assets/maps/world.fog.png",
                x: 0,
                y: 0,
                width: 100,
                height: 100,
              },
            ],
            fog: { mapId: "world", enabled: true },
          },
        ],
        placements: [],
      });

      // Write a FULLY OPAQUE PNG — corner (0,0) is fogged but has alpha=255
      const pngBuf = await buildOpaquePng();
      const layerDir = path.join(artifactDir, "atlas", "assets", "maps");
      fs.mkdirSync(layerDir, { recursive: true });
      fs.writeFileSync(path.join(layerDir, "world.fog.png"), pngBuf);

      process.chdir(dir);
      const { main } = await import("../../../scripts/check-fog-safety");
      process.argv = ["node", "check-fog-safety.ts", "out"];
      const code = await main();
      expect(code).toBe(16);
    } finally {
      process.chdir(origCwd);
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  // -------------------------------------------------------------------------
  // Test 6: Missing artifact dir → exit 0 (skip message)
  // -------------------------------------------------------------------------
  it("missing artifact dir → exit 0", async () => {
    const dir = mkTmp();
    try {
      process.chdir(dir);
      const { main } = await import("../../../scripts/check-fog-safety");
      process.argv = ["node", "check-fog-safety.ts", "nonexistent-dir"];
      const code = await main();
      expect(code).toBe(0);
    } finally {
      process.chdir(origCwd);
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  // -------------------------------------------------------------------------
  // Test 7: Bad invocation (no args) → exit 1
  // -------------------------------------------------------------------------
  it("bad invocation (no args) → exit 1", async () => {
    const dir = mkTmp();
    try {
      process.chdir(dir);
      const { main } = await import("../../../scripts/check-fog-safety");
      process.argv = ["node", "check-fog-safety.ts"];
      const code = await main();
      expect(code).toBe(1);
    } finally {
      process.chdir(origCwd);
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
