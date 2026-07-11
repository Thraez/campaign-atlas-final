/**
 * Tests for src/atlas/sync/useSyncSettings.ts
 *
 * Covers:
 *   - loadSettings: successful fetch → parsed settings
 *   - loadSettings: non-ok response → empty object
 *   - loadSettings: fetch throws → empty object (network error path)
 *   - saveSettings: POSTs with correct name + serialized contents
 *   - loadSyncMap: successful fetch → parsed map
 *   - loadSyncMap: non-ok response → empty object
 *   - saveSyncMap: POSTs with correct name + serialized contents
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  loadSettings,
  saveSettings,
  loadSyncMap,
  saveSyncMap,
  type SyncSettings,
} from "@/atlas/sync/useSyncSettings";
import type { SyncMap } from "@/atlas/import/syncMap";

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
});

// ── loadSyncMap ───────────────────────────────────────────────────────────────

describe("loadSyncMap", () => {
  it("returns the parsed sync map when fetch succeeds", async () => {
    const map: SyncMap = {
      "notes/corven.md": { id: "corven", baseType: "npc" },
      "places/hall.md": { id: "great-hall", baseType: "location" },
    };
    stubFetch(true, map);
    expect(await loadSyncMap()).toEqual(map);
  });

  it("returns {} when the response is not ok", async () => {
    stubFetch(false);
    expect(await loadSyncMap()).toEqual({});
  });
});

// ── saveSyncMap ───────────────────────────────────────────────────────────────

describe("saveSyncMap", () => {
  it("POSTs to /__atlas/local-write with the correct name and serialized sync map", async () => {
    const stub = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", stub);
    const map: SyncMap = { "notes/corven.md": { id: "corven", baseType: "npc" } };
    await saveSyncMap(map);
    expect(stub).toHaveBeenCalledWith(
      "/__atlas/local-write",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "sync-map.json",
          contents: JSON.stringify(map, null, 2),
        }),
      }),
    );
  });
});
