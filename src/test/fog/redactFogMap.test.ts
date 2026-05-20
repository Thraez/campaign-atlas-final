import { describe, it, expect } from "vitest";
import sharp from "sharp";
import { redactLayer, FogRedactionError, DEFAULT_FEATHER_PX } from "../../../scripts/atlas/redactFogMap";
import type { FogOverlay } from "@/atlas/content/schema";

const sq = (x0: number, y0: number, x1: number, y1: number): [number, number][] =>
  [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];

async function solidRed(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 255, g: 0, b: 0 } },
  }).png().toBuffer();
}

async function alphaAt(buf: Buffer, x: number, y: number): Promise<number> {
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const idx = (y * info.width + x) * info.channels;
  return data[idx + 3];
}

describe("redactLayer", () => {
  const map = { width: 100, height: 100 };
  const layerRect = { x: 0, y: 0, width: 100, height: 100 };

  it("opaque inside the reveal, transparent far outside, soft band in feather range", async () => {
    const fog: FogOverlay = {
      mapId: "m",
      enabled: true,
      reveals: [sq(20, 20, 60, 60)],
      featherPx: 8,
    };
    const input = await solidRed(100, 100);
    const out = await redactLayer(input, map, fog, layerRect);

    // (40,40): well inside the 40x40 reveal → fully lit
    expect(await alphaAt(out, 40, 40)).toBeGreaterThanOrEqual(250);
    // (5,5): well outside the reveal → fully fogged
    expect(await alphaAt(out, 5, 5)).toBe(0);
    // ~featherPx outside the left edge (reveal x=20): pixel at x=14 (6px outside) — in soft band
    const band = await alphaAt(out, 14, 40);
    expect(band).toBeGreaterThan(0);
    expect(band).toBeLessThan(255);
  });

  it("conceal subtracts from reveal", async () => {
    const fog: FogOverlay = {
      mapId: "m",
      enabled: true,
      reveals: [sq(10, 10, 90, 90)],
      conceals: [sq(40, 40, 60, 60)],
      featherPx: 4,
    };
    const input = await solidRed(100, 100);
    const out = await redactLayer(input, map, fog, layerRect);
    // (50,50): inside conceal (inside reveal but punched by conceal) → fogged
    expect(await alphaAt(out, 50, 50)).toBe(0);
    // (20,20): inside reveal, outside conceal → lit
    expect(await alphaAt(out, 20, 20)).toBeGreaterThanOrEqual(250);
  });

  it("uses DEFAULT_FEATHER_PX when fog.featherPx is undefined", async () => {
    expect(DEFAULT_FEATHER_PX).toBe(16);
    const fog: FogOverlay = { mapId: "m", enabled: true, reveals: [sq(20, 20, 60, 60)] };
    const input = await solidRed(100, 100);
    // Should not throw; result should be a PNG buffer
    const out = await redactLayer(input, map, fog, layerRect);
    expect(out).toBeInstanceOf(Buffer);
    expect(out.length).toBeGreaterThan(0);
  });

  it("throws FogRedactionError when layer has tileSrc", async () => {
    const fog: FogOverlay = { mapId: "m", enabled: true, reveals: [sq(0, 0, 100, 100)] };
    const input = await solidRed(100, 100);
    await expect(
      redactLayer(input, map, fog, { ...layerRect, tileSrc: "https://tiles.example/{z}/{x}/{y}.png" })
    ).rejects.toBeInstanceOf(FogRedactionError);
  });
});
