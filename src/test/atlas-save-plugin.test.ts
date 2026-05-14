import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { handleSaveRequest } from "../../scripts/vite-plugin-atlas-save";

let tmp: string;
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "atlas-save-"));
});
afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("handleSaveRequest", () => {
  it("writes a single allowed file", async () => {
    const r = await handleSaveRequest(
      { changes: [{ path: "content/world/notes/ok.md", contents: "hello" }] },
      tmp,
    );
    expect(r.status).toBe(200);
    const written = fs.readFileSync(path.join(tmp, "content/world/notes/ok.md"), "utf8");
    expect(written).toBe("hello");
  });

  it("rejects a disallowed path with no file written", async () => {
    const r = await handleSaveRequest(
      { changes: [{ path: "src/App.tsx", contents: "x" }] },
      tmp,
    );
    expect(r.status).toBe(400);
    expect((r.payload as Record<string, unknown>).error).toBe("DisallowedPath");
    expect(fs.existsSync(path.join(tmp, "src/App.tsx"))).toBe(false);
  });

  it("atomicity: two valid + one disallowed → none written", async () => {
    const r = await handleSaveRequest(
      {
        changes: [
          { path: "content/world/notes/a.md", contents: "a" },
          { path: "content/world/notes/b.md", contents: "b" },
          { path: "package.json", contents: "{}" },
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

  it("rejects oversized contents", async () => {
    const big = "a".repeat(1024 * 1024 + 1);
    const r = await handleSaveRequest(
      { changes: [{ path: "content/world/notes/big.md", contents: big }] },
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

  it("rejects empty changes array", async () => {
    const r = await handleSaveRequest({ changes: [] }, tmp);
    expect(r.status).toBe(400);
    expect((r.payload as Record<string, unknown>).error).toBe("InvalidBody");
  });

  it("creates missing parent directories", async () => {
    const r = await handleSaveRequest(
      {
        changes: [
          { path: "content/new-world/_atlas/world.yaml", contents: "id: x\n" },
        ],
      },
      tmp,
    );
    expect(r.status).toBe(200);
    expect(fs.readFileSync(path.join(tmp, "content/new-world/_atlas/world.yaml"), "utf8")).toBe("id: x\n");
  });

  it("writes non-ASCII contents byte-for-byte", async () => {
    const text = "Genn's Door – äöü 你好";
    const r = await handleSaveRequest(
      { changes: [{ path: "content/world/notes/u.md", contents: text }] },
      tmp,
    );
    expect(r.status).toBe(200);
    const buf = fs.readFileSync(path.join(tmp, "content/world/notes/u.md"));
    expect(new TextDecoder("utf-8").decode(buf)).toBe(text);
  });

  describe("afterWrite (rebuild)", () => {
    it("runs the afterWrite hook only after files are written successfully", async () => {
      const seenAtHook: { ok: boolean } = { ok: false };
      const afterWrite = async () => {
        // File must already be on disk by the time the hook fires.
        seenAtHook.ok = fs.existsSync(path.join(tmp, "content/world/notes/r.md"));
        return { ok: true, durationMs: 1 };
      };
      const r = await handleSaveRequest(
        { changes: [{ path: "content/world/notes/r.md", contents: "x" }] },
        tmp,
        { afterWrite },
      );
      expect(r.status).toBe(200);
      expect(seenAtHook.ok).toBe(true);
      const payload = (r as { payload: { build?: { ok: boolean } } }).payload;
      expect(payload.build).toEqual({ ok: true, durationMs: 1 });
    });

    it("does NOT run afterWrite when validation fails", async () => {
      const afterWrite = vi.fn();
      const r = await handleSaveRequest(
        { changes: [{ path: "src/App.tsx", contents: "x" }] },
        tmp,
        { afterWrite },
      );
      expect(r.status).toBe(400);
      expect(afterWrite).not.toHaveBeenCalled();
    });

    it("returns a failed-build result without throwing when afterWrite rejects", async () => {
      const afterWrite = async () => {
        throw new Error("build crashed");
      };
      const r = await handleSaveRequest(
        { changes: [{ path: "content/world/notes/r.md", contents: "x" }] },
        tmp,
        { afterWrite },
      );
      expect(r.status).toBe(200);
      const payload = (r as { payload: { build?: { ok: boolean; stderr?: string } } }).payload;
      expect(payload.build?.ok).toBe(false);
      expect(payload.build?.stderr).toContain("build crashed");
      // File was still written — the user has data on disk.
      expect(fs.existsSync(path.join(tmp, "content/world/notes/r.md"))).toBe(true);
    });
  });
});