import { describe, it, expect } from "vitest";
import { parseAtlasProject, parseSearchIndex } from "@/atlas/content/atlasGuard";
import { CURRENT_ATLAS_SCHEMA_VERSION } from "../../../scripts/atlas/schemaVersion";

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
    const future = validAtlas({ schemaVersion: CURRENT_ATLAS_SCHEMA_VERSION + 1 });
    expect(() => parseAtlasProject(future)).toThrow(
      new RegExp(`v${CURRENT_ATLAS_SCHEMA_VERSION + 1}|newer|update the app`, "i"),
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
