/**
 * Tests for the "unreadable file/dir" paths in the text secret scanners
 * (check-no-secrets, check-derived-secrets).
 *
 * Two contracts are pinned:
 *   1. A genuine OS-level I/O error (permission, race) is LOGGED and skipped,
 *      not swallowed silently — the exit code is unaffected.
 *   2. Undecodable bytes do NOT make a file "unreadable": Node's utf8 read
 *      substitutes U+FFFD rather than throwing, so a planted secret in a file
 *      with junk bytes is still detected. (This is why treating "unreadable" as
 *      a violation would be wrong — the premise doesn't hold.)
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { scanFile, DM_CONTENT_SENTINELS } from "../../scripts/check-no-secrets";
import { scanArtifactForSecrets, type SecretEntry } from "../../scripts/check-derived-secrets";

const SENTINEL = DM_CONTENT_SENTINELS[0];

function mkTmp(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "scanner-unreadable-"));
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("check-no-secrets scanFile — unreadable file", () => {
  it("logs a warning and returns no hits when the read throws", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(fs, "readFileSync").mockImplementationOnce(() => {
      throw new Error("EACCES: permission denied");
    });

    const hits = scanFile("blocked.txt");

    expect(hits).toEqual([]);
    expect(warn).toHaveBeenCalledTimes(1);
    const msg = warn.mock.calls[0].join(" ");
    expect(msg).toContain("blocked.txt");
    expect(msg).toContain("EACCES");
  });

  it("still detects a sentinel in a file with undecodable leading bytes", () => {
    const dir = mkTmp();
    try {
      const file = path.join(dir, "junk.txt");
      // 0xFF 0xFE 0x00 are invalid UTF-8; utf8 read yields U+FFFD, not a throw.
      fs.writeFileSync(
        file,
        Buffer.concat([Buffer.from([0xff, 0xfe, 0x00]), Buffer.from(SENTINEL)]),
      );

      const hits = scanFile(file);

      expect(hits.some((h) => h.pattern === SENTINEL)).toBe(true);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("check-derived-secrets scanArtifactForSecrets — unreadable file", () => {
  const secret: SecretEntry = { name: "Drowned-Shrine-Cabal", source: "test.md", field: "title" };

  it("logs a warning and keeps scanning when one file read throws", () => {
    const dir = mkTmp();
    try {
      fs.writeFileSync(path.join(dir, "page.txt"), "nothing here");
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      vi.spyOn(fs, "readFileSync").mockImplementationOnce(() => {
        throw new Error("EBUSY: resource busy");
      });

      const result = scanArtifactForSecrets(dir, [secret]);

      expect(result.filesScanned).toBe(1);
      expect(result.hits).toEqual([]);
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls[0].join(" ")).toContain("EBUSY");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("still detects a secret in a file with undecodable bytes", () => {
    const dir = mkTmp();
    try {
      fs.writeFileSync(
        path.join(dir, "leak.txt"),
        Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(`leaked: ${secret.name}`)]),
      );

      const result = scanArtifactForSecrets(dir, [secret]);

      expect(result.hits.some((h) => h.match.name === secret.name)).toBe(true);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
