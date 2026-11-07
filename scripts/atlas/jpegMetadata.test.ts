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

  it("refuses a stray second SOI rather than reading the next segment as its length", async () => {
    const jpeg = await noisyJpeg();
    const exif = segment(
      0xe1,
      Buffer.concat([Buffer.from("Exif\0\0GPS-SECRET"), Buffer.alloc(100)]),
    );
    // FF D8 followed by bytes that look like a length covering the EXIF segment.
    const len = 2 + exif.length;
    const fake = Buffer.from([0xff, 0xd8, (len >> 8) & 0xff, len & 0xff]);
    expect(stripJpegMetadata(withSegments(jpeg, fake, exif))).toMatchObject({
      ok: false,
      code: "malformed",
    });
    expect(stripJpegMetadata(withSegments(jpeg, Buffer.from([0xff, 0xd8]), exif))).toMatchObject({
      ok: false,
      code: "malformed",
    });
  });

  it("refuses a JPGn (0xF0) segment instead of passing it through", async () => {
    const input = withSegments(await noisyJpeg(), segment(0xf0, Buffer.from("hidden-text")));
    expect(stripJpegMetadata(input)).toMatchObject({ ok: false, code: "malformed" });
  });

  it("drops a JFIF thumbnail and JFXX extensions but keeps the JFIF header", async () => {
    const thumb = Buffer.from("THUMBPIXELS!"); // 2x2 RGB = 12 bytes
    const jfif = segment(
      0xe0,
      Buffer.concat([Buffer.from("JFIF\0"), Buffer.from([1, 2, 1, 0, 72, 0, 72, 2, 2]), thumb]),
    );
    const jfxx = segment(0xe0, Buffer.from("JFXX\0\x13JFXX-THUMB"));
    const input = withSegments(await noisyJpeg(), jfif, jfxx);
    const r = stripJpegMetadata(input);
    if (!r.ok) throw new Error(r.reason);
    const text = r.bytes.toString("latin1");
    expect(text).not.toMatch(/THUMB|JFXX/);
    // Every APP0 left is a bare 16-byte JFIF header with a 0x0 thumbnail.
    for (let i = r.bytes.indexOf(Buffer.from([0xff, 0xe0])); i !== -1 && i < scanStart(r.bytes);) {
      expect(r.bytes.readUInt16BE(i + 2)).toBe(16);
      expect(r.bytes.subarray(i + 4, i + 9).toString("latin1")).toBe("JFIF\0");
      expect([r.bytes[i + 16], r.bytes[i + 17]]).toEqual([0, 0]);
      i = r.bytes.indexOf(Buffer.from([0xff, 0xe0]), i + 2);
    }
    expect(text).toContain("JFIF\0");
    expect(scanData(r.bytes).equals(scanData(input))).toBe(true);
    const px = (b: Buffer) => sharp(b).raw().toBuffer();
    expect((await px(r.bytes)).equals(await px(input))).toBe(true);
  });
});

function scanStart(jpeg: Buffer): number {
  return jpeg.indexOf(Buffer.from([0xff, 0xda]));
}
