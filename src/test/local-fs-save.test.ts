import { describe, it, expect, vi } from "vitest";
import {
  saveAtlasPatchToLocalFs,
  DisallowedPathError,
  LocalSaveError,
} from "@/atlas/save/localFsSave";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("saveAtlasPatchToLocalFs", () => {
  it("rejects empty changes without calling fetch", async () => {
    const fetchFn = vi.fn();
    await expect(saveAtlasPatchToLocalFs([], { fetchFn: fetchFn as unknown as typeof fetch }))
      .rejects.toBeInstanceOf(LocalSaveError);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("rejects disallowed path without calling fetch", async () => {
    const fetchFn = vi.fn();
    await expect(
      saveAtlasPatchToLocalFs(
        [
          { path: "content/world/notes/ok.md", contents: "x" },
          { path: "src/App.tsx", contents: "y" },
        ],
        { fetchFn: fetchFn as unknown as typeof fetch },
      ),
    ).rejects.toBeInstanceOf(DisallowedPathError);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("rejects oversized contents without calling fetch", async () => {
    const fetchFn = vi.fn();
    const big = "a".repeat(1024 * 1024 + 1);
    await expect(
      saveAtlasPatchToLocalFs(
        [{ path: "content/world/notes/ok.md", contents: big }],
        { fetchFn: fetchFn as unknown as typeof fetch },
      ),
    ).rejects.toBeInstanceOf(LocalSaveError);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("happy path POSTs JSON body to /__atlas/save", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchFn = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return jsonResponse(200, { written: 1, paths: ["content/world/notes/ok.md"] });
    });
    const result = await saveAtlasPatchToLocalFs(
      [{ path: "content/world/notes/ok.md", contents: "hello" }],
      { fetchFn: fetchFn as unknown as typeof fetch },
    );
    expect(result).toEqual({ written: 1, paths: ["content/world/notes/ok.md"] });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("/__atlas/save");
    expect(calls[0].init?.method).toBe("POST");
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({
      changes: [{ path: "content/world/notes/ok.md", contents: "hello" }],
    });
  });

  it("400 DisallowedPath from server throws DisallowedPathError", async () => {
    const fetchFn = vi.fn(async () =>
      jsonResponse(400, { error: "DisallowedPath", path: "x" }),
    );
    await expect(
      saveAtlasPatchToLocalFs(
        [{ path: "content/world/notes/ok.md", contents: "hi" }],
        { fetchFn: fetchFn as unknown as typeof fetch },
      ),
    ).rejects.toBeInstanceOf(DisallowedPathError);
  });

  it("500 from server throws LocalSaveError", async () => {
    const fetchFn = vi.fn(async () =>
      jsonResponse(500, { error: "WriteFailed", detail: "disk full" }),
    );
    await expect(
      saveAtlasPatchToLocalFs(
        [{ path: "content/world/notes/ok.md", contents: "hi" }],
        { fetchFn: fetchFn as unknown as typeof fetch },
      ),
    ).rejects.toBeInstanceOf(LocalSaveError);
  });

  it("sends rebuild:true when opts.rebuild is set", async () => {
    let captured = "";
    const fetchFn = vi.fn(async (_url: string, init?: RequestInit) => {
      captured = String(init?.body);
      return jsonResponse(200, { written: 1, paths: ["content/world/notes/ok.md"], build: { ok: true, durationMs: 42 } });
    });
    const result = await saveAtlasPatchToLocalFs(
      [{ path: "content/world/notes/ok.md", contents: "x" }],
      { fetchFn: fetchFn as unknown as typeof fetch },
      { rebuild: true },
    );
    expect(JSON.parse(captured)).toEqual({
      changes: [{ path: "content/world/notes/ok.md", contents: "x" }],
      rebuild: true,
    });
    expect(result.build).toEqual({ ok: true, durationMs: 42 });
  });

  it("does NOT send rebuild flag when opts is omitted", async () => {
    let captured = "";
    const fetchFn = vi.fn(async (_url: string, init?: RequestInit) => {
      captured = String(init?.body);
      return jsonResponse(200, { written: 1, paths: ["content/world/notes/ok.md"] });
    });
    await saveAtlasPatchToLocalFs(
      [{ path: "content/world/notes/ok.md", contents: "x" }],
      { fetchFn: fetchFn as unknown as typeof fetch },
    );
    expect(JSON.parse(captured)).toEqual({
      changes: [{ path: "content/world/notes/ok.md", contents: "x" }],
    });
  });

  it("preserves non-ASCII contents in body byte-for-byte", async () => {
    const text = "Genn's Door – äöü 你好";
    let captured = "";
    const fetchFn = vi.fn(async (_url: string, init?: RequestInit) => {
      captured = String(init?.body);
      return jsonResponse(200, { written: 1, paths: ["content/world/notes/x.md"] });
    });
    await saveAtlasPatchToLocalFs(
      [{ path: "content/world/notes/x.md", contents: text }],
      { fetchFn: fetchFn as unknown as typeof fetch },
    );
    const parsed = JSON.parse(captured);
    expect(parsed.changes[0].contents).toBe(text);
  });
});