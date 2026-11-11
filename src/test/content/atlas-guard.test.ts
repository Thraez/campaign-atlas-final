import { describe, it, expect } from "vitest";
import { parseAtlasProject, parseSearchIndex } from "@/atlas/content/atlasGuard";
import { CURRENT_ATLAS_SCHEMA_VERSION, MAX_ATLAS_SCHEMA_VERSION } from "../../../scripts/atlas/schemaVersion";

// The runtime loads atlas.json over the network and used to blind-cast it to
// AtlasProject with zero checks, so a stale/corrupt/wrong file crashed deep
// and confusingly instead of failing at the boundary with an actionable
// message. These pin the guard that now runs on every load.

function validAtlas(overrides: Record<string, unknown> = {}) {
  return {
    version: "2026-01-01T00-00-00-000Z",
    schemaVersion: CURRENT_ATLAS_SCHEMA_VERSION,
    publishedAt: "2026-01-01T00:00:00.000Z",
    worlds: [],
    maps: [],
    entities: [],
    placements: [],
    assets: [],
    ...overrides,
  };
}

describe("parseAtlasProject — validate atlas.json on load", () => {
  it("returns the project unchanged when it is well-formed", () => {
    const atlas = validAtlas();
    expect(parseAtlasProject(atlas)).toBe(atlas);
  });

  it("throws an actionable error when the payload is not an object", () => {
    expect(() => parseAtlasProject(null)).toThrow(/rebuild|not a valid/i);
    // e.g. a server returned an HTML error page instead of JSON
    expect(() => parseAtlasProject("<!doctype html>")).toThrow(/rebuild|not a valid/i);
    expect(() => parseAtlasProject([1, 2, 3])).toThrow(/rebuild|not a valid/i);
  });

  it("throws naming the missing list when the artifact is incomplete", () => {
    const bad = validAtlas();
    delete (bad as Record<string, unknown>).maps;
    expect(() => parseAtlasProject(bad)).toThrow(/maps/i);
    expect(() => parseAtlasProject(bad)).toThrow(/rebuild/i);
  });

  it("rejects an atlas built for a newer schema than this app understands", () => {
    const future = validAtlas({ schemaVersion: MAX_ATLAS_SCHEMA_VERSION + 1 });
    expect(() => parseAtlasProject(future)).toThrow(
      new RegExp(`v${MAX_ATLAS_SCHEMA_VERSION + 1}|newer|update the app`, "i"),
    );
  });

  it("accepts a legacy atlas with no schemaVersion field", () => {
    const legacy = validAtlas();
    delete (legacy as Record<string, unknown>).schemaVersion;
    expect(() => parseAtlasProject(legacy)).not.toThrow();
  });
});

describe("parseSearchIndex — validate search-index.json on load", () => {
  it("returns the list when it is an array", () => {
    const list = [{ id: "a", title: "A", type: "npc", aliases: [], tags: [] }];
    expect(parseSearchIndex(list)).toBe(list);
  });

  it("throws an actionable error when it is not a list", () => {
    expect(() => parseSearchIndex({})).toThrow(/rebuild|not a valid/i);
  });
});

describe("parseAtlasProject: optional schema v2 fields", () => {
  it("accepts schemaVersion 2 (v2 output)", () => {
    expect(() => parseAtlasProject(validAtlas({ schemaVersion: 2 }))).not.toThrow();
  });

  const frame = { x: 1, y: 2, width: 30, height: 40, rotation: 0 };
  const ocean = {
    width: 100,
    height: 80,
    sea: "default",
    onOcean: [{ map: "a", x: 0, y: 0, scale: 1, rotation: 0 }],
  };
  const v2 = (over: Record<string, unknown> = {}, map: Record<string, unknown> = {}) =>
    validAtlas({
      ocean,
      campaign: { id: "main", name: "Main" },
      maps: [{ id: "a" }, { id: "c", parent: "a", frame, enterZoom: 1, ...map }],
      ...over,
    });

  it("passes a well-formed v2 atlas through untouched", () => {
    const atlas = v2();
    const copy = structuredClone(atlas);
    expect(parseAtlasProject(atlas)).toBe(atlas);
    expect(atlas).toEqual(copy);
  });

  it.each([
    ["not an object", 5],
    ["missing sea", { ...ocean, sea: undefined }],
    ["zero width", { ...ocean, width: 0 }],
    ["onOcean not a list", { ...ocean, onOcean: {} }],
  ])("drops a malformed ocean (%s) without throwing", (_n, bad) => {
    expect(parseAtlasProject(v2({ ocean: bad })).ocean).toBeUndefined();
  });

  it("drops only the malformed entries of onOcean", () => {
    const good = ocean.onOcean[0];
    const out = parseAtlasProject(
      v2({ ocean: { ...ocean, onOcean: [good, { map: "b", x: "1", y: 0, scale: 1, rotation: 0 }, { ...good, scale: 0 }] } }),
    );
    expect(out.ocean?.onOcean).toEqual([good]);
  });

  it.each([
    ["not an object", "main"],
    ["no name", { id: "main" }],
    ["id not a string", { id: 3, name: "x" }],
  ])("drops a malformed campaign (%s)", (_n, bad) => {
    expect(parseAtlasProject(v2({ campaign: bad })).campaign).toBeUndefined();
  });

  it.each([[7], [null], [{}]])("drops a malformed parent %j", (bad) => {
    expect(parseAtlasProject(v2({}, { parent: bad })).maps[1].parent).toBeUndefined();
  });

  it.each([
    ["a string", "big"],
    ["missing rotation", { x: 1, y: 2, width: 3, height: 4 }],
    ["zero height", { ...frame, height: 0 }],
    ["NaN x", { ...frame, x: null }],
  ])("drops a malformed frame (%s)", (_n, bad) => {
    expect(parseAtlasProject(v2({}, { frame: bad })).maps[1].frame).toBeUndefined();
  });

  it.each([["1"], [null], [[]]])("drops a malformed enterZoom %j", (bad) => {
    expect(parseAtlasProject(v2({}, { enterZoom: bad })).maps[1].enterZoom).toBeUndefined();
  });
});
