import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  STORAGE_KEY,
  LEGACY_STORAGE_KEY_V1,
  LEGACY_STORAGE_KEY_V2,
  overrideKey,
  safeParseOverrides,
  loadOverrides,
  finishLegacyMigration,
  persistOverrides,
  type Overrides,
} from "@/atlas/editor/placementOverrides";

beforeEach(() => {
  localStorage.clear();
});

describe("safeParseOverrides", () => {
  it("returns {} for non-JSON garbage", () => {
    expect(safeParseOverrides("not json{{")).toEqual({});
  });

  it("returns {} for schema-invalid JSON (non-numeric coord)", () => {
    expect(safeParseOverrides(JSON.stringify({ "m1:e1": { x: "nope", y: 2 } }))).toEqual({});
  });

  it("parses a valid v3 record with label and null removals", () => {
    const raw = JSON.stringify({ "m1:e1": { x: 10, y: 20, label: "Keep" }, "m1:e2": null });
    expect(safeParseOverrides(raw)).toEqual({
      "m1:e1": { x: 10, y: 20, label: "Keep" },
      "m1:e2": null,
    });
  });
});

describe("loadOverrides", () => {
  it("returns {} when storage is empty", () => {
    expect(loadOverrides()).toEqual({});
  });

  it("reads the current v3 key when present", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ "m1:e1": { x: 1, y: 2 } }));
    expect(loadOverrides()).toEqual({ "m1:e1": { x: 1, y: 2 } });
  });

  it("falls back to v2 (same key shape, x/y only) when v3 is absent", () => {
    localStorage.setItem(LEGACY_STORAGE_KEY_V2, JSON.stringify({ "m1:e1": { x: 3, y: 4 } }));
    expect(loadOverrides()).toEqual({ "m1:e1": { x: 3, y: 4 } });
  });

  it("parks v1 (entityId-only) entries under __legacy__ until a map is known", () => {
    localStorage.setItem(LEGACY_STORAGE_KEY_V1, JSON.stringify({ e1: { x: 5, y: 6 } }));
    expect(loadOverrides()).toEqual({ "__legacy__:e1": { x: 5, y: 6 } });
  });

  it("prefers v3 over the legacy keys", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ "m:v3": { x: 0, y: 0 } }));
    localStorage.setItem(LEGACY_STORAGE_KEY_V2, JSON.stringify({ "m:v2": { x: 0, y: 0 } }));
    localStorage.setItem(LEGACY_STORAGE_KEY_V1, JSON.stringify({ e1: { x: 0, y: 0 } }));
    expect(Object.keys(loadOverrides())).toEqual(["m:v3"]);
  });
});

describe("finishLegacyMigration", () => {
  it("rewrites parked __legacy__ keys to `${defaultMapId}:${entityId}` and flags migrated", () => {
    const parked: Overrides = { "__legacy__:e1": { x: 5, y: 6 }, "m1:e2": { x: 1, y: 1 } };
    const { overrides, migrated } = finishLegacyMigration(parked, "m1");
    expect(migrated).toBe(true);
    expect(overrides).toEqual({
      [overrideKey("m1", "e1")]: { x: 5, y: 6 },
      "m1:e2": { x: 1, y: 1 },
    });
  });

  it("is a no-op (same reference, migrated=false) when there are no legacy keys", () => {
    const clean: Overrides = { "m1:e1": { x: 1, y: 1 } };
    const res = finishLegacyMigration(clean, "m1");
    expect(res.migrated).toBe(false);
    expect(res.overrides).toBe(clean);
  });

  it("leaves legacy keys untouched when the default map id is null", () => {
    const parked: Overrides = { "__legacy__:e1": { x: 5, y: 6 } };
    const res = finishLegacyMigration(parked, null);
    expect(res.migrated).toBe(false);
    expect(res.overrides).toBe(parked);
  });
});

describe("persistOverrides", () => {
  it("writes the v3 key and round-trips through loadOverrides", () => {
    const data: Overrides = { "m1:e1": { x: 7, y: 8, label: "Inn" } };
    expect(persistOverrides(data)).toBe(true);
    expect(localStorage.getItem(STORAGE_KEY)).toBe(JSON.stringify(data));
    expect(loadOverrides()).toEqual(data);
  });

  it("returns false instead of throwing when localStorage.setItem fails (quota / private-browsing)", () => {
    const setItemSpy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("QuotaExceededError");
    });
    try {
      expect(() => persistOverrides({ "m1:e1": { x: 1, y: 1 } })).not.toThrow();
      expect(persistOverrides({ "m1:e1": { x: 1, y: 1 } })).toBe(false);
    } finally {
      setItemSpy.mockRestore();
    }
  });
});
