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
