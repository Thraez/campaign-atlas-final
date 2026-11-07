/**
 * eval-2026-10/29: a JPG map loses its metadata without being re-encoded.
 */
import { describe, it, expect } from "vitest";
import sharp from "sharp";
import { stripJpegMetadata } from "./jpegMetadata";

/** One JPEG segment: 0xFF, marker, big-endian length, payload. */
function segment(marker: number, payload: Buffer): Buffer {
  const head = Buffer.from([0xff, marker, 0, 0]);
  head.writeUInt16BE(payload.length + 2, 2);
  return Buffer.concat([head, payload]);
}

/** `jpeg` with `segments` spliced in right after SOI. */
function withSegments(jpeg: Buffer, ...segments: Buffer[]): Buffer {
  return Buffer.concat([jpeg.subarray(0, 2), ...segments, jpeg.subarray(2)]);
}

/** Everything from the first SOS on: the scan header and the compressed image data. */
function scanData(jpeg: Buffer): Buffer {
  return jpeg.subarray(jpeg.indexOf(Buffer.from([0xff, 0xda])));
}

/** Noise, so the compressed data is not trivially small. */
async function noisyJpeg(opts: { progressive?: boolean } = {}): Promise<Buffer> {
  const w = 40;
  const h = 24;
  const raw = Buffer.alloc(w * h * 3);
  for (let i = 0; i < raw.length; i++) raw[i] = (i * 7919) % 251;
  return sharp(raw, { raw: { width: w, height: h, channels: 3 } })
    .jpeg({ quality: 70, progressive: opts.progressive })
    .withIccProfile("srgb")
    .withExif({ IFD3: { GPSLatitudeRef: "N", GPSLatitude: "59/1 19/1 0/1" } })
    .withXmp('<x:xmpmeta xmlns:x="adobe:ns:meta/"><secret-xmp/></x:xmpmeta>')
    .toBuffer();
}

const IPTC = segment(0xed, Buffer.from("Photoshop 3.0\0secret-iptc"));
const COMMENT = segment(0xfe, Buffer.from("secret-comment"));

describe("stripJpegMetadata", () => {
  it("drops EXIF (GPS), XMP, IPTC and comments and keeps the scan data byte for byte", async () => {
    const input = withSegments(await noisyJpeg(), IPTC, COMMENT);
    const before = await sharp(input).metadata();
    expect(before.exif).toBeTruthy();
    expect(before.xmp).toBeTruthy();

    const r = stripJpegMetadata(input);
    if (!r.ok) throw new Error(r.reason);

    expect(scanData(r.bytes).equals(scanData(input))).toBe(true);
    const after = await sharp(r.bytes).metadata();
    expect(after.exif).toBeUndefined();
    expect(after.xmp).toBeUndefined();
    expect(after.iptc).toBeUndefined();
    expect(after.icc).toBeTruthy(); // colour profile kept
    const text = r.bytes.toString("latin1");
    expect(text).not.toMatch(/secret|GPS|Exif/);
    // Same pixels.
    const px = (b: Buffer) => sharp(b).raw().toBuffer();
    expect((await px(r.bytes)).equals(await px(input))).toBe(true);
  });

  it("keeps every scan of a progressive JPEG unchanged", async () => {
    const input = withSegments(await noisyJpeg({ progressive: true }), COMMENT);
    const r = stripJpegMetadata(input);
    if (!r.ok) throw new Error(r.reason);
    expect(scanData(r.bytes).equals(scanData(input))).toBe(true);
    expect(r.bytes.toString("latin1")).not.toMatch(/secret/);
  });

  it("drops data appended after the end marker", async () => {
    const jpeg = await noisyJpeg();
    const r = stripJpegMetadata(Buffer.concat([jpeg, Buffer.from("trailing-secret")]));
    if (!r.ok) throw new Error(r.reason);
    expect(r.bytes.subarray(-2).equals(Buffer.from([0xff, 0xd9]))).toBe(true);
    expect(r.bytes.toString("latin1")).not.toMatch(/secret/);
  });

  it("refuses a JPEG whose EXIF orientation says to rotate it", async () => {
    const rotated = await sharp({
      create: { width: 4, height: 2, channels: 3, background: "#123456" },
    })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer();
    const r = stripJpegMetadata(rotated);
    expect(r).toMatchObject({ ok: false, code: "rotated" });
  });

  it("accepts orientation 1 (normal)", async () => {
    const normal = await sharp({
      create: { width: 4, height: 2, channels: 3, background: "#123456" },
    })
      .jpeg()
      .withMetadata({ orientation: 1 })
      .toBuffer();
    expect(stripJpegMetadata(normal).ok).toBe(true);
  });

  it("refuses bytes that aren't a JPEG", () => {
    expect(stripJpegMetadata(Buffer.from("not a jpeg at all"))).toMatchObject({
      ok: false,
      code: "malformed",
    });
  });

  it("refuses a JPEG cut off before its end marker", async () => {
    const jpeg = await noisyJpeg();
    expect(stripJpegMetadata(jpeg.subarray(0, jpeg.length - 40))).toMatchObject({
      ok: false,
      code: "malformed",
    });
  });
});
