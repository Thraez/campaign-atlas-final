// @vitest-environment node
/**
 * eval-2026-10/48: the Map Import Wizard's zip carries each image through the
 * same metadata strip the editor's map upload uses (ticket 29), so a map that
 * reaches public/atlas from the zip is no different from one saved in the
 * editor.
 */
import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import sharp from "sharp";
import { handleCleanAssetRequest } from "../../../scripts/vite-plugin-atlas-save";
import {
  buildMapImportZip,
  cleanAssetViaDevServer,
  NEEDS_DEV_SERVER,
  readCleanAssetReply,
  type CleanAsset,
} from "@/atlas/import/mapImportZip";
import { MAP_IMPORT_ZIP_NAME, buildPatchFile, buildReadme } from "@/atlas/import/mapImport";

// The dev route's handler, called in-process: what the wizard's fetch reaches.
const clean: CleanAsset = async (targetPath, dataUrl) => {
  const r = await handleCleanAssetRequest({ path: targetPath, content: dataUrl });
  return readCleanAssetReply(r.status, r.payload);
};

const files = { patch: "maps: []\n", readme: "# Apply map import\n" };
const dataUrl = (mime: string, buf: Buffer) => `data:${mime};base64,${buf.toString("base64")}`;
const scanData = (jpeg: Buffer) => jpeg.subarray(jpeg.indexOf(Buffer.from([0xff, 0xda])));

const noisyRaw = (w: number, h: number) => {
  const raw = Buffer.alloc(w * h * 3);
  for (let i = 0; i < raw.length; i++) raw[i] = (i * 7919) % 251;
  return sharp(raw, { raw: { width: w, height: h, channels: 3 } });
};

const gpsJpeg = () =>
  noisyRaw(40, 24)
    .jpeg({ quality: 70 })
    .withIccProfile("p3")
    .withExif({ IFD3: { GPSLatitudeRef: "N", GPSLatitude: "59/1 19/1 0/1" } })
    .withXmp('<x:xmpmeta xmlns:x="adobe:ns:meta/"><secret-xmp/></x:xmpmeta>')
    .toBuffer();

async function entry(zip: JSZip, name: string): Promise<Buffer> {
  const f = zip.file(name);
  if (!f) throw new Error(`missing ${name} in zip`);
  return Buffer.from(await f.async("uint8array"));
}

describe("Map Import Wizard zip strips map metadata", () => {
  it("drops a JPG's EXIF and XMP, keeps its ICC profile and its scan data byte for byte", async () => {
    const target = "public/atlas/assets/maps/tidemarrow.jpg";
    const input = await gpsJpeg();
    const before = await sharp(input).metadata();
    expect(before.exif).toBeTruthy();
    expect(before.icc).toBeTruthy();

    const r = await buildMapImportZip(
      files,
      [{ targetPath: target, dataUrl: dataUrl("image/jpeg", input) }],
      clean,
    );
    if (!r.ok) throw new Error(r.detail);
    const out = await entry(r.zip, target);
    const meta = await sharp(out).metadata();
    expect(meta.exif).toBeUndefined();
    expect(meta.xmp).toBeUndefined();
    expect(meta.icc).toBeTruthy();
    expect(scanData(out).equals(scanData(input))).toBe(true);
    expect(out.toString("latin1")).not.toMatch(/GPS|secret/);
  });

  it("drops a PNG map's EXIF, as the editor upload does", async () => {
    const target = "public/atlas/assets/maps/region.png";
    const input = await noisyRaw(8, 8)
      .png()
      .withExif({ IFD3: { GPSLatitudeRef: "N", GPSLatitude: "59/1 19/1 0/1" } })
      .toBuffer();
    expect((await sharp(input).metadata()).exif).toBeTruthy();

    const r = await buildMapImportZip(
      files,
      [{ targetPath: target, dataUrl: dataUrl("image/png", input) }],
      clean,
    );
    if (!r.ok) throw new Error(r.detail);
    const out = await entry(r.zip, target);
    const meta = await sharp(out).metadata();
    expect(meta.format).toBe("png");
    expect(meta.exif).toBeUndefined();
    const [a, b] = await Promise.all([sharp(input).raw().toBuffer(), sharp(out).raw().toBuffer()]);
    expect(b.equals(a)).toBe(true);
  });

  it("refuses a JPG whose EXIF orientation would be lost, and builds no zip", async () => {
    const rotated = await sharp({
      create: { width: 4, height: 2, channels: 3, background: "#123456" },
    })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer();
    const r = await buildMapImportZip(
      files,
      [
        {
          targetPath: "public/atlas/assets/maps/turned.jpg",
          dataUrl: dataUrl("image/jpeg", rotated),
        },
      ],
      clean,
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("map-format-refused");
    expect(r.detail).toMatch(/orientation/);
    expect(r.path).toBe("public/atlas/assets/maps/turned.jpg");
  });

  it.each(["png", "webp"])("refuses a JPG under a .%s map name", async (ext) => {
    const r = await buildMapImportZip(
      files,
      [
        {
          targetPath: `public/atlas/assets/maps/tidemarrow.${ext}`,
          dataUrl: dataUrl("image/jpeg", await gpsJpeg()),
        },
      ],
      clean,
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("map-format-refused");
  });

  it("refuses an asset path outside public/atlas/assets/", async () => {
    const r = await buildMapImportZip(
      files,
      [{ targetPath: "content/evil.jpg", dataUrl: dataUrl("image/jpeg", await gpsJpeg()) }],
      clean,
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("DisallowedPath");
    expect(r.path).toBe("content/evil.jpg");
  });

  it("says the dev server is needed when the route isn't there", async () => {
    const notFound = (async () => new Response("Not found", { status: 404 })) as typeof fetch;
    const offline = (async () => {
      throw new TypeError("Failed to fetch");
    }) as typeof fetch;
    for (const fetchFn of [notFound, offline]) {
      const r = await cleanAssetViaDevServer(fetchFn)("public/atlas/assets/maps/a.jpg", "data:,");
      expect(r).toEqual({ ok: false, reason: "no-dev-server", detail: NEEDS_DEV_SERVER });
    }
  });

  it("carries the patch and README, and the README names the zip the wizard downloads", async () => {
    const plan = { maps: [], assets: [], warnings: [] };
    expect(buildReadme(plan, [])).toContain(MAP_IMPORT_ZIP_NAME);
    expect(buildPatchFile(plan)).toContain(MAP_IMPORT_ZIP_NAME);
    expect(buildReadme(plan, [])).not.toContain("atlas-assets.zip");

    const r = await buildMapImportZip(files, [], clean);
    if (!r.ok) throw new Error(r.detail);
    expect((await entry(r.zip, "world-map-patch.yaml")).toString()).toBe(files.patch);
    expect((await entry(r.zip, "README-apply-map-import.md")).toString()).toBe(files.readme);
  });
});
