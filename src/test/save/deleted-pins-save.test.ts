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
});
