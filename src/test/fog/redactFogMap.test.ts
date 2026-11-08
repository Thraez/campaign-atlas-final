import { describe, it, expect } from "vitest";
import sharp from "sharp";
import {
  redactLayer,
  FogRedactionError,
  DEFAULT_FEATHER_PX,
} from "../../../scripts/atlas/redactFogMap";
import type { FogOverlay } from "@/atlas/content/schema";
import { isLit } from "@/atlas/fog/effectiveLit";

const sq = (x0: number, y0: number, x1: number, y1: number): [number, number][] => [
  [x0, y0],
  [x1, y0],
  [x1, y1],
  [x0, y1],
];

async function solidRed(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 255, g: 0, b: 0 } },
  })
    .png()
    .toBuffer();
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
    // The feather softens only into the lit side (R-07b): 6px outside the
    // left edge (reveal x=20) is fog, fully redacted; 2px inside is soft.
    expect(await alphaAt(out, 14, 40)).toBe(0);
    const band = await alphaAt(out, 22, 40);
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
      redactLayer(input, map, fog, {
        ...layerRect,
        tileSrc: "https://tiles.example/{z}/{x}/{y}.png",
      }),
    ).rejects.toBeInstanceOf(FogRedactionError);
  });
});

/**
 * R-07b: no fogged pixel may show image, whatever the feather. A pixel is
 * fogged when its centre is outside every reveal or inside any conceal; small
 * fog shapes and thin fog gaps are where a blur centred on the edge leaked.
 */
describe("redactLayer never shows image under fog", () => {
  const map = { width: 400, height: 400 };
  const layerRect = { x: 0, y: 0, width: 400, height: 400 };
  const cases: Array<[string, Omit<FogOverlay, "featherPx">, [number, number, number, number]]> = [
    [
      "a 10x10 fog shape (conceal)",
      {
        mapId: "m",
        enabled: true,
        reveals: [sq(0, 0, 400, 400)],
        conceals: [sq(200, 200, 210, 210)],
      },
      [200, 200, 210, 210],
    ],
    [
      "a 4px fog gap between two reveals",
      { mapId: "m", enabled: true, reveals: [sq(0, 0, 200, 400), sq(204, 0, 400, 400)] },
      [200, 0, 204, 400],
    ],
    [
      "a big fog shape (conceal)",
      {
        mapId: "m",
        enabled: true,
        reveals: [sq(0, 0, 400, 400)],
        conceals: [sq(50, 50, 250, 250)],
      },
      [50, 50, 250, 250],
    ],
  ];

  for (const [label, base, [x0, y0, x1, y1]] of cases) {
    for (const featherPx of [0, 16, 200]) {
      it(`${label}: every fogged pixel is alpha 0 at featherPx ${featherPx}`, async () => {
        const fog: FogOverlay = { ...base, featherPx };
        const out = await redactLayer(await solidRed(400, 400), map, fog, layerRect);
        const { data, info } = await sharp(out)
          .ensureAlpha()
          .raw()
          .toBuffer({ resolveWithObject: true });
        const alpha = (x: number, y: number) => data[(y * info.width + x) * info.channels + 3];
        const leaks: string[] = [];
        for (let y = 0; y < 400; y++) {
          for (let x = 0; x < 400; x++) {
            const fogged =
              (x >= x0 && x < x1 && y >= y0 && y < y1) || !isLit(x + 0.5, y + 0.5, fog);
            if (fogged && alpha(x, y) !== 0) leaks.push(`(${x},${y})=${alpha(x, y)}`);
          }
        }
        expect(leaks.slice(0, 5)).toEqual([]);
        // The lit side still shows the map away from the fog.
        if (featherPx <= 16) expect(alpha(5, 395)).toBeGreaterThanOrEqual(250);
      });
    }
  }
});
