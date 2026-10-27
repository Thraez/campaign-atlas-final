import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { optimizeMaps } from "../../../scripts/dev/optimize-maps";

// Maps stay lossless: fog redaction and map labels both smear under a lossy
// re-encode. maps:optimize turns a PNG map into a lossless WebP twin and
// leaves a JPG map exactly as it is (it is already lossy; re-encoding adds a
// second generation of loss, and a lossless re-encode only makes it bigger).

let root: string;
let mapsDir: string;
let atlasDir: string;

// Noise, not a flat fill: a flat colour survives even a lossy encode
// unchanged, so it could not tell lossless from lossy.
const noise = (width: number, height: number) => {
  const raw = Buffer.alloc(width * height * 3);
  let s = 12345;
  for (let i = 0; i < raw.length; i++) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    raw[i] = s & 0xff;
  }
  return sharp(raw, { raw: { width, height, channels: 3 } });
};

// Read from bytes, never a path: `sharp(path)` holds the file open on Windows
// and blocks the afterEach cleanup.
const pixelsOf = async (file: string) =>
  sharp(fs.readFileSync(file)).removeAlpha().raw().toBuffer({ resolveWithObject: true });
const metaOf = async (file: string) => sharp(fs.readFileSync(file)).metadata();

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "opt-maps-"));
  mapsDir = path.join(root, "public", "atlas", "assets", "maps");
  atlasDir = path.join(root, "content", "world", "_atlas");
  fs.mkdirSync(mapsDir, { recursive: true });
  fs.mkdirSync(atlasDir, { recursive: true });
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

// minBytes 0 so a small fixture counts as oversized.
const run = () => optimizeMaps({ mapsDir, searchRoots: [path.join(root, "content")], minBytes: 0 });

describe("optimizeMaps", () => {
  it("turns a PNG map into a lossless WebP twin", async () => {
    const png = path.join(mapsDir, "region.png");
    fs.writeFileSync(png, await noise(64, 48).png().toBuffer());
    await run();
    const webp = path.join(mapsDir, "region.webp");
    expect((await metaOf(webp)).format).toBe("webp");
    const before = await pixelsOf(png);
    const after = await pixelsOf(webp);
    expect(after.info.width).toBe(before.info.width);
    expect(after.info.height).toBe(before.info.height);
    expect(after.data.equals(before.data)).toBe(true);
  });

  it("keeps the source PNG beside the twin", async () => {
    fs.writeFileSync(path.join(mapsDir, "region.png"), await noise(16, 16).png().toBuffer());
    await run();
    expect(fs.existsSync(path.join(mapsDir, "region.png"))).toBe(true);
  });

  it("never resizes a map — the image width ceiling is for portraits", async () => {
    fs.writeFileSync(path.join(mapsDir, "wide.png"), await noise(2400, 40).png().toBuffer());
    await run();
    expect((await metaOf(path.join(mapsDir, "wide.webp"))).width).toBe(2400);
  });

  it("leaves a JPG map byte for byte as it is", async () => {
    const jpg = path.join(mapsDir, "Tidemarrow.jpg");
    const bytes = await noise(64, 48).jpeg({ quality: 90 }).toBuffer();
    fs.writeFileSync(jpg, bytes);
    const result = await run();
    expect(fs.readFileSync(jpg).equals(bytes)).toBe(true);
    expect(fs.existsSync(path.join(mapsDir, "Tidemarrow.webp"))).toBe(false);
    expect(result.converted).toEqual([]);
    expect(result.kept).toEqual(["Tidemarrow.jpg"]);
  });

  it("skips a PNG under the size threshold", async () => {
    fs.writeFileSync(path.join(mapsDir, "small.png"), await noise(16, 16).png().toBuffer());
    const result = await optimizeMaps({
      mapsDir,
      searchRoots: [path.join(root, "content")],
      minBytes: 10 * 1024 * 1024,
    });
    expect(result.converted).toEqual([]);
    expect(fs.existsSync(path.join(mapsDir, "small.webp"))).toBe(false);
  });

  it("repoints the world.yaml layer from the PNG to the WebP twin", async () => {
    fs.writeFileSync(path.join(mapsDir, "region.png"), await noise(16, 16).png().toBuffer());
    const yaml = path.join(atlasDir, "world.yaml");
    fs.writeFileSync(yaml, "layers:\n  - src: /atlas/assets/maps/region.png\n");
    const result = await run();
    expect(fs.readFileSync(yaml, "utf8")).toBe(
      "layers:\n  - src: /atlas/assets/maps/region.webp\n",
    );
    expect(result.converted[0].rewrittenFiles).toEqual([yaml]);
  });
});
