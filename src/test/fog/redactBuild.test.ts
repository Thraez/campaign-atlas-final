/**
 * Build-level test for D3: confirms a player build of a fog-enabled map
 * writes a redacted .fog.png layer, the player atlas.json references it,
 * the original layer file is NOT referenced by the player atlas, and the
 * fog object in the player atlas carries only { mapId, enabled: true }.
 *
 * Fixture layout (created in a temp dir, cleaned up after):
 *   <tmpDir>/
 *     atlas.config.json
 *     content/
 *       w/
 *         _atlas/
 *           world.yaml
 *     public/
 *       atlas/
 *         assets/
 *           maps/
 *             world.png   ← solid-blue 100×100 PNG
 *     out/               ← created by the player build
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";

let tmpDir: string;
let origCwd: string;

/** Pixel alpha at (x, y) from a PNG buffer. */
async function alphaAt(buf: Buffer, x: number, y: number): Promise<number> {
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return data[(y * info.width + x) * info.channels + 3];
}

beforeAll(async () => {
  origCwd = process.cwd();
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fog-build-"));

  // ---- atlas.config.json ----
  fs.writeFileSync(
    path.join(tmpDir, "atlas.config.json"),
    JSON.stringify({
      contentRoot: "content",
      outputDir: "out",
      defaultWorld: "w",
      include: ["**/*.md"],
      exclude: [],
    })
  );

  // ---- world.yaml in content/w/_atlas/ ----
  const worldAtlasDir = path.join(tmpDir, "content", "w", "_atlas");
  fs.mkdirSync(worldAtlasDir, { recursive: true });

  // Top-level fog: array; layer has no zIndex because schema shows it optional.
  const worldYaml = `schemaVersion: 1
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
  fs.writeFileSync(path.join(worldAtlasDir, "world.yaml"), worldYaml);

  // ---- Solid-blue 100×100 PNG ----
  const mapsDir = path.join(tmpDir, "public", "atlas", "assets", "maps");
  fs.mkdirSync(mapsDir, { recursive: true });
  const img = await sharp({
    create: { width: 100, height: 100, channels: 3, background: { r: 0, g: 0, b: 255 } },
  })
    .png()
    .toBuffer();
  fs.writeFileSync(path.join(mapsDir, "world.png"), img);
});

afterAll(() => {
  process.chdir(origCwd);
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("D3: fog redaction wired into player build", () => {
  it("writes <name>.fog.png and player atlas references it; fog geometry stripped", async () => {
    process.chdir(tmpDir);
    const { runBuild } = await import("../../../scripts/build-atlas");

    const r = await runBuild({ player: true, strict: false });
    expect(r.ok, `build failed: ${r.error ?? ""}`).toBe(true);

    const atlasJson = path.join(tmpDir, "out", "atlas.json");
    expect(fs.existsSync(atlasJson)).toBe(true);

    const atlas = JSON.parse(fs.readFileSync(atlasJson, "utf8"));
    const map = atlas.maps.find((m: { id: string }) => m.id === "world");
    expect(map).toBeDefined();

    // Layer src must point to the redacted file.
    expect(map.layers[0].src).toBe("atlas/assets/maps/world.fog.png");

    // Redacted PNG exists on disk.
    expect(
      fs.existsSync(path.join(tmpDir, "public", "atlas", "assets", "maps", "world.fog.png"))
    ).toBe(true);

    // Fog geometry stripped — only mapId + enabled remain.
    expect(map.fog).toBeDefined();
    expect(map.fog.mapId).toBe("world");
    expect(map.fog.enabled).toBe(true);
    expect(map.fog.reveals).toBeUndefined();
    expect(map.fog.conceals).toBeUndefined();
    expect(map.fog.featherPx).toBeUndefined();
    expect(map.fog.color).toBeUndefined();

    // Pixel inside the reveal square is opaque; pixel outside is transparent.
    const fogPng = fs.readFileSync(
      path.join(tmpDir, "public", "atlas", "assets", "maps", "world.fog.png")
    );
    expect(await alphaAt(fogPng, 40, 40)).toBeGreaterThanOrEqual(250); // inside reveal
    expect(await alphaAt(fogPng, 5, 5)).toBe(0);                       // outside reveal
  });

  it("throws FogRedactionError for a tiled layer on a fog-enabled map", async () => {
    process.chdir(tmpDir);

    // Rewrite world.yaml with a tiled layer.
    const tiledYaml = `schemaVersion: 1
maps:
  - id: world
    worldId: w
    name: World
    width: 100
    height: 100
    layers:
      - id: lyr
        src: atlas/assets/maps/world.png
        tileSrc: https://tiles.example/{z}/{x}/{y}.png
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
`;
    fs.writeFileSync(
      path.join(tmpDir, "content", "w", "_atlas", "world.yaml"),
      tiledYaml
    );

    const { runBuild } = await import("../../../scripts/build-atlas");
    const r = await runBuild({ player: true, strict: false });
    // runBuild catches all errors and returns a result — it never rejects.
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/tiled|fog/i);
  });
});
