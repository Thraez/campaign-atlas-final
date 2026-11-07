/**
 * eval-45: a pin deleted in the editor is a `null` override keyed
 * `${mapId}:${entityId}`. Save must write that deletion into the entity's
 * frontmatter, whether the pin was deleted on the active map or on another
 * one, and the override must count as unsaved until then.
 */
import { describe, it, expect, vi } from "vitest";
import { planUnifiedSave, type UnifiedSaveState } from "@/atlas/save/planUnifiedSave";
import { foreignMapDraftPlacements, overridesAfterSave } from "@/atlas/editor/foreignMapDrafts";
import { mergePlacementsIntoFrontmatter } from "@/atlas/save/canonicalPlacementSave";
import { dropStaleTombstones } from "@/atlas/editor/placementOverrides";
import { parseFrontmatter } from "@/atlas/import/frontmatter";
import type { Entity } from "@/atlas/content/schema";

const SOURCE = "content/w/places/Thornhold.md";
const RAW = [
  "---",
  "title: Thornhold",
  "atlas:",
  "  placements:",
  "    - mapId: m1",
  "      x: 1",
  "      y: 2",
  "    - mapId: m2",
  "      x: 3",
  "      y: 4",
  "---",
  "Body.",
  "",
].join("\n");

const entities = [{ id: "e1", title: "Thornhold", sourcePath: SOURCE } as Entity];

function state(over: Partial<UnifiedSaveState>): UnifiedSaveState {
  return {
    allDraftPlacements: [],
    overrides: {},
    activeMapId: "m1",
    foreignMapDrafts: [],
    entitiesById: new Map(entities.map((e) => [e.id, e])),
    canonPlacements: [
      { entityId: "e1", mapId: "m1" },
      { entityId: "e1", mapId: "m2" },
    ],
    primaryMapId: "m1",
    worldYaml: null,
    localLayers: [],
    ...over,
  };
}

const reader = () =>
  vi.fn(
    async () => new Response(JSON.stringify({ contents: RAW }), { status: 200 }),
  ) as unknown as typeof fetch;

function placementMapIds(content: string): string[] {
  const data = parseFrontmatter(content).data as {
    atlas: { placements: Array<{ mapId: string }> };
  };
  return data.atlas.placements.map((p) => p.mapId);
}

describe("deleted pins save (eval-45)", () => {
  it("a removal drops that map's placement and keeps the others", () => {
    const data = parseFrontmatter(RAW).data;
    const next = mergePlacementsIntoFrontmatter(data, [
      { entityId: "e1", mapId: "m2", removed: true },
    ]) as { atlas: { placements: Array<{ mapId: string }> } };
    expect(next.atlas.placements.map((p) => p.mapId)).toEqual(["m1"]);
  });

  it("a pin deleted on the active map is written by Save", async () => {
    const plan = await planUnifiedSave(state({ overrides: { "m1:e1": null } }), {
      fetchFn: reader(),
    });
    expect(plan.kind).toBe("save");
    if (plan.kind !== "save") return;
    expect(plan.changes).toHaveLength(1);
    expect(plan.changes[0].path).toBe(SOURCE);
    expect(placementMapIds(plan.changes[0].content)).toEqual(["m2"]);
  });

  it("a pin deleted on another map counts as a foreign draft and is written by Save", async () => {
    const overrides = { "m2:e1": null };
    const foreign = foreignMapDraftPlacements(overrides, "m1", ["m1", "m2"], entities);
    expect(foreign).toEqual([{ entityId: "e1", mapId: "m2", removed: true }]);

    const plan = await planUnifiedSave(state({ overrides, foreignMapDrafts: foreign }), {
      fetchFn: reader(),
    });
    expect(plan.kind).toBe("save");
    if (plan.kind !== "save") return;
    expect(placementMapIds(plan.changes[0].content)).toEqual(["m1"]);
  });

  it("after the save, the foreign deletion's override is cleared", () => {
    const overrides = { "m2:e1": null };
    const foreign = foreignMapDraftPlacements(overrides, "m1", ["m1", "m2"], entities);
    const next = overridesAfterSave(overrides, {
      activeMapId: "m1",
      writtenEntityIds: new Set(["e1"]),
      foreignMapDrafts: foreign,
    });
    expect(next).toEqual({});
  });

  it("after the save, an active-map deletion's override is cleared", () => {
    const next = overridesAfterSave(
      { "m1:e1": null },
      { activeMapId: "m1", writtenEntityIds: new Set(["e1"]), foreignMapDrafts: [] },
    );
    expect(next).toEqual({});
  });

  it("a removal on a legacy x/y entity keeps its primary-map position", () => {
    const data = { title: "Old", atlas: { x: 7, y: 8 } };
    const next = mergePlacementsIntoFrontmatter(
      data,
      [{ entityId: "e1", mapId: "m2", removed: true }],
      "m1",
    ) as { atlas: Record<string, unknown> };
    expect(next.atlas.placements).toEqual([{ mapId: "m1", x: 7, y: 8 }]);
    expect(next.atlas.x).toBeUndefined();
  });

  it("an edit on another map converts legacy x/y to a primary-map placement", () => {
    const data = { atlas: { x: 7, y: 8 } };
    const next = mergePlacementsIntoFrontmatter(
      data,
      [{ entityId: "e1", mapId: "m2", x: 1, y: 1 }],
      "m1",
    ) as { atlas: { placements: Array<{ mapId: string }> } };
    expect(next.atlas.placements.map((p) => p.mapId)).toEqual(["m1", "m2"]);
  });
});

describe("placements[] entry with no mapId (eval-45 review)", () => {
  it("is kept as the primary-map pin when another map changes", () => {
    const data = { atlas: { placements: [{ x: 5, y: 5 }] } };
    const next = mergePlacementsIntoFrontmatter(
      data,
      [{ entityId: "e1", mapId: "m2", removed: true }],
      "m1",
    ) as { atlas: { placements: unknown[] } };
    expect(next.atlas.placements).toEqual([{ x: 5, y: 5, mapId: "m1" }]);
  });
});

describe("stale tombstones (eval-45 review)", () => {
  // Before eval-45, removeCoord wrote `null` even for a pin canon never had,
  // so localStorage can hold tombstones with nothing to delete.
  it("dropStaleTombstones keeps real deletions and edits, drops the rest", () => {
    const canon = [{ entityId: "e1", mapId: "m1" }];
    expect(
      dropStaleTombstones(
        { "m1:e1": null, "m2:e1": null, "m1:ghost": null, "m2:e2": { x: 1, y: 1 } },
        canon,
      ),
    ).toEqual({ "m1:e1": null, "m2:e2": { x: 1, y: 1 } });
  });

  it("dropStaleTombstones returns the same object when nothing is stale", () => {
    const o = { "m1:e1": null };
    expect(dropStaleTombstones(o, [{ entityId: "e1", mapId: "m1" }])).toBe(o);
  });

  it("Save writes nothing for a stale tombstone on the active map", async () => {
    const fetchFn = reader();
    const plan = await planUnifiedSave(
      state({ overrides: { "m1:e1": null }, canonPlacements: [{ entityId: "e1", mapId: "m2" }] }),
      { fetchFn },
    );
    expect(plan.kind).toBe("nothing-to-save");
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("Save skips a stale foreign tombstone for an entity no longer in the project", async () => {
    const overrides = { "m2:ghost": null };
    const foreign = foreignMapDraftPlacements(overrides, "m1", ["m1", "m2"], entities);
    const plan = await planUnifiedSave(state({ overrides, foreignMapDrafts: foreign }), {
      fetchFn: reader(),
    });
    expect(plan.kind).toBe("nothing-to-save");
  });
});
