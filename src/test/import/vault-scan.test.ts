import { describe, it, expect, beforeEach, afterEach } from "vitest";
import os from "node:os";
import fs from "node:fs/promises";
import path from "node:path";
import { handleVaultScanRequest } from "../../../scripts/vite-plugin-atlas-save";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "vault-scan-test-"));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("handleVaultScanRequest", () => {
  it("returns only .md files from the vault root", async () => {
    await fs.writeFile(path.join(tmpDir, "note.md"), "content");
    await fs.writeFile(path.join(tmpDir, "world.yaml"), "yaml");
    await fs.writeFile(path.join(tmpDir, "image.png"), "png");
    await fs.mkdir(path.join(tmpDir, "sub"), { recursive: true });
    await fs.writeFile(path.join(tmpDir, "sub", "nested.md"), "nested");

    const result = await handleVaultScanRequest(tmpDir, []);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Object.keys(result.files)).toContain("note.md");
    expect(Object.keys(result.files)).toContain("sub/nested.md");
    expect(Object.keys(result.files)).not.toContain("world.yaml");
    expect(Object.keys(result.files)).not.toContain("image.png");
  });

  it("includes file contents in the result", async () => {
    await fs.writeFile(path.join(tmpDir, "note.md"), "hello world");

    const result = await handleVaultScanRequest(tmpDir, []);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.files["note.md"]).toBe("hello world");
  });

  it("excludes files matching ignore globs", async () => {
    await fs.mkdir(path.join(tmpDir, "Templates"), { recursive: true });
    await fs.writeFile(path.join(tmpDir, "Templates", "template.md"), "template");
    await fs.writeFile(path.join(tmpDir, "note.md"), "content");

    const result = await handleVaultScanRequest(tmpDir, ["Templates/**"]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Object.keys(result.files)).not.toContain("Templates/template.md");
    expect(Object.keys(result.files)).toContain("note.md");
  });

  it("excludes files in built-in IGNORED_FOLDERS even with no user globs", async () => {
    await fs.mkdir(path.join(tmpDir, "_drafts"), { recursive: true });
    await fs.writeFile(path.join(tmpDir, "_drafts", "wip.md"), "draft");
    await fs.writeFile(path.join(tmpDir, "note.md"), "content");

    const result = await handleVaultScanRequest(tmpDir, []);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Object.keys(result.files)).not.toContain("_drafts/wip.md");
    expect(Object.keys(result.files)).toContain("note.md");
  });

  it("returns error for non-existent vault directory", async () => {
    const result = await handleVaultScanRequest(path.join(tmpDir, "nonexistent"), []);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(400);
  });

  it("returns error for a file path instead of directory", async () => {
    const filePath = path.join(tmpDir, "file.txt");
    await fs.writeFile(filePath, "not a dir");
    const result = await handleVaultScanRequest(filePath, []);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(400);
  });

  it("returns 413 error when aggregate size exceeds 25 MB", async () => {
    // Write 26 files × 1 MB = 26 MB total → exceeds 25 MB aggregate cap
    const oneMb = Buffer.alloc(1024 * 1024 - 1, "a");
    for (let i = 0; i < 26; i++) {
      await fs.writeFile(path.join(tmpDir, `note${i}.md`), oneMb);
    }

    const result = await handleVaultScanRequest(tmpDir, []);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(413);
  });
});
