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

/** Every image pixel whose centre (mapped onto the layer rect) is fogged by
 *  isLit must be alpha 0. Returns the first few leaks. */
async function leaksIn(
  out: Buffer,
  fog: FogOverlay,
  layer: { x: number; y: number; width: number; height: number },
): Promise<{
  leaks: string[];
  width: number;
  height: number;
  alpha: (x: number, y: number) => number;
}> {
  const { data, info } = await sharp(out).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const alpha = (x: number, y: number) => data[(y * info.width + x) * info.channels + 3];
  const leaks: string[] = [];
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const mx = layer.x + ((x + 0.5) * layer.width) / info.width;
      const my = layer.y + ((y + 0.5) * layer.height) / info.height;
      if (!isLit(mx, my, fog) && alpha(x, y) !== 0) leaks.push(`(${x},${y})=${alpha(x, y)}`);
    }
  }
  return { leaks: leaks.slice(0, 5), width: info.width, height: info.height, alpha };
}

describe("redactLayer: source images that already have alpha", () => {
  it("fogs an RGBA source and never makes a pixel more opaque", async () => {
    // 200x200 RGBA: opaque red, except a half-transparent block (alpha 100)
    // at 20-40 in the lit half and another at 150-170 in the fogged half.
    const w = 200;
    const px = Buffer.alloc(w * w * 4);
    for (let y = 0; y < w; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        px[i] = 255;
        const soft =
          (x >= 20 && x < 40 && y >= 20 && y < 40) || (x >= 150 && x < 170 && y >= 20 && y < 40);
        px[i + 3] = soft ? 100 : 255;
      }
    }
    const input = await sharp(px, { raw: { width: w, height: w, channels: 4 } })
      .png()
      .toBuffer();
    // Fog over x 100-200: only the left half is revealed.
    const fog: FogOverlay = {
      mapId: "m",
      enabled: true,
      reveals: [sq(0, 0, 100, 200)],
      featherPx: 4,
    };
    const rect = { x: 0, y: 0, width: w, height: w };
    const out = await redactLayer(input, { width: w, height: w }, fog, rect);

    const { leaks, alpha, width, height } = await leaksIn(out, fog, rect);
    expect([width, height]).toEqual([w, w]);
    expect(leaks).toEqual([]);
    expect(alpha(150, 100)).toBe(0); // the reviewer's probe
    expect(alpha(160, 30)).toBe(0); // half-transparent and fogged
    expect(alpha(30, 30)).toBe(100); // half-transparent and lit: unchanged
    expect(alpha(30, 100)).toBe(255); // opaque and lit
    // No pixel got more opaque than its source.
    const { data } = await sharp(out).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    let raised = 0;
    for (let i = 3; i < data.length; i += 4) if (data[i] > px[i]) raised++;
    expect(raised).toBe(0);
  });

  it("fogs a greyscale+alpha source and a 16-bit RGBA source", async () => {
    const fog: FogOverlay = {
      mapId: "m",
      enabled: true,
      reveals: [sq(0, 0, 50, 100)],
      featherPx: 0,
    };
    const rect = { x: 0, y: 0, width: 100, height: 100 };
    const grey = await sharp({
      create: {
        width: 100,
        height: 100,
        channels: 4,
        background: { r: 128, g: 128, b: 128, alpha: 1 },
      },
    })
      .toColourspace("b-w")
      .png()
      .toBuffer();
    const deep = await sharp({
      create: {
        width: 100,
        height: 100,
        channels: 4,
        background: { r: 255, g: 0, b: 0, alpha: 1 },
      },
    })
      .toColourspace("rgb16")
      .png()
      .toBuffer();
    for (const input of [grey, deep]) {
      const out = await redactLayer(input, { width: 100, height: 100 }, fog, rect);
      const { leaks, alpha } = await leaksIn(out, fog, rect);
      expect(leaks).toEqual([]);
      expect(alpha(75, 50)).toBe(0);
      expect(alpha(10, 50)).toBe(255);
    }
  });
});

/**
 * The layer rect, not the image size, places the image on the map: live
 * content draws a 1448 px image into a 31250-unit rect. The mask must be
 * tested at each image pixel's map position.
 */
describe("redactLayer: scaled and offset layers", () => {
  // Reveal the map, then a fog shape and a fog gap so both edges are tested.
  const fog = (featherPx: number): FogOverlay => ({
    mapId: "m",
    enabled: true,
    reveals: [sq(0, 0, 1000, 1000)],
    conceals: [sq(330, 230, 371, 262), sq(100, 50, 103, 150)],
    featherPx,
  });

  const cases: Array<
    [string, number, number, { x: number; y: number; width: number; height: number }]
  > = [
    [
      "a 400 px image in a 200-unit rect (up-scaled)",
      400,
      400,
      { x: 250, y: 150, width: 200, height: 200 },
    ],
    [
      "a 100 px image in a 400-unit rect (down-scaled)",
      100,
      100,
      { x: 0, y: 0, width: 400, height: 400 },
    ],
    ["a 1:1 image offset to (300, 200)", 120, 80, { x: 300, y: 200, width: 120, height: 80 }],
    [
      "a non-uniform scale (300x100 px in a 150x400 rect)",
      300,
      100,
      { x: 60, y: 0, width: 150, height: 400 },
    ],
  ];

  for (const [label, iw, ih, rect] of cases) {
    for (const featherPx of [0, 16]) {
      it(`${label}: every fogged pixel is alpha 0 at featherPx ${featherPx}`, async () => {
        const f = fog(featherPx);
        const out = await redactLayer(
          await solidRed(iw, ih),
          { width: 1000, height: 1000 },
          f,
          rect,
        );
        const { leaks, width, height, alpha } = await leaksIn(out, f, rect);
        // Output stays at the image's size, not the rect's or the map's.
        expect([width, height]).toEqual([iw, ih]);
        expect(leaks).toEqual([]);
        // And something away from the fog still shows.
        let lit = 0;
        for (let y = 0; y < height; y++)
          for (let x = 0; x < width; x++) if (alpha(x, y) >= 250) lit++;
        expect(lit).toBeGreaterThan(0);
      });
    }
  }

  it("puts the fog shape where the rect says, not where the image pixels would be at 1:1", async () => {
    // Fog shape at map 300-400; the image covers map 200-1800 at 0.25 px/unit,
    // so the fog lands at image x 25-50, and image x 300-400 is lit.
    const f: FogOverlay = {
      mapId: "m",
      enabled: true,
      reveals: [sq(0, 0, 2000, 1000)],
      conceals: [sq(300, 0, 400, 1000)],
      featherPx: 0,
    };
    const rect = { x: 200, y: 0, width: 1600, height: 400 };
    const out = await redactLayer(await solidRed(400, 100), { width: 2000, height: 1000 }, f, rect);
    const { alpha } = await leaksIn(out, f, rect);
    expect(alpha(30, 50)).toBe(0);
    expect(alpha(350, 50)).toBe(255);
  });

  it("rejects a feather wider than sharp can blur", async () => {
    const f: FogOverlay = {
      mapId: "m",
      enabled: true,
      reveals: [sq(0, 0, 10, 10)],
      featherPx: 2001,
    };
    await expect(
      redactLayer(await solidRed(10, 10), { width: 10, height: 10 }, f, {
        x: 0,
        y: 0,
        width: 10,
        height: 10,
      }),
    ).rejects.toBeInstanceOf(FogRedactionError);
  });

  it("throws on a rotated layer, accepts rotation 0 or undefined", async () => {
    const f: FogOverlay = { mapId: "m", enabled: true, reveals: [sq(0, 0, 10, 10)] };
    const base = { x: 0, y: 0, width: 10, height: 10 };
    await expect(
      redactLayer(await solidRed(10, 10), { width: 10, height: 10 }, f, { ...base, rotation: 15 }),
    ).rejects.toBeInstanceOf(FogRedactionError);
    for (const rotation of [0, undefined]) {
      await expect(
        redactLayer(await solidRed(10, 10), { width: 10, height: 10 }, f, { ...base, rotation }),
      ).resolves.toBeInstanceOf(Buffer);
    }
  });
});

describe("redactLayer: no colour survives under fog (R-18 review)", () => {
  const map = { width: 100, height: 100 };
  const layerRect = { x: 0, y: 0, width: 100, height: 100 };
  const fog: FogOverlay = { mapId: "m", enabled: true, reveals: [sq(0, 0, 50, 100)], featherPx: 8 };

  /** A noisy opaque image, so a kept colour would be recoverable. */
  async function noisy(): Promise<{ png: Buffer; raw: Buffer }> {
    const raw = Buffer.alloc(100 * 100 * 4);
    let s = 7;
    for (let i = 0; i < raw.length; i++) {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      raw[i] = i % 4 === 3 ? 255 : (s >> 16) & 0xff || 1;
    }
    const png = await sharp(raw, { raw: { width: 100, height: 100, channels: 4 } })
      .png()
      .toBuffer();
    return { png, raw };
  }

  it("stripping alpha recovers nothing: alpha 0 is RGB 0, the feather carries only scaled colour", async () => {
    const { png, raw } = await noisy();
    const out = await redactLayer(png, map, fog, layerRect);
    const { data } = await sharp(out).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const leaks: string[] = [];
    let fogged = 0;
    for (let i = 0; i < 100 * 100; i++) {
      const a = data[i * 4 + 3];
      if (a === 0) fogged++;
      for (let c = 0; c < 3; c++) {
        const v = data[i * 4 + c];
        const cap = Math.ceil((raw[i * 4 + c] * a) / 255);
        if (a === 0 ? v !== 0 : v > cap) leaks.push(`px ${i} c${c}=${v} a=${a} cap=${cap}`);
      }
    }
    expect(fogged).toBeGreaterThanOrEqual(50 * 100);
    expect(leaks.slice(0, 5)).toEqual([]);
  });

  it("zeroes the colour of a pixel the source already made transparent", async () => {
    const raw = Buffer.alloc(100 * 100 * 4, 0);
    for (let i = 0; i < 100 * 100; i++) raw.set([200, 100, 50, i % 2 ? 255 : 0], i * 4);
    const png = await sharp(raw, { raw: { width: 100, height: 100, channels: 4 } })
      .png()
      .toBuffer();
    const out = await redactLayer(png, map, fog, layerRect);
    const { data } = await sharp(out).raw().toBuffer({ resolveWithObject: true });
    for (let i = 0; i < 100 * 100; i++) {
      if (data[i * 4 + 3] === 0)
        expect([data[i * 4], data[i * 4 + 1], data[i * 4 + 2]]).toEqual([0, 0, 0]);
    }
  });
});
