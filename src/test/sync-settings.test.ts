/**
 * Tests for src/atlas/sync/useSyncSettings.ts
 *
 * Covers:
 *   - loadSettings: successful fetch → parsed settings
 *   - loadSettings: non-ok response → empty object
 *   - loadSettings: fetch throws → empty object (network error path)
 *   - saveSettings: POSTs with correct name + serialized contents
 *   - saveSettings: non-ok response → rejects (write failure surfaces, not swallowed)
 *   - loadSyncMapFile: successful fetch → the per-world file (R-14)
 *   - loadSyncMapFile: non-ok response → rejects (a broken map is never read as empty)
 *   - saveWorldSyncMap: POSTs one world's map to the merge route
 *   - saveWorldSyncMap: non-ok response → rejects (write failure surfaces, not swallowed)
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  loadSettings,
  saveSettings,
  loadSyncMapFile,
  saveWorldSyncMap,
  type SyncSettings,
} from "@/atlas/sync/useSyncSettings";
import type { SyncMap, SyncMapFile } from "@/atlas/import/syncMap";

afterEach(() => vi.restoreAllMocks());

function stubFetch(ok: boolean, jsonValue?: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok,
      json: ok ? async () => jsonValue : undefined,
    }),
  );
}

function stubFetchThrow() {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network error")));
}

// ── loadSettings ─────────────────────────────────────────────────────────────

describe("loadSettings", () => {
  it("returns parsed settings when fetch succeeds", async () => {
    const stored: SyncSettings = { vaultPath: "/my/vault", ignoreGlobs: ["*.tmp"] };
    stubFetch(true, stored);
    expect(await loadSettings()).toEqual(stored);
  });

  it("returns {} when the response is not ok (e.g. 404)", async () => {
    stubFetch(false);
    expect(await loadSettings()).toEqual({});
  });

  it("returns {} when fetch throws (network unreachable)", async () => {
    stubFetchThrow();
    expect(await loadSettings()).toEqual({});
  });
});

// ── saveSettings ──────────────────────────────────────────────────────────────

describe("saveSettings", () => {
  it("POSTs to /__atlas/local-write with the correct name and serialized contents", async () => {
    const stub = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", stub);
    const settings: SyncSettings = { vaultPath: "/vault", ignoreGlobs: [] };
    await saveSettings(settings);
    expect(stub).toHaveBeenCalledWith(
      "/__atlas/local-write",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "editor-settings.json",
          contents: JSON.stringify(settings, null, 2),
        }),
      }),
    );
  });

  it("rejects when the response is not ok (e.g. 500)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 500, text: async () => "disk full" }),
    );
    await expect(saveSettings({ vaultPath: "/vault" })).rejects.toThrow(/500/);
  });
});

// ── loadSyncMapFile ───────────────────────────────────────────────────────────

describe("loadSyncMapFile", () => {
  it("returns the per-world file when fetch succeeds", async () => {
    const file: SyncMapFile = {
      version: 2,
      worlds: {
        a: { "notes/corven.md": { id: "corven", baseType: "npc" } },
        b: { "places/hall.md": { id: "great-hall", baseType: "location" } },
      },
    };
    stubFetch(true, file);
    expect(await loadSyncMapFile()).toEqual(file);
  });

  it("rejects when the response is not ok, so a broken map is never overwritten as empty", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 500, text: async () => "not valid JSON" }),
    );
    await expect(loadSyncMapFile()).rejects.toThrow(/500/);
  });

  it("rejects an old flat map: the dev server upgrades it, the browser can't tell its world", async () => {
    stubFetch(true, { "notes/corven.md": { id: "corven", baseType: "npc" } });
    await expect(loadSyncMapFile()).rejects.toThrow(/predates per-world sync/);
  });
});

// ── saveWorldSyncMap ──────────────────────────────────────────────────────────

describe("saveWorldSyncMap", () => {
  it("POSTs one world's map to the merge route", async () => {
    const stub = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", stub);
    const map: SyncMap = { "notes/corven.md": { id: "corven", baseType: "npc" } };
    await saveWorldSyncMap("w", map);
    expect(stub).toHaveBeenCalledWith(
      "/__atlas/local/sync-map/world",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ worldId: "w", map }),
      }),
    );
  });

  it("rejects when the response is not ok (e.g. 500)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 500, text: async () => "disk full" }),
    );
    await expect(saveWorldSyncMap("w", {})).rejects.toThrow(/500/);
  });
});
