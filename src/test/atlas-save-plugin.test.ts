import { describe, it, expect, beforeEach, afterEach } from "vitest";
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
});