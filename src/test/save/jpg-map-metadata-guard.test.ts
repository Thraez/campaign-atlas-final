/**
 * eval-2026-10/29: if the JPEG segment walk ever lets metadata through, the
 * save endpoint refuses the map rather than publishing it.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { handleSaveRequest } from "../../../scripts/vite-plugin-atlas-save";

// A walker that strips nothing: the input reaches the guard unchanged.
vi.mock("../../../scripts/atlas/jpegMetadata", () => ({
  stripJpegMetadata: (buf: Uint8Array) => ({ ok: true, bytes: Buffer.from(buf) }),
}));

let tmp: string;
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "atlas-jpg-guard-"));
});
afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("JPG map metadata guard", () => {
  it("refuses a map whose EXIF survived the strip, and writes nothing", async () => {
    const target = "public/atlas/assets/maps/leaky.jpg";
    const jpg = await sharp({ create: { width: 4, height: 2, channels: 3, background: "#123456" } })
      .jpeg()
      .withExif({ IFD3: { GPSLatitudeRef: "N", GPSLatitude: "59/1 19/1 0/1" } })
      .toBuffer();
    const r = await handleSaveRequest(
      {
        files: [
          {
            path: target,
            content: `data:image/jpeg;base64,${jpg.toString("base64")}`,
            kind: "asset-binary",
            baseHash: null,
          },
        ],
      },
      tmp,
    );
    expect(r.status).toBe(400);
    expect(JSON.stringify(r.payload)).toMatch(/metadata survived/);
    expect(fs.existsSync(path.join(tmp, target))).toBe(false);
  });
});
