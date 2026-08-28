import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { optimizeImages } from "../../../scripts/dev/optimize-images";
import { MAX_IMAGE_WIDTH } from "@/atlas/assets/imageEncoding";

// The safety net behind the two automatic paths. Both ingest routes now
// convert on their own, so anything left as a PNG in the image library either
// predates that or was dropped in by hand with `git add`. This script is how
// the DM fixes those in one command, and how the two portraits committed
// before the policy existed get migrated.

let root: string;
let imagesDir: string;
let contentDir: string;

const makePng = (width = 40, height = 40) =>
  sharp({ create: { width, height, channels: 3, background: { r: 3, g: 4, b: 5 } } })
    .png()
    .toBuffer();

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "opt-img-"));
  imagesDir = path.join(root, "public", "atlas", "assets", "images");
  contentDir = path.join(root, "content", "world");
  fs.mkdirSync(imagesDir, { recursive: true });
  fs.mkdirSync(contentDir, { recursive: true });
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

const run = () => optimizeImages({ imagesDir, contentRoots: [path.join(root, "content")] });

// Read from bytes, never a path: `sharp(path)` holds the file open on Windows
// and blocks the afterEach cleanup.
const metaOf = async (name: string) =>
  sharp(fs.readFileSync(path.join(imagesDir, name))).metadata();

describe("optimizeImages", () => {
  it("converts a leftover PNG to WebP", async () => {
    fs.writeFileSync(path.join(imagesDir, "Corven.png"), await makePng());
    await run();
    expect((await metaOf("Corven.webp")).format).toBe("webp");
  });

  it("removes the PNG rather than leaving a twin beside it", async () => {
    // maps:optimize keeps its source PNG, but images are different: an image
    // that nothing references is an orphan, and audit-assets warns on those.
    // Replacing keeps the library honest and the player payload smaller.
    fs.writeFileSync(path.join(imagesDir, "Corven.png"), await makePng());
    await run();
    expect(fs.existsSync(path.join(imagesDir, "Corven.png"))).toBe(false);
  });

  it("repoints the Obsidian embed that referenced it", async () => {
    fs.writeFileSync(path.join(imagesDir, "Corven.png"), await makePng());
    const note = path.join(contentDir, "corven.md");
    fs.writeFileSync(note, "A smuggler.\n\n![[Corven.png]]\n");
    await run();
    expect(fs.readFileSync(note, "utf8")).toBe("A smuggler.\n\n![[Corven.webp]]\n");
  });

  it("repoints a plain markdown image link too", async () => {
    fs.writeFileSync(path.join(imagesDir, "Corven.png"), await makePng());
    const note = path.join(contentDir, "corven.md");
    fs.writeFileSync(note, "![](/atlas/assets/images/Corven.png)\n");
    await run();
    expect(fs.readFileSync(note, "utf8")).toBe("![](/atlas/assets/images/Corven.webp)\n");
  });

  it("does not repoint a longer filename that merely ends with the same word", async () => {
    // "Corven.png" must not match inside "Old-Corven.png", or converting one
    // portrait would silently break the reference to a different one.
    fs.writeFileSync(path.join(imagesDir, "Corven.png"), await makePng());
    const note = path.join(contentDir, "corven.md");
    fs.writeFileSync(note, "![[Old-Corven.png]]\n![[Corven.png]]\n");
    await run();
    expect(fs.readFileSync(note, "utf8")).toBe("![[Old-Corven.png]]\n![[Corven.webp]]\n");
  });

  it("clamps an oversized image to the published width ceiling", async () => {
    fs.writeFileSync(path.join(imagesDir, "huge.png"), await makePng(2400, 600));
    await run();
    expect((await metaOf("huge.webp")).width).toBe(MAX_IMAGE_WIDTH);
  });

  it("leaves a GIF alone so animation survives", async () => {
    const gif = await sharp({
      create: { width: 8, height: 8, channels: 3, background: { r: 9, g: 9, b: 9 } },
    })
      .gif()
      .toBuffer();
    fs.writeFileSync(path.join(imagesDir, "spin.gif"), gif);
    await run();
    expect(fs.existsSync(path.join(imagesDir, "spin.gif"))).toBe(true);
    expect(fs.existsSync(path.join(imagesDir, "spin.webp"))).toBe(false);
  });

  it("is a no-op on a library that is already WebP", async () => {
    const webp = await sharp(await makePng())
      .webp()
      .toBuffer();
    fs.writeFileSync(path.join(imagesDir, "done.webp"), webp);
    const before = fs.readFileSync(path.join(imagesDir, "done.webp"));
    const result = await run();
    expect(result.converted).toEqual([]);
    // Re-encoding an already-converted image would lose quality every run.
    expect(fs.readFileSync(path.join(imagesDir, "done.webp"))).toEqual(before);
  });

  it("reports what it did so the DM can see the saving", async () => {
    fs.writeFileSync(path.join(imagesDir, "Corven.png"), await makePng(2400, 600));
    const result = await run();
    expect(result.converted).toHaveLength(1);
    const [entry] = result.converted;
    expect(entry.from).toBe("Corven.png");
    expect(entry.to).toBe("Corven.webp");
    expect(entry.afterBytes).toBeLessThan(entry.beforeBytes);
    expect(entry.rewrittenFiles).toEqual([]);
  });
});
