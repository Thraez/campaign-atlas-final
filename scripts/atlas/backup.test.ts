import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import JSZip from "jszip";
import {
  zipsToPrune,
  parseKeepFlag,
  parseRestoreFlag,
  parseManifestFileCount,
  restoreBackup,
} from "./backup";

describe("zipsToPrune", () => {
  const zips = [
    "2026-01-01T00-00-00-000Z.zip",
    "2026-01-02T00-00-00-000Z.zip",
    "2026-01-03T00-00-00-000Z.zip",
    "2026-01-04T00-00-00-000Z.zip",
  ];

  it("keep=0 prunes every zip", () => {
    expect(zipsToPrune(zips, 0)).toEqual([
      "2026-01-01T00-00-00-000Z.zip",
      "2026-01-02T00-00-00-000Z.zip",
      "2026-01-03T00-00-00-000Z.zip",
      "2026-01-04T00-00-00-000Z.zip",
    ]);
  });

  it("keep >= count prunes nothing", () => {
    expect(zipsToPrune(zips, 4)).toEqual([]);
    expect(zipsToPrune(zips, 10)).toEqual([]);
  });

  it("keeps the newest N, prunes the oldest (chronological = lexicographic)", () => {
    expect(zipsToPrune(zips, 1)).toEqual([
      "2026-01-01T00-00-00-000Z.zip",
      "2026-01-02T00-00-00-000Z.zip",
      "2026-01-03T00-00-00-000Z.zip",
    ]);
    expect(zipsToPrune(zips, 2)).toEqual([
      "2026-01-01T00-00-00-000Z.zip",
      "2026-01-02T00-00-00-000Z.zip",
    ]);
  });

  it("ignores non-.zip files entirely", () => {
    const mixed = [...zips, "MANIFEST.md", ".DS_Store", "notes.txt"];
    expect(zipsToPrune(mixed, 1)).toEqual([
      "2026-01-01T00-00-00-000Z.zip",
      "2026-01-02T00-00-00-000Z.zip",
      "2026-01-03T00-00-00-000Z.zip",
    ]);
  });

  it("handles an unsorted input list", () => {
    const shuffled = [zips[2], zips[0], zips[3], zips[1]];
    expect(zipsToPrune(shuffled, 2)).toEqual([zips[0], zips[1]]);
  });
});

describe("parseKeepFlag", () => {
  it("returns undefined when --keep is absent", () => {
    expect(parseKeepFlag([])).toBeUndefined();
    expect(parseKeepFlag(["--other", "1"])).toBeUndefined();
  });

  it("parses a valid integer value", () => {
    expect(parseKeepFlag(["--keep", "5"])).toBe(5);
    expect(parseKeepFlag(["--keep", "0"])).toBe(0);
  });

  it("returns undefined for a non-integer or missing value", () => {
    expect(parseKeepFlag(["--keep"])).toBeUndefined();
    expect(parseKeepFlag(["--keep", "abc"])).toBeUndefined();
    expect(parseKeepFlag(["--keep", "-1"])).toBeUndefined();
    expect(parseKeepFlag(["--keep", "1.5"])).toBeUndefined();
  });
});

describe("parseRestoreFlag", () => {
  it("returns undefined when neither flag is present", () => {
    expect(parseRestoreFlag([])).toBeUndefined();
  });

  it("returns undefined when only one of --restore/--out is present", () => {
    expect(parseRestoreFlag(["--restore", "x.zip"])).toBeUndefined();
    expect(parseRestoreFlag(["--out", "dir"])).toBeUndefined();
  });

  it("parses both flags regardless of order", () => {
    expect(parseRestoreFlag(["--restore", "backups/x.zip", "--out", "restored"])).toEqual({
      zip: "backups/x.zip",
      out: "restored",
    });
    expect(parseRestoreFlag(["--out", "restored", "--restore", "backups/x.zip"])).toEqual({
      zip: "backups/x.zip",
      out: "restored",
    });
  });

  it("returns undefined when a flag's value is missing or looks like another flag", () => {
    expect(parseRestoreFlag(["--restore", "--out", "dir"])).toBeUndefined();
    expect(parseRestoreFlag(["--restore", "x.zip", "--out"])).toBeUndefined();
  });
});

describe("parseManifestFileCount", () => {
  it("extracts a valid Files: count", () => {
    expect(parseManifestFileCount("# Atlas backup\n\nFiles: 42\n\nCreated: x")).toBe(42);
  });

  it("returns undefined when the line is missing", () => {
    expect(parseManifestFileCount("# Atlas backup\n\nCreated: x")).toBeUndefined();
  });

  it("returns undefined for a malformed count", () => {
    expect(parseManifestFileCount("Files: abc")).toBeUndefined();
  });
});

describe("restoreBackup", () => {
  let root: string;
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "restore-"));
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  async function makeFixtureZip(files: Record<string, string>): Promise<string> {
    const zip = new JSZip();
    for (const [rel, content] of Object.entries(files)) {
      zip.file(rel, content);
    }
    const fileNames = Object.keys(files);
    zip.file(
      "MANIFEST.md",
      [`# Atlas backup fixture`, ``, `Files: ${fileNames.length}`, ``].join("\n"),
    );
    const blob = await zip.generateAsync({ type: "nodebuffer" });
    const zipPath = path.join(root, "fixture.zip");
    fs.writeFileSync(zipPath, blob);
    return zipPath;
  }

  it("extracts into a fresh dir and verifies the manifest count", async () => {
    const zipPath = await makeFixtureZip({
      "content/world.yaml": "name: Test",
      "content/places/a.md": "# A",
    });
    const outDir = path.join(root, "restored");
    const result = await restoreBackup(zipPath, outDir);
    expect(result).toEqual({ extracted: 2, expected: 2 });
    expect(fs.readFileSync(path.join(outDir, "content/world.yaml"), "utf8")).toBe("name: Test");
    expect(fs.readFileSync(path.join(outDir, "content/places/a.md"), "utf8")).toBe("# A");
    expect(fs.existsSync(path.join(outDir, "MANIFEST.md"))).toBe(true);
  });

  it("refuses to write into a non-empty output dir", async () => {
    const zipPath = await makeFixtureZip({ "content/a.md": "a" });
    const outDir = path.join(root, "restored");
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, "existing.txt"), "already here");
    await expect(restoreBackup(zipPath, outDir)).rejects.toThrow(/not empty/);
    // confirm nothing was written beyond the pre-existing file
    expect(fs.readdirSync(outDir)).toEqual(["existing.txt"]);
  });

  it("succeeds into an existing but empty output dir", async () => {
    const zipPath = await makeFixtureZip({ "content/a.md": "a" });
    const outDir = path.join(root, "restored");
    fs.mkdirSync(outDir, { recursive: true });
    const result = await restoreBackup(zipPath, outDir);
    expect(result).toEqual({ extracted: 1, expected: 1 });
  });

  it("throws a clear error when the backup zip is missing", async () => {
    await expect(
      restoreBackup(path.join(root, "nope.zip"), path.join(root, "out")),
    ).rejects.toThrow(/not found/);
  });

  it("reports expected: undefined when the zip has no manifest", async () => {
    const zip = new JSZip();
    zip.file("content/a.md", "a");
    const blob = await zip.generateAsync({ type: "nodebuffer" });
    const zipPath = path.join(root, "no-manifest.zip");
    fs.writeFileSync(zipPath, blob);
    const outDir = path.join(root, "restored");
    const result = await restoreBackup(zipPath, outDir);
    expect(result).toEqual({ extracted: 1, expected: undefined });
  });
});
