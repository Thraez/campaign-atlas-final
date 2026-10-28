import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { findTwinCollisions, optimizeMaps, parseArgs } from "../../../scripts/dev/optimize-maps";

// Maps stay lossless: fog redaction and map labels both smear under a lossy
// re-encode. maps:optimize turns an 8-bit PNG map into a lossless WebP,
// deletes the PNG (git keeps it) and leaves every other map exactly as it is.

let root: string;
let mapsDir: string;
let atlasDir: string;
let yaml: string;

/**
 * Noisy RGBA with every fourth pixel fully transparent. Noise because a flat
 * fill survives even a lossy encode. With `hiddenRgb` those transparent pixels
 * still carry colour, which libwebp rewrites (sharp 0.34 has no `exact`), so
 * such a map must be skipped rather than converted.
 */
const rgbaNoise = (width: number, height: number, hiddenRgb = false) => {
  const raw = Buffer.alloc(width * height * 4);
  let s = 12345;
  for (let i = 0; i < raw.length; i++) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    raw[i] = s & 0xff;
  }
  for (let p = 0; p < width * height; p++) {
    const clear = p % 4 === 0;
    raw[p * 4 + 3] = clear ? 0 : 255;
    if (clear && !hiddenRgb) raw.fill(0, p * 4, p * 4 + 3);
    if (clear && hiddenRgb) raw[p * 4] = raw[p * 4] | 1; // never all-zero RGB
  }
  return { raw, img: sharp(raw, { raw: { width, height, channels: 4 } }) };
};

// Read from bytes, never a path: `sharp(path)` holds the file open on Windows
// and blocks the afterEach cleanup. All four channels, no removeAlpha.
const rgbaOf = async (file: string) =>
  sharp(fs.readFileSync(file)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const metaOf = async (file: string) => sharp(fs.readFileSync(file)).metadata();
const writePng = async (name: string, width = 16, height = 16) => {
  const { raw, img } = rgbaNoise(width, height);
  fs.writeFileSync(path.join(mapsDir, name), await img.png().toBuffer());
  return raw;
};

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "opt-maps-"));
  mapsDir = path.join(root, "public", "atlas", "assets", "maps");
  atlasDir = path.join(root, "content", "world", "_atlas");
  yaml = path.join(atlasDir, "world.yaml");
  fs.mkdirSync(mapsDir, { recursive: true });
  fs.mkdirSync(atlasDir, { recursive: true });
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

// minBytes 0 so a small fixture counts as oversized.
const run = () => optimizeMaps({ mapsDir, searchRoots: [path.join(root, "content")], minBytes: 0 });

describe("optimizeMaps", () => {
  it("turns a PNG map into a WebP with every RGBA value intact", async () => {
    const raw = await writePng("region.png", 64, 48);
    await run();
    const webp = path.join(mapsDir, "region.webp");
    expect((await metaOf(webp)).format).toBe("webp");
    const after = await rgbaOf(webp);
    expect(after.info.width).toBe(64);
    expect(after.info.height).toBe(48);
    // All four channels, transparent pixels included.
    expect(after.data.equals(raw)).toBe(true);
  });

  it("skips a PNG whose transparent pixels hide colour the WebP would lose", async () => {
    const png = await rgbaNoise(32, 32, true).img.png().toBuffer();
    fs.writeFileSync(path.join(mapsDir, "hidden.png"), png);
    const result = await run();
    expect(result.converted).toEqual([]);
    expect(result.skipped[0].file).toBe("hidden.png");
    expect(result.skipped[0].reason).toMatch(/pixel-identical/);
    expect(fs.readFileSync(path.join(mapsDir, "hidden.png")).equals(png)).toBe(true);
    expect(fs.existsSync(path.join(mapsDir, "hidden.webp"))).toBe(false);
  });

  it("deletes the source PNG once the twin is written (git keeps it)", async () => {
    await writePng("region.png");
    await run();
    expect(fs.existsSync(path.join(mapsDir, "region.png"))).toBe(false);
  });

  it("does nothing on a second run", async () => {
    await writePng("region.png");
    fs.writeFileSync(yaml, "layers:\n  - src: /atlas/assets/maps/region.png\n");
    await run();
    const files = fs.readdirSync(mapsDir).sort();
    const webpBytes = fs.readFileSync(path.join(mapsDir, "region.webp"));
    const yamlText = fs.readFileSync(yaml, "utf8");
    const second = await run();
    expect(second.converted).toEqual([]);
    expect(second.skipped).toEqual([]);
    expect(fs.readdirSync(mapsDir).sort()).toEqual(files);
    expect(fs.readFileSync(path.join(mapsDir, "region.webp")).equals(webpBytes)).toBe(true);
    expect(fs.readFileSync(yaml, "utf8")).toBe(yamlText);
  });

  it("never resizes a map — the image width ceiling is for portraits", async () => {
    await writePng("wide.png", 2400, 40);
    await run();
    expect((await metaOf(path.join(mapsDir, "wide.webp"))).width).toBe(2400);
  });

  it("leaves a JPG map byte for byte as it is, and says so", async () => {
    const jpg = path.join(mapsDir, "Tidemarrow.jpg");
    const bytes = await rgbaNoise(64, 48).img.flatten().jpeg({ quality: 90 }).toBuffer();
    fs.writeFileSync(jpg, bytes);
    const result = await run();
    expect(fs.readFileSync(jpg).equals(bytes)).toBe(true);
    expect(fs.existsSync(path.join(mapsDir, "Tidemarrow.webp"))).toBe(false);
    expect(result.converted).toEqual([]);
    expect(result.kept.map((k) => k.file)).toEqual(["Tidemarrow.jpg"]);
  });

  it("lists every map it doesn't convert — WebP, GIF, SVG — never ignores one", async () => {
    fs.writeFileSync(path.join(mapsDir, "a.webp"), await rgbaNoise(8, 8).img.webp().toBuffer());
    fs.writeFileSync(path.join(mapsDir, "b.gif"), await rgbaNoise(8, 8).img.gif().toBuffer());
    fs.writeFileSync(path.join(mapsDir, "c.svg"), "<svg xmlns='http://www.w3.org/2000/svg'/>");
    const result = await run();
    expect(result.kept.map((k) => k.file).sort()).toEqual(["a.webp", "b.gif", "c.svg"]);
    for (const k of result.kept) expect(k.reason).not.toBe("");
  });

  it("skips and lists a PNG under the size threshold", async () => {
    await writePng("small.png");
    const result = await optimizeMaps({
      mapsDir,
      searchRoots: [path.join(root, "content")],
      minBytes: 10 * 1024 * 1024,
    });
    expect(result.converted).toEqual([]);
    expect(result.skipped.map((s) => s.file)).toEqual(["small.png"]);
    expect(fs.existsSync(path.join(mapsDir, "small.webp"))).toBe(false);
  });

  it("never overwrites a WebP it didn't just make", async () => {
    await writePng("region.png");
    const existing = Buffer.from("not ours to replace");
    fs.writeFileSync(path.join(mapsDir, "region.webp"), existing);
    const result = await run();
    expect(fs.readFileSync(path.join(mapsDir, "region.webp")).equals(existing)).toBe(true);
    expect(fs.existsSync(path.join(mapsDir, "region.png"))).toBe(true);
    expect(result.skipped.map((s) => s.file)).toEqual(["region.png"]);
  });

  it("skips a 16-bit PNG, since a WebP twin would be 8-bit", async () => {
    const png16 = await rgbaNoise(16, 16).img.toColourspace("rgb16").png().toBuffer();
    fs.writeFileSync(path.join(mapsDir, "deep.png"), png16);
    expect((await metaOf(path.join(mapsDir, "deep.png"))).depth).toBe("ushort");
    const result = await run();
    expect(result.converted).toEqual([]);
    expect(result.skipped[0].file).toBe("deep.png");
    expect(result.skipped[0].reason).toMatch(/8-bit/);
    expect(fs.existsSync(path.join(mapsDir, "deep.webp"))).toBe(false);
  });

  it("repoints the world.yaml layer from the PNG to the WebP", async () => {
    await writePng("region.png");
    fs.writeFileSync(yaml, "layers:\n  - src: /atlas/assets/maps/region.png\n");
    const result = await run();
    expect(fs.readFileSync(yaml, "utf8")).toBe(
      "layers:\n  - src: /atlas/assets/maps/region.webp\n",
    );
    expect(result.converted[0].rewrittenFiles).toEqual([yaml]);
  });

  it("repoints a quoted src value", async () => {
    await writePng("region.png");
    fs.writeFileSync(
      yaml,
      "layers:\n  - src: \"/atlas/assets/maps/region.png\"\n  - src: 'atlas/assets/maps/region.png'\n",
    );
    await run();
    expect(fs.readFileSync(yaml, "utf8")).toBe(
      "layers:\n  - src: \"/atlas/assets/maps/region.webp\"\n  - src: 'atlas/assets/maps/region.webp'\n",
    );
  });

  it("leaves a longer name that merely starts with the PNG's name alone", async () => {
    await writePng("region.png");
    const text =
      "layers:\n  - src: /atlas/assets/maps/region.png.bak\n  - src: /atlas/assets/maps/region.png-old\n";
    fs.writeFileSync(yaml, text);
    await run();
    expect(fs.readFileSync(yaml, "utf8")).toBe(text);
  });
});

describe("findTwinCollisions", () => {
  // Tested directly: macOS and Windows file systems can't hold both names at
  // once, so a fixture directory can't show the clash there.
  it("finds two PNGs that would share one WebP twin", () => {
    expect(findTwinCollisions(["Region.PNG", "Region.png", "other.png"])).toEqual([
      ["Region.PNG", "Region.png"],
    ]);
  });

  it("finds nothing when every twin is distinct", () => {
    expect(findTwinCollisions(["a.png", "b.png"])).toEqual([]);
  });
});

describe("parseArgs", () => {
  it("defaults to the real maps folder and content roots", () => {
    expect(parseArgs([])).toEqual({});
  });

  it("repoints nothing for an explicit folder unless --content is given", () => {
    expect(parseArgs(["/tmp/maps"])).toEqual({ mapsDir: "/tmp/maps", searchRoots: [] });
    expect(parseArgs(["/tmp/maps", "--content", "/tmp/c"])).toEqual({
      mapsDir: "/tmp/maps",
      searchRoots: ["/tmp/c"],
    });
  });
});
