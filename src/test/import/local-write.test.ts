import { describe, it, expect, beforeEach, afterEach } from "vitest";
import os from "node:os";
import fs from "node:fs/promises";
import path from "node:path";
import { handleLocalWriteRequest } from "../../../scripts/vite-plugin-atlas-save";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "local-write-test-"));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("handleLocalWriteRequest", () => {
  it("rejects names outside the two allowed filenames", async () => {
    const r1 = await handleLocalWriteRequest("evil.json", "{}", tmpDir);
    expect(r1.ok).toBe(false);
    if (r1.ok) return;
    expect(r1.status).toBe(400);

    const r2 = await handleLocalWriteRequest("atlas.json", "{}", tmpDir);
    expect(r2.ok).toBe(false);
  });

  it("rejects path-traversal attempts", async () => {
    const r = await handleLocalWriteRequest("../content/file.json", "{}", tmpDir);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.status).toBe(400);
  });

  it("accepts editor-settings.json and writes to .local-atlas/", async () => {
    const settings = { vaultPath: "/test/vault", ignoreGlobs: ["Templates/**"] };
    const r = await handleLocalWriteRequest(
      "editor-settings.json",
      JSON.stringify(settings),
      tmpDir,
    );
    expect(r.ok).toBe(true);
    const written = await fs.readFile(
      path.join(tmpDir, ".local-atlas", "editor-settings.json"),
      "utf8",
    );
    expect(JSON.parse(written)).toEqual(settings);
  });

  it("accepts sync-map.json and writes to .local-atlas/", async () => {
    const syncMap = { "notes/corven.md": { id: "corven", baseType: "npc" } };
    const r = await handleLocalWriteRequest(
      "sync-map.json",
      JSON.stringify(syncMap),
      tmpDir,
    );
    expect(r.ok).toBe(true);
    const written = await fs.readFile(
      path.join(tmpDir, ".local-atlas", "sync-map.json"),
      "utf8",
    );
    expect(JSON.parse(written)).toEqual(syncMap);
  });

  it("creates .local-atlas/ directory if it doesn't exist", async () => {
    // tmpDir has no .local-atlas yet
    const r = await handleLocalWriteRequest("editor-settings.json", "{}", tmpDir);
    expect(r.ok).toBe(true);
    const stat = await fs.stat(path.join(tmpDir, ".local-atlas"));
    expect(stat.isDirectory()).toBe(true);
  });
});
