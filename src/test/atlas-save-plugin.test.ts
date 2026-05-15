import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { handleSaveRequest, type FilePayload } from "../../scripts/vite-plugin-atlas-save";

let tmp: string;
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "atlas-save-"));
});
afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

function file(over: Partial<FilePayload> = {}): FilePayload {
  return {
    path: "content/world/notes/ok.md",
    content: "x",
    kind: "entity-md",
    baseHash: null,
    ...over,
  };
}

describe("handleSaveRequest", () => {
  it("writes a single allowed file and returns its hash", async () => {
    const r = await handleSaveRequest(
      { files: [file({ content: "hello" })] },
      tmp,
    );
    expect(r.status).toBe(200);
    const written = fs.readFileSync(path.join(tmp, "content/world/notes/ok.md"), "utf8");
    expect(written).toBe("hello");
    const payload = (r as { payload: { files: Array<{ path: string; hash: string }> } }).payload;
    expect(payload.files).toHaveLength(1);
    expect(payload.files[0].path).toBe("content/world/notes/ok.md");
    expect(payload.files[0].hash).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it("rejects a disallowed path with no file written", async () => {
    const r = await handleSaveRequest(
      { files: [file({ path: "src/App.tsx" })] },
      tmp,
    );
    expect(r.status).toBe(400);
    expect((r.payload as Record<string, unknown>).error).toBe("DisallowedPath");
    expect(fs.existsSync(path.join(tmp, "src/App.tsx"))).toBe(false);
  });

  it("pre-write validation: two valid + one disallowed → none written", async () => {
    const r = await handleSaveRequest(
      {
        files: [
          file({ path: "content/world/notes/a.md", content: "a" }),
          file({ path: "content/world/notes/b.md", content: "b" }),
          file({ path: "package.json", content: "{}" }),
        ],
      },
      tmp,
    );
    expect(r.status).toBe(400);
    expect((r.payload as Record<string, unknown>).error).toBe("DisallowedPath");
    expect(fs.existsSync(path.join(tmp, "content/world/notes/a.md"))).toBe(false);
    expect(fs.existsSync(path.join(tmp, "content/world/notes/b.md"))).toBe(false);
    expect(fs.existsSync(path.join(tmp, "package.json"))).toBe(false);
  });

  it("rejects oversized content", async () => {
    const big = "a".repeat(1024 * 1024 + 1);
    const r = await handleSaveRequest(
      { files: [file({ path: "content/world/notes/big.md", content: big })] },
      tmp,
    );
    expect(r.status).toBe(400);
    expect((r.payload as Record<string, unknown>).error).toBe("OversizedContent");
    expect(fs.existsSync(path.join(tmp, "content/world/notes/big.md"))).toBe(false);
  });

  it("rejects malformed body", async () => {
    const r = await handleSaveRequest({ nope: true }, tmp);
    expect(r.status).toBe(400);
    expect((r.payload as Record<string, unknown>).error).toBe("InvalidBody");
  });

  it("rejects empty files array", async () => {
    const r = await handleSaveRequest({ files: [] }, tmp);
    expect(r.status).toBe(400);
    expect((r.payload as Record<string, unknown>).error).toBe("InvalidBody");
  });

  it("rejects an invalid kind", async () => {
    const r = await handleSaveRequest(
      {
        files: [
          { path: "content/world/notes/x.md", content: "x", kind: "garbage", baseHash: null },
        ],
      },
      tmp,
    );
    expect(r.status).toBe(400);
    expect((r.payload as Record<string, unknown>).error).toBe("InvalidBody");
  });

  it("rejects a malformed baseHash", async () => {
    const r = await handleSaveRequest(
      {
        files: [
          { path: "content/world/notes/x.md", content: "x", kind: "entity-md", baseHash: "nope" },
        ],
      },
      tmp,
    );
    expect(r.status).toBe(400);
    expect((r.payload as Record<string, unknown>).error).toBe("InvalidBody");
  });

  it("creates missing parent directories", async () => {
    const r = await handleSaveRequest(
      {
        files: [
          file({
            path: "content/new-world/_atlas/world.yaml",
            content: "id: x\n",
            kind: "world-yaml",
          }),
        ],
      },
      tmp,
    );
    expect(r.status).toBe(200);
    expect(fs.readFileSync(path.join(tmp, "content/new-world/_atlas/world.yaml"), "utf8")).toBe("id: x\n");
  });

  it("writes non-ASCII content byte-for-byte", async () => {
    const text = "Genn's Door – äöü 你好";
    const r = await handleSaveRequest(
      { files: [file({ path: "content/world/notes/u.md", content: text })] },
      tmp,
    );
    expect(r.status).toBe(200);
    const buf = fs.readFileSync(path.join(tmp, "content/world/notes/u.md"));
    expect(new TextDecoder("utf-8").decode(buf)).toBe(text);
  });

  describe("batch validation (A6)", () => {
    it("rejects a payload with two entries sharing the same path", async () => {
      const r = await handleSaveRequest(
        {
          files: [
            file({ path: "content/world/notes/dup.md", content: "a" }),
            file({ path: "content/world/notes/dup.md", content: "b" }),
          ],
        },
        tmp,
      );
      expect(r.status).toBe(400);
      const p = r.payload as { error: string; reason: string; paths: string[] };
      expect(p.error).toBe("InvalidBody");
      expect(p.reason).toBe("duplicate-path");
      expect(p.paths).toEqual(["content/world/notes/dup.md"]);
      expect(fs.existsSync(path.join(tmp, "content/world/notes/dup.md"))).toBe(false);
    });

    it("rejects an entity-md whose frontmatter cannot be parsed", async () => {
      // gray-matter throws on malformed frontmatter — unterminated YAML between --- markers.
      const bad = "---\ntitle: x\n  bad: : :\n---\nbody";
      const r = await handleSaveRequest(
        { files: [file({ path: "content/world/notes/bad.md", content: bad })] },
        tmp,
      );
      expect(r.status).toBe(400);
      const p = r.payload as { error: string; reason: string; failedPath: string };
      expect(p.error).toBe("InvalidContent");
      expect(p.reason).toBe("entity-md-parse-failed");
      expect(p.failedPath).toBe("content/world/notes/bad.md");
      // No write.
      expect(fs.existsSync(path.join(tmp, "content/world/notes/bad.md"))).toBe(false);
    });

    it("rejects a world-yaml that fails js-yaml parse", async () => {
      const bad = "maps:\n  - id: x\n    name: y\n   bad: indent";
      const r = await handleSaveRequest(
        {
          files: [
            file({
              path: "content/world/_atlas/world.yaml",
              content: bad,
              kind: "world-yaml",
            }),
          ],
        },
        tmp,
      );
      expect(r.status).toBe(400);
      const p = r.payload as { error: string; reason: string; failedPath: string };
      expect(p.error).toBe("InvalidContent");
      expect(p.reason).toBe("world-yaml-parse-failed");
    });

    it("accepts a well-formed entity-md with frontmatter", async () => {
      const ok = "---\ntitle: Thornhold\natlas:\n  type: settlement\n---\nBody";
      const r = await handleSaveRequest(
        { files: [file({ path: "content/world/notes/ok.md", content: ok })] },
        tmp,
      );
      expect(r.status).toBe(200);
    });

    it("accepts a well-formed world-yaml", async () => {
      const ok = "maps:\n  - id: x\n    name: Test\n    width: 100\n    height: 100\n";
      const r = await handleSaveRequest(
        {
          files: [
            file({
              path: "content/world/_atlas/world.yaml",
              content: ok,
              kind: "world-yaml",
            }),
          ],
        },
        tmp,
      );
      expect(r.status).toBe(200);
    });
  });

  describe("baseHash conflict semantics (A5)", () => {
    const sha256 = (s: string): string => {
      // Match the endpoint's defaultHash.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const c = require("node:crypto") as typeof import("node:crypto");
      return "sha256:" + c.createHash("sha256").update(s, "utf8").digest("hex");
    };

    it("baseHash null on a fresh file path writes successfully (create case)", async () => {
      const r = await handleSaveRequest(
        { files: [file({ path: "content/world/notes/new.md", content: "fresh", baseHash: null })] },
        tmp,
      );
      expect(r.status).toBe(200);
      expect(fs.readFileSync(path.join(tmp, "content/world/notes/new.md"), "utf8")).toBe("fresh");
    });

    it("baseHash null but file already exists → 409 already-exists, no overwrite", async () => {
      const target = path.join(tmp, "content/world/notes/dupe.md");
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, "original");
      const r = await handleSaveRequest(
        { files: [file({ path: "content/world/notes/dupe.md", content: "would-overwrite", baseHash: null })] },
        tmp,
      );
      expect(r.status).toBe(409);
      const p = r.payload as { error: string; reason: string; failedPath: string; currentHash: string };
      expect(p.error).toBe("Conflict");
      expect(p.reason).toBe("already-exists");
      expect(p.failedPath).toBe("content/world/notes/dupe.md");
      expect(p.currentHash).toBe(sha256("original"));
      // File untouched.
      expect(fs.readFileSync(target, "utf8")).toBe("original");
    });

    it("baseHash non-null but file missing → 409 missing-base", async () => {
      const r = await handleSaveRequest(
        {
          files: [
            file({
              path: "content/world/notes/ghost.md",
              content: "would-write",
              baseHash: sha256("anything"),
            }),
          ],
        },
        tmp,
      );
      expect(r.status).toBe(409);
      const p = r.payload as { error: string; reason: string; failedPath: string };
      expect(p.error).toBe("Conflict");
      expect(p.reason).toBe("missing-base");
      expect(p.failedPath).toBe("content/world/notes/ghost.md");
    });

    it("baseHash matches current on-disk content → write succeeds", async () => {
      const target = path.join(tmp, "content/world/notes/edit.md");
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, "v1");
      const r = await handleSaveRequest(
        {
          files: [
            file({
              path: "content/world/notes/edit.md",
              content: "v2",
              baseHash: sha256("v1"),
            }),
          ],
        },
        tmp,
      );
      expect(r.status).toBe(200);
      expect(fs.readFileSync(target, "utf8")).toBe("v2");
      const payload = (r as { payload: { files: Array<{ path: string; hash: string }> } }).payload;
      expect(payload.files[0].hash).toBe(sha256("v2"));
    });

    it("baseHash diverges from current on-disk content → 409 stale-base, no overwrite", async () => {
      const target = path.join(tmp, "content/world/notes/edit.md");
      fs.mkdirSync(path.dirname(target), { recursive: true });
      // Someone else changed the file under us:
      fs.writeFileSync(target, "v1-then-someone-edited");
      const r = await handleSaveRequest(
        {
          files: [
            file({
              path: "content/world/notes/edit.md",
              content: "v2-from-editor",
              baseHash: sha256("v1"),
            }),
          ],
        },
        tmp,
      );
      expect(r.status).toBe(409);
      const p = r.payload as { error: string; reason: string; failedPath: string; currentHash: string };
      expect(p.error).toBe("Conflict");
      expect(p.reason).toBe("stale-base");
      expect(p.failedPath).toBe("content/world/notes/edit.md");
      expect(p.currentHash).toBe(sha256("v1-then-someone-edited"));
      // File untouched.
      expect(fs.readFileSync(target, "utf8")).toBe("v1-then-someone-edited");
    });

    it("one conflicting file in a batch aborts the whole batch (no partial writes)", async () => {
      const okPath = path.join(tmp, "content/world/notes/ok-batch.md");
      const conflictPath = path.join(tmp, "content/world/notes/conflict-batch.md");
      fs.mkdirSync(path.dirname(conflictPath), { recursive: true });
      fs.writeFileSync(conflictPath, "external-edit");

      const r = await handleSaveRequest(
        {
          files: [
            file({ path: "content/world/notes/ok-batch.md", content: "good", baseHash: null }),
            file({
              path: "content/world/notes/conflict-batch.md",
              content: "stomp",
              baseHash: sha256("what-editor-loaded"),
            }),
          ],
        },
        tmp,
      );
      expect(r.status).toBe(409);
      expect((r.payload as { reason: string }).reason).toBe("stale-base");
      // Neither file was touched (no partial writes).
      expect(fs.existsSync(okPath)).toBe(false);
      expect(fs.readFileSync(conflictPath, "utf8")).toBe("external-edit");
    });
  });

  describe("backup machinery (A7)", () => {
    function listBackupTimestamps(repoRoot: string, relPath: string): string[] {
      const root = path.join(repoRoot, ".atlas-backups");
      if (!fs.existsSync(root)) return [];
      const out: string[] = [];
      for (const ts of fs.readdirSync(root)) {
        const candidate = path.join(root, ts, relPath);
        if (fs.existsSync(candidate)) out.push(ts);
      }
      return out.sort();
    }

    it("writes a pre-overwrite backup of the existing file under .atlas-backups/<ts>/", async () => {
      const target = path.join(tmp, "content/world/notes/edit.md");
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, "v1");
      const sha256 = (s: string) => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const c = require("node:crypto") as typeof import("node:crypto");
        return "sha256:" + c.createHash("sha256").update(s, "utf8").digest("hex");
      };
      const r = await handleSaveRequest(
        {
          files: [
            file({
              path: "content/world/notes/edit.md",
              content: "v2",
              baseHash: sha256("v1"),
            }),
          ],
        },
        tmp,
      );
      expect(r.status).toBe(200);
      const stamps = listBackupTimestamps(tmp, "content/world/notes/edit.md");
      expect(stamps).toHaveLength(1);
      const backupBody = fs.readFileSync(
        path.join(tmp, ".atlas-backups", stamps[0], "content/world/notes/edit.md"),
        "utf8",
      );
      expect(backupBody).toBe("v1");
      // Live file shows v2, backup shows v1 — rollback is possible.
      expect(fs.readFileSync(target, "utf8")).toBe("v2");
    });

    it("does NOT create a backup for net-new files (nothing to back up)", async () => {
      const r = await handleSaveRequest(
        { files: [file({ path: "content/world/notes/fresh.md", content: "new" })] },
        tmp,
      );
      expect(r.status).toBe(200);
      expect(fs.existsSync(path.join(tmp, ".atlas-backups"))).toBe(false);
    });

    it("retains exactly 3 timestamped backups per path; older ones are pruned", async () => {
      const target = path.join(tmp, "content/world/notes/edit.md");
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, "v0");
      const sha256 = (s: string) => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const c = require("node:crypto") as typeof import("node:crypto");
        return "sha256:" + c.createHash("sha256").update(s, "utf8").digest("hex");
      };

      const saveOnce = async (prev: string, next: string) => {
        const r = await handleSaveRequest(
          {
            files: [
              file({
                path: "content/world/notes/edit.md",
                content: next,
                baseHash: sha256(prev),
              }),
            ],
          },
          tmp,
        );
        expect(r.status).toBe(200);
        // Backups are sorted by ISO timestamp string; tests run fast enough
        // that two saves can land in the same millisecond. Sleep a tick so
        // each save gets a distinct timestamp directory.
        await new Promise((r) => setTimeout(r, 25));
      };

      // Save 5 versions; backup is taken BEFORE the new content overwrites,
      // so after 5 saves the backup set is { v0, v1, v2, v3, v4 } → pruned to last 3.
      await saveOnce("v0", "v1");
      await saveOnce("v1", "v2");
      await saveOnce("v2", "v3");
      await saveOnce("v3", "v4");
      await saveOnce("v4", "v5");
      const stamps = listBackupTimestamps(tmp, "content/world/notes/edit.md");
      expect(stamps).toHaveLength(3);
      const bodies = stamps.map((ts) =>
        fs.readFileSync(
          path.join(tmp, ".atlas-backups", ts, "content/world/notes/edit.md"),
          "utf8",
        ),
      );
      // The most recent three pre-write states are kept.
      expect(bodies).toEqual(["v2", "v3", "v4"]);
      // Live file is v5.
      expect(fs.readFileSync(target, "utf8")).toBe("v5");
    });

    it("backups for different paths don't compete for retention slots", async () => {
      const ts1 = path.join(tmp, "content/world/notes/a.md");
      const ts2 = path.join(tmp, "content/world/notes/b.md");
      fs.mkdirSync(path.dirname(ts1), { recursive: true });
      fs.writeFileSync(ts1, "A0");
      fs.writeFileSync(ts2, "B0");
      const sha256 = (s: string) => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const c = require("node:crypto") as typeof import("node:crypto");
        return "sha256:" + c.createHash("sha256").update(s, "utf8").digest("hex");
      };
      // Save A four times — should prune A's backups to last 3.
      let prevA = "A0";
      for (let i = 1; i <= 4; i++) {
        await handleSaveRequest(
          {
            files: [
              file({ path: "content/world/notes/a.md", content: `A${i}`, baseHash: sha256(prevA) }),
            ],
          },
          tmp,
        );
        prevA = `A${i}`;
        await new Promise((r) => setTimeout(r, 25));
      }
      // Single save on B — its single backup must survive.
      await handleSaveRequest(
        {
          files: [
            file({ path: "content/world/notes/b.md", content: "B1", baseHash: sha256("B0") }),
          ],
        },
        tmp,
      );
      const aStamps = listBackupTimestamps(tmp, "content/world/notes/a.md");
      const bStamps = listBackupTimestamps(tmp, "content/world/notes/b.md");
      expect(aStamps).toHaveLength(3);
      expect(bStamps).toHaveLength(1);
    });
  });

  describe("multi-file write with rollback (A9)", () => {
    const sha256 = (s: string) => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const c = require("node:crypto") as typeof import("node:crypto");
      return "sha256:" + c.createHash("sha256").update(s, "utf8").digest("hex");
    };

    it("returns 207 partialWrite when a file's write fails mid-batch and rolls back the prior file", async () => {
      // Set up: an existing file ok.md (so rollback can restore it).
      const okAbs = path.join(tmp, "content/world/notes/ok.md");
      fs.mkdirSync(path.dirname(okAbs), { recursive: true });
      fs.writeFileSync(okAbs, "v1");
      // Land a regular file at the path where a directory needs to live for
      // the second write — mkdir will fail on that path.
      const blockerAbs = path.join(tmp, "content/world/blocked");
      fs.writeFileSync(blockerAbs, "i-am-a-file-not-a-directory");

      const r = await handleSaveRequest(
        {
          files: [
            file({ path: "content/world/notes/ok.md", content: "v2", baseHash: sha256("v1") }),
            file({ path: "content/world/blocked/cannot-write.md", content: "x", baseHash: null }),
          ],
        },
        tmp,
      );
      expect(r.status).toBe(207);
      const p = r.payload as {
        error: string;
        partialWrite: boolean;
        rolledBack: number;
        failedPath: string;
        writeError: string;
      };
      expect(p.error).toBe("WriteFailed");
      expect(p.partialWrite).toBe(true);
      expect(p.failedPath).toBe("content/world/blocked/cannot-write.md");
      expect(p.rolledBack).toBe(1);
      // ok.md was already overwritten in step 1, then restored from backup.
      expect(fs.readFileSync(okAbs, "utf8")).toBe("v1");
      // Backup of the original is still on disk under .atlas-backups so the
      // DM can recover even if the in-memory rollback failed.
      const backupRoot = path.join(tmp, ".atlas-backups");
      const stamps = fs.readdirSync(backupRoot);
      expect(stamps.length).toBe(1);
      const backed = fs.readFileSync(
        path.join(backupRoot, stamps[0], "content/world/notes/ok.md"),
        "utf8",
      );
      expect(backed).toBe("v1");
    });

    it("rolls back a freshly-created file by deleting it (no backup existed)", async () => {
      // First file is a net-new create (no backup needed), second file fails.
      const blockerAbs = path.join(tmp, "content/world/blocked");
      fs.mkdirSync(path.dirname(blockerAbs), { recursive: true });
      fs.writeFileSync(blockerAbs, "blocker");

      const r = await handleSaveRequest(
        {
          files: [
            file({ path: "content/world/notes/created.md", content: "fresh", baseHash: null }),
            file({ path: "content/world/blocked/cannot.md", content: "x", baseHash: null }),
          ],
        },
        tmp,
      );
      expect(r.status).toBe(207);
      // Created file was rolled back via unlink.
      expect(fs.existsSync(path.join(tmp, "content/world/notes/created.md"))).toBe(false);
    });

    it("does not leave .tmp orphans behind after a failed write", async () => {
      const blockerAbs = path.join(tmp, "content/world/blocked");
      fs.mkdirSync(path.dirname(blockerAbs), { recursive: true });
      fs.writeFileSync(blockerAbs, "blocker");
      await handleSaveRequest(
        {
          files: [
            file({ path: "content/world/blocked/x.md", content: "x", baseHash: null }),
          ],
        },
        tmp,
      );
      // Walk the tree for any .tmp files.
      const allFiles: string[] = [];
      const walk = (dir: string) => {
        if (!fs.existsSync(dir)) return;
        for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
          const p = path.join(dir, e.name);
          if (e.isDirectory()) walk(p);
          else allFiles.push(p);
        }
      };
      walk(tmp);
      const orphans = allFiles.filter((p) => p.endsWith(".tmp"));
      expect(orphans).toEqual([]);
    });
  });

  describe("afterWrite + rebuild status (A10)", () => {
    it("runs the afterWrite hook only after files are written successfully", async () => {
      const seenAtHook: { ok: boolean } = { ok: false };
      const afterWrite = async () => {
        // File must already be on disk by the time the hook fires.
        seenAtHook.ok = fs.existsSync(path.join(tmp, "content/world/notes/r.md"));
        return { ok: true, durationMs: 1 };
      };
      const r = await handleSaveRequest(
        { files: [file({ path: "content/world/notes/r.md" })] },
        tmp,
        { afterWrite, readPublishedAt: async () => "2026-05-15T05:00:00.000Z" },
      );
      expect(r.status).toBe(200);
      expect(seenAtHook.ok).toBe(true);
      const payload = (r as { payload: { rebuilt?: boolean; publishedAt?: string | null; build?: { ok: boolean } } }).payload;
      expect(payload.rebuilt).toBe(true);
      expect(payload.publishedAt).toBe("2026-05-15T05:00:00.000Z");
      expect(payload.build).toEqual({ ok: true, durationMs: 1 });
    });

    it("does NOT run afterWrite when validation fails", async () => {
      const afterWrite = vi.fn();
      const r = await handleSaveRequest(
        { files: [file({ path: "src/App.tsx" })] },
        tmp,
        { afterWrite },
      );
      expect(r.status).toBe(400);
      expect(afterWrite).not.toHaveBeenCalled();
    });

    it("returns 207 rebuilt:false when afterWrite reports a failed build", async () => {
      const afterWrite = async () => ({ ok: false, durationMs: 42, stderr: "build failed: bad-yaml" });
      const r = await handleSaveRequest(
        { files: [file({ path: "content/world/notes/r.md" })] },
        tmp,
        { afterWrite },
      );
      expect(r.status).toBe(207);
      const p = r.payload as {
        rebuilt: boolean;
        rebuildError: string;
        publishedAt: string | null;
        saved: number;
      };
      expect(p.rebuilt).toBe(false);
      expect(p.rebuildError).toContain("bad-yaml");
      expect(p.publishedAt).toBeNull();
      expect(p.saved).toBe(1);
      // File is still on disk.
      expect(fs.existsSync(path.join(tmp, "content/world/notes/r.md"))).toBe(true);
    });

    it("returns 207 when afterWrite throws (treated as a failed rebuild)", async () => {
      const afterWrite = async () => {
        throw new Error("build crashed");
      };
      const r = await handleSaveRequest(
        { files: [file({ path: "content/world/notes/r.md" })] },
        tmp,
        { afterWrite },
      );
      expect(r.status).toBe(207);
      const p = r.payload as { rebuilt: boolean; rebuildError: string };
      expect(p.rebuilt).toBe(false);
      expect(p.rebuildError).toContain("build crashed");
      // File was still written — the user has data on disk.
      expect(fs.existsSync(path.join(tmp, "content/world/notes/r.md"))).toBe(true);
    });

    it("returns 200 rebuilt:undefined when no afterWrite is supplied (no rebuild requested)", async () => {
      const r = await handleSaveRequest(
        { files: [file({ path: "content/world/notes/r.md" })] },
        tmp,
      );
      expect(r.status).toBe(200);
      const p = r.payload as { rebuilt?: boolean };
      expect(p.rebuilt).toBeUndefined();
    });
  });
});
