/**
 * Tests for scripts/check-image-privacy.ts
 *
 * Focus: the UNREADABLE code path. An image whose bytes sharp cannot decode is
 * an unexpected fault in a player build, so the scan must (a) still fail with
 * the violation exit code and (b) surface WHY it could not be inspected, rather
 * than swallowing the underlying decode error behind an opaque message.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { run } from "../../scripts/check-image-privacy";

// The committed fixture the publish-integrity smoke drives its derived-secret
// variant from — deriveSecretsFromVault loads cleanly against it.
const FIXTURE_CONFIG = path.join("src", "test", "fixtures", "atlas-build", "atlas.config.json");

describe("check-image-privacy — unreadable image", () => {
  let dir: string;
  let errSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "img-privacy-"));
    errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    errSpy.mockRestore();
    vi.restoreAllMocks();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("flags a corrupt image with exit 13 and surfaces the decode error detail", async () => {
    // .jpg extension so it is scanned; bytes sharp cannot decode so metadata() throws.
    fs.writeFileSync(path.join(dir, "corrupt.jpg"), Buffer.from("not a real image at all"));

    const code = await run({ dir, config: FIXTURE_CONFIG });

    expect(code).toBe(13);
    const output = errSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).toContain("UNREADABLE: ");
    // The whole point of the fix: the message must not stop at the colon — the
    // underlying sharp error detail has to be attached.
    const match = output.match(/could not inspect metadata:\s*(.+)/);
    expect(match).not.toBeNull();
    expect(match![1].trim().length).toBeGreaterThan(0);
  });
});

describe("check-image-privacy — the DM's asset store", () => {
  let dir: string;
  let errSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "img-privacy-store-"));
    errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});
    fs.mkdirSync(path.join(dir, "assets", "images"), { recursive: true });
    const png = await sharp({
      create: { width: 2, height: 2, channels: 3, background: "#000" },
    })
      .png()
      .toBuffer();
    // "Hidden Thing" is a hidden note in the fixture vault.
    fs.writeFileSync(path.join(dir, "assets", "images", "hidden-thing.png"), png);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("strict by default: a secret-named image fails", async () => {
    expect(await run({ dir, config: FIXTURE_CONFIG })).toBe(13);
  });

  it("with referencedBy, an image the player JSON never names passes", async () => {
    fs.writeFileSync(path.join(dir, "atlas.json"), '{"entities":[]}');
    expect(await run({ dir, config: FIXTURE_CONFIG, referencedBy: dir })).toBe(0);
  });

  it("with referencedBy, a secret-named image the player JSON names still fails", async () => {
    fs.writeFileSync(path.join(dir, "atlas.json"), '{"body":"![[hidden-thing.png]]"}');
    expect(await run({ dir, config: FIXTURE_CONFIG, referencedBy: dir })).toBe(13);
    expect(errSpy.mock.calls.flat().join("\n")).toContain("FILENAME LEAK");
  });

  it("with referencedBy, a secret-named image named by its full path fails", async () => {
    fs.writeFileSync(
      path.join(dir, "atlas.json"),
      '{"layers":[{"src":"atlas/assets/images/hidden-thing.png"}]}',
    );
    expect(await run({ dir, config: FIXTURE_CONFIG, referencedBy: dir })).toBe(13);
  });

  it("with referencedBy, an image the JSON names only in another folder passes, as the build prunes it", async () => {
    fs.writeFileSync(
      path.join(dir, "atlas.json"),
      '{"layers":[{"src":"atlas/assets/maps/hidden-thing.png"}]}',
    );
    expect(await run({ dir, config: FIXTURE_CONFIG, referencedBy: dir })).toBe(0);
  });

  it("with referencedBy, an image whose name is a suffix of a named image passes, as the build prunes it", async () => {
    // "hidden-thing.png" is a suffix of "not-hidden-thing.png", which is named but not on disk.
    fs.writeFileSync(
      path.join(dir, "atlas.json"),
      '{"layers":[{"src":"atlas/assets/images/not-hidden-thing.png"}]}',
    );
    expect(await run({ dir, config: FIXTURE_CONFIG, referencedBy: dir })).toBe(0);
  });

  it("checks every image type the player could show, e.g. a secret-named .avif", async () => {
    const png = fs.readFileSync(path.join(dir, "assets", "images", "hidden-thing.png"));
    fs.rmSync(path.join(dir, "assets", "images", "hidden-thing.png"));
    fs.writeFileSync(path.join(dir, "assets", "images", "hidden-thing.avif"), png);
    expect(await run({ dir, config: FIXTURE_CONFIG })).toBe(13);
    expect(errSpy.mock.calls.flat().join("\n")).toContain("FILENAME LEAK");
  });

  it("with referencedBy, a secret-named image outside assets/ fails: the build never prunes it", async () => {
    fs.renameSync(
      path.join(dir, "assets", "images", "hidden-thing.png"),
      path.join(dir, "hidden-thing.png"),
    );
    fs.writeFileSync(path.join(dir, "atlas.json"), '{"entities":[]}');
    expect(await run({ dir, config: FIXTURE_CONFIG, referencedBy: dir })).toBe(13);
  });
});

describe("check-image-privacy — formats sharp can't read", () => {
  let dir: string;
  let errSpy: ReturnType<typeof vi.spyOn>;
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "img-privacy-formats-"));
    errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  // Minimal ICO header: reserved 0, type 1 (icon), 0 images. sharp cannot decode ICO.
  const ico = Buffer.from([0, 0, 1, 0, 0, 0]);

  it("passes an .ico, saying its metadata was not checked", async () => {
    fs.writeFileSync(path.join(dir, "favicon.ico"), ico);

    expect(await run({ dir, config: FIXTURE_CONFIG })).toBe(0);
    const out = logSpy.mock.calls.flat().join("\n");
    expect(out).toContain(`metadata not checked: ${path.join(dir, "favicon.ico")}`);
  });

  it("still fails a secret-named .ico on its filename", async () => {
    // "Hidden Thing" is a hidden note in the fixture vault.
    fs.writeFileSync(path.join(dir, "hidden-thing.ico"), ico);

    expect(await run({ dir, config: FIXTURE_CONFIG })).toBe(13);
    expect(errSpy.mock.calls.flat().join("\n")).toContain("FILENAME LEAK");
  });

  it("still fails a corrupt .png as UNREADABLE", async () => {
    fs.writeFileSync(path.join(dir, "broken.png"), Buffer.from("not a real image at all"));

    expect(await run({ dir, config: FIXTURE_CONFIG })).toBe(13);
    expect(errSpy.mock.calls.flat().join("\n")).toContain("UNREADABLE: ");
  });
});
