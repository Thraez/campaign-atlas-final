import { describe, it, expect } from "vitest";
import {
  lookupByPath,
  recordSync,
  type SyncMap,
} from "@/atlas/import/syncMap";

describe("lookupByPath", () => {
  it("returns the entry when the path exists in the map", () => {
    const map: SyncMap = { "notes/corven.md": { id: "corven", baseType: "npc" } };
    expect(lookupByPath(map, "notes/corven.md")).toEqual({ id: "corven", baseType: "npc" });
  });
  it("returns undefined for an absent path", () => {
    const map: SyncMap = { "notes/corven.md": { id: "corven", baseType: "npc" } };
    expect(lookupByPath(map, "notes/other.md")).toBeUndefined();
  });
  it("returns undefined for an empty map", () => {
    expect(lookupByPath({}, "any/path.md")).toBeUndefined();
  });
});

describe("recordSync", () => {
  it("adds a new entry to an empty map", () => {
    const map = recordSync({}, "notes/corven.md", "corven", "npc");
    expect(map).toEqual({ "notes/corven.md": { id: "corven", baseType: "npc" } });
  });
  it("adds an entry alongside existing entries", () => {
    const original: SyncMap = { "notes/a.md": { id: "a", baseType: "faction" } };
    const map = recordSync(original, "notes/b.md", "b", "location");
    expect(map["notes/a.md"]).toEqual({ id: "a", baseType: "faction" });
    expect(map["notes/b.md"]).toEqual({ id: "b", baseType: "location" });
  });
  it("overwrites an existing entry for the same path", () => {
    const original: SyncMap = { "notes/corven.md": { id: "corven", baseType: "npc" } };
    const map = recordSync(original, "notes/corven.md", "corven", "faction");
    expect(map["notes/corven.md"]).toEqual({ id: "corven", baseType: "faction" });
  });
  it("does not mutate the original map (pure)", () => {
    const original: SyncMap = {};
    recordSync(original, "notes/x.md", "x", "npc");
    expect(Object.keys(original)).toHaveLength(0);
  });
});
