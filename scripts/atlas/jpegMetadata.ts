// Strip a JPEG's metadata without decoding it (ticket eval-2026-10/29).
//
// Maps stay lossless, and a JPG map is already lossy: re-encoding it to drop
// its EXIF (the old sharp path, quality 85) added a second generation of loss.
// This walks the JPEG's segments instead and copies every one the decoder
// needs, so the compressed image data comes out byte for byte.
//
// Kept: the frame, tables and scans (SOFn, DQT, DHT, DAC, DRI, DNL, DHP, EXP,
// SOS and the entropy-coded data after it), plus three APPn segments that
// change how the pixels render: APP0 JFIF (rewritten without its embedded
// thumbnail), APP2 ICC_PROFILE (colour) and APP14 Adobe (tells the decoder
// whether the components are RGB, YCbCr or YCCK). Any other marker (a stray
// second SOI, JPGn, reserved codes) makes the file malformed: an unknown
// segment could carry anything, and guessing its length could carry the next
// segment along with it.
// Dropped: every other APPn (APP1 EXIF and XMP, APP13 IPTC/Photoshop, APP2
// MPF, APP0 JFXX thumbnails, maker blocks) and COM comments, plus anything after EOI (MPF and some
// cameras append a second JPEG there, with its own EXIF).
//
// EXIF orientation: browsers rotate a JPEG by its EXIF Orientation tag, so
// dropping that tag would turn a rotated photo sideways. A JPEG can't be
// rotated without decoding it (lossless rotation needs MCU-aligned sizes), so
// one with an orientation other than "normal" is refused; the DM rotates it in
// an image editor first. Maps are scans and exports, so this should be rare.

const SOI = 0xd8;
const EOI = 0xd9;
const SOS = 0xda;
const COM = 0xfe;
const TEM = 0x01;
const ORIENTATION_TAG = 0x0112;

export type StripJpegResult =
  { ok: true; bytes: Buffer } | { ok: false; code: "malformed" | "rotated"; reason: string };

function isRst(marker: number): boolean {
  return marker >= 0xd0 && marker <= 0xd7;
}

function isApp(marker: number): boolean {
  return marker >= 0xe0 && marker <= 0xef;
}

function startsWith(payload: Uint8Array, signature: string): boolean {
  if (payload.length < signature.length) return false;
  for (let i = 0; i < signature.length; i++) {
    if (payload[i] !== signature.charCodeAt(i)) return false;
  }
  return true;
}

/**
 * Markers of segments the decoder reads, besides SOS: SOFn (0xC0-0xCF except
 * DHT 0xC4, JPG 0xC8 and DAC 0xCC), DHT, DAC, DQT, DNL, DRI, DHP and EXP.
 */
function isDecoderSegment(marker: number): boolean {
  if (marker >= 0xc0 && marker <= 0xcf) return marker !== 0xc8;
  return marker >= 0xdb && marker <= 0xdf;
}

/** Length of an APP0 JFIF payload up to and including the thumbnail size bytes. */
const JFIF_HEADER_LENGTH = 14;

/**
 * The APPn segment to publish in place of this one, or null to drop it: the
 * ones a decoder needs to show the right pixels and colours. APP0 JFIF is
 * rebuilt with no embedded thumbnail (a thumbnail is a second picture, and it
 * may not match the map).
 */
function keptAppSegment(
  marker: number,
  segment: Uint8Array,
  payload: Uint8Array,
): Uint8Array | null {
  if (marker === 0xe0) {
    if (!startsWith(payload, "JFIF\0") || payload.length < JFIF_HEADER_LENGTH) return null;
    const app0 = Buffer.from(segment.subarray(0, 4 + JFIF_HEADER_LENGTH));
    app0.writeUInt16BE(2 + JFIF_HEADER_LENGTH, 2);
    app0[4 + 12] = 0; // Xthumbnail
    app0[4 + 13] = 0; // Ythumbnail
    return app0;
  }
  if (marker === 0xe2) return startsWith(payload, "ICC_PROFILE\0") ? segment : null;
  if (marker === 0xee) return startsWith(payload, "Adobe") ? segment : null;
  return null;
}

/**
 * The EXIF Orientation (1-8) in an APP1 payload, or null when there is no
 * EXIF block or it can't be read (a browser couldn't read it either).
 */
export function exifOrientation(payload: Uint8Array): number | null {
  if (!startsWith(payload, "Exif\0\0")) return null;
  const tiff = payload.subarray(6);
  if (tiff.length < 8) return null;
  const little = tiff[0] === 0x49 && tiff[1] === 0x49;
  const big = tiff[0] === 0x4d && tiff[1] === 0x4d;
  if (!little && !big) return null;
  const u16 = (o: number) => (little ? tiff[o] | (tiff[o + 1] << 8) : (tiff[o] << 8) | tiff[o + 1]);
  const u32 = (o: number) =>
    little
      ? (tiff[o] | (tiff[o + 1] << 8) | (tiff[o + 2] << 16) | (tiff[o + 3] << 24)) >>> 0
      : ((tiff[o] << 24) | (tiff[o + 1] << 16) | (tiff[o + 2] << 8) | tiff[o + 3]) >>> 0;
  const ifd0 = u32(4);
  if (ifd0 + 2 > tiff.length) return null;
  const count = u16(ifd0);
  for (let n = 0; n < count; n++) {
    const entry = ifd0 + 2 + n * 12;
    if (entry + 12 > tiff.length) return null;
    if (u16(entry) === ORIENTATION_TAG) return u16(entry + 8);
  }
  return null;
}

/**
 * The same JPEG with its metadata segments removed and every byte the decoder
 * reads (tables, frame header, scans) copied unchanged. Never decodes.
 */
export function stripJpegMetadata(buf: Uint8Array): StripJpegResult {
  const malformed = (why: string): StripJpegResult => ({
    ok: false,
    code: "malformed",
    reason: `not a readable JPEG: ${why}`,
  });
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== SOI) return malformed("no start marker");

  const out: Uint8Array[] = [buf.subarray(0, 2)];
  let i = 2;
  for (;;) {
    if (i >= buf.length) return malformed("it ends before its end marker");
    if (buf[i] !== 0xff) return malformed(`unexpected byte at offset ${i}`);
    // Any number of 0xFF fill bytes may precede a marker; drop them.
    let m = i;
    while (m < buf.length && buf[m] === 0xff) m++;
    if (m >= buf.length) return malformed("it ends inside a marker");
    const marker = buf[m];

    if (marker === EOI) {
      out.push(buf.subarray(m - 1, m + 1));
      break; // anything after EOI is not this image
    }
    if (marker === TEM || isRst(marker)) {
      out.push(buf.subarray(m - 1, m + 1));
      i = m + 1;
      continue;
    }
    if (marker !== SOS && !isApp(marker) && marker !== COM && !isDecoderSegment(marker)) {
      return malformed(`unexpected marker 0x${marker.toString(16)} at offset ${m}`);
    }
    if (m + 2 >= buf.length) return malformed("it ends inside a segment header");
    const length = (buf[m + 1] << 8) | buf[m + 2];
    const end = m + 1 + length;
    if (length < 2 || end > buf.length) return malformed(`bad segment length at offset ${m}`);
    const segment = buf.subarray(m - 1, end);
    const payload = buf.subarray(m + 3, end);

    if (marker === SOS) {
      out.push(segment);
      // Entropy-coded data runs to the next marker: 0xFF followed by anything
      // but 0x00 (a stuffed byte) or RSTn (a restart inside the scan).
      let k = end;
      while (k < buf.length) {
        if (buf[k] === 0xff && k + 1 < buf.length) {
          const next = buf[k + 1];
          if (next === 0x00 || isRst(next)) {
            k += 2;
            continue;
          }
          break;
        }
        k++;
      }
      out.push(buf.subarray(end, k));
      i = k;
      continue;
    }

    if (isApp(marker) || marker === COM) {
      if (marker === 0xe1) {
        const orientation = exifOrientation(payload);
        if (orientation !== null && orientation !== 1) {
          return {
            ok: false,
            code: "rotated",
            reason:
              `its EXIF orientation (${orientation}) says to rotate or flip it, and that ` +
              `can't be kept once the metadata is removed`,
          };
        }
      }
      const kept = isApp(marker) ? keptAppSegment(marker, segment, payload) : null;
      if (kept) out.push(kept);
    } else {
      out.push(segment); // DQT, DHT, SOFn, DRI, ...: the decoder needs them
    }
    i = end;
  }
  return { ok: true, bytes: Buffer.concat(out) };
}
