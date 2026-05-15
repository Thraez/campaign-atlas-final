import { describe, it, expect, vi } from "vitest";
import {
  saveAtlasPatchToLocalFs,
  DisallowedPathError,
  LocalSaveError,
  ConflictError,
  SaveBusyError,
  hashContent,
  type FileChange,
} from "@/atlas/save/localFsSave";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function file(over: Partial<FileChange> = {}): FileChange {
  return {
    path: "content/world/notes/ok.md",
    content: "x",
    kind: "entity-md",
    baseHash: null,
    ...over,
  };
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
          file({ path: "content/world/notes/ok.md", content: "x" }),
          file({ path: "src/App.tsx", content: "y" }),
        ],
        { fetchFn: fetchFn as unknown as typeof fetch },
      ),
    ).rejects.toBeInstanceOf(DisallowedPathError);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("rejects oversized content without calling fetch", async () => {
    const fetchFn = vi.fn();
    const big = "a".repeat(1024 * 1024 + 1);
    await expect(
      saveAtlasPatchToLocalFs(
        [file({ content: big })],
        { fetchFn: fetchFn as unknown as typeof fetch },
      ),
    ).rejects.toBeInstanceOf(LocalSaveError);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("rejects an invalid kind without calling fetch", async () => {
    const fetchFn = vi.fn();
    await expect(
      saveAtlasPatchToLocalFs(
        [{ path: "content/world/notes/ok.md", content: "x", kind: "garbage" as unknown as FileChange["kind"], baseHash: null }],
        { fetchFn: fetchFn as unknown as typeof fetch },
      ),
    ).rejects.toBeInstanceOf(LocalSaveError);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("rejects a malformed baseHash without calling fetch", async () => {
    const fetchFn = vi.fn();
    await expect(
      saveAtlasPatchToLocalFs(
        [file({ baseHash: "not-a-hash" })],
        { fetchFn: fetchFn as unknown as typeof fetch },
      ),
    ).rejects.toBeInstanceOf(LocalSaveError);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("happy path POSTs the new files payload to /__atlas/save", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchFn = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return jsonResponse(200, {
        saved: 1,
        paths: ["content/world/notes/ok.md"],
        files: [{ path: "content/world/notes/ok.md", hash: "sha256:abc" }],
      });
    });
    const result = await saveAtlasPatchToLocalFs(
      [file({ content: "hello", baseHash: "sha256:dead" })],
      { fetchFn: fetchFn as unknown as typeof fetch },
    );
    expect(result.saved).toBe(1);
    expect(result.files?.[0]).toEqual({ path: "content/world/notes/ok.md", hash: "sha256:abc" });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("/__atlas/save");
    expect(calls[0].init?.method).toBe("POST");
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({
      files: [
        { path: "content/world/notes/ok.md", content: "hello", kind: "entity-md", baseHash: "sha256:dead" },
      ],
    });
  });

  it("400 DisallowedPath from server throws DisallowedPathError", async () => {
    const fetchFn = vi.fn(async () =>
      jsonResponse(400, { error: "DisallowedPath", path: "x" }),
    );
    await expect(
      saveAtlasPatchToLocalFs(
        [file({ content: "hi" })],
        { fetchFn: fetchFn as unknown as typeof fetch },
      ),
    ).rejects.toBeInstanceOf(DisallowedPathError);
  });

  it("409 Conflict from server throws ConflictError with reason + failedPath", async () => {
    const fetchFn = vi.fn(async () =>
      jsonResponse(409, {
        error: "Conflict",
        reason: "stale-base",
        failedPath: "content/world/notes/ok.md",
        currentHash: "sha256:cafe",
      }),
    );
    const err = await saveAtlasPatchToLocalFs(
      [file({ content: "x" })],
      { fetchFn: fetchFn as unknown as typeof fetch },
    ).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ConflictError);
    const ce = err as ConflictError;
    expect(ce.reason).toBe("stale-base");
    expect(ce.failedPath).toBe("content/world/notes/ok.md");
    expect(ce.currentHash).toBe("sha256:cafe");
  });

  it("423 Locked from server throws SaveBusyError", async () => {
    const fetchFn = vi.fn(async () =>
      jsonResponse(423, { error: "Locked", detail: "another save in flight" }),
    );
    await expect(
      saveAtlasPatchToLocalFs(
        [file({ content: "x" })],
        { fetchFn: fetchFn as unknown as typeof fetch },
      ),
    ).rejects.toBeInstanceOf(SaveBusyError);
  });

  it("500 from server throws LocalSaveError", async () => {
    const fetchFn = vi.fn(async () =>
      jsonResponse(500, { error: "WriteFailed", detail: "disk full" }),
    );
    await expect(
      saveAtlasPatchToLocalFs(
        [file({ content: "hi" })],
        { fetchFn: fetchFn as unknown as typeof fetch },
      ),
    ).rejects.toBeInstanceOf(LocalSaveError);
  });

  it("sends rebuild:true when opts.rebuild is set", async () => {
    let captured = "";
    const fetchFn = vi.fn(async (_url: string, init?: RequestInit) => {
      captured = String(init?.body);
      return jsonResponse(200, {
        saved: 1,
        paths: ["content/world/notes/ok.md"],
        files: [{ path: "content/world/notes/ok.md", hash: "sha256:abc" }],
        build: { ok: true, durationMs: 42 },
      });
    });
    const result = await saveAtlasPatchToLocalFs(
      [file({ content: "x" })],
      { fetchFn: fetchFn as unknown as typeof fetch },
      { rebuild: true },
    );
    const parsedBody = JSON.parse(captured) as { rebuild?: boolean; files: unknown[] };
    expect(parsedBody.rebuild).toBe(true);
    expect(parsedBody.files).toHaveLength(1);
    expect(result.build).toEqual({ ok: true, durationMs: 42 });
  });

  it("does NOT send rebuild flag when opts is omitted", async () => {
    let captured = "";
    const fetchFn = vi.fn(async (_url: string, init?: RequestInit) => {
      captured = String(init?.body);
      return jsonResponse(200, {
        saved: 1,
        paths: ["content/world/notes/ok.md"],
        files: [{ path: "content/world/notes/ok.md", hash: "sha256:abc" }],
      });
    });
    await saveAtlasPatchToLocalFs(
      [file({ content: "x" })],
      { fetchFn: fetchFn as unknown as typeof fetch },
    );
    expect(JSON.parse(captured)).toEqual({
      files: [
        { path: "content/world/notes/ok.md", content: "x", kind: "entity-md", baseHash: null },
      ],
    });
  });

  it("preserves non-ASCII content in body byte-for-byte", async () => {
    const text = "Genn's Door – äöü 你好";
    let captured = "";
    const fetchFn = vi.fn(async (_url: string, init?: RequestInit) => {
      captured = String(init?.body);
      return jsonResponse(200, {
        saved: 1,
        paths: ["content/world/notes/x.md"],
        files: [{ path: "content/world/notes/x.md", hash: "sha256:abc" }],
      });
    });
    await saveAtlasPatchToLocalFs(
      [file({ path: "content/world/notes/x.md", content: text })],
      { fetchFn: fetchFn as unknown as typeof fetch },
    );
    const parsed = JSON.parse(captured) as { files: Array<{ content: string }> };
    expect(parsed.files[0].content).toBe(text);
  });
});

describe("hashContent", () => {
  it("returns a stable sha256:<hex> prefix", async () => {
    const h = await hashContent("hello");
    expect(h).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it("differs for different content", async () => {
    const a = await hashContent("hello");
    const b = await hashContent("world");
    expect(a).not.toBe(b);
  });
});
