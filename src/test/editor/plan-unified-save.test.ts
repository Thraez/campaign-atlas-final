/**
 * planUnifiedSave: the editor's whole Save decision as one pure step, tested
 * without mounting AtlasPlacementEditor. The headline rule (eval-12): an
 * uploaded map image whose bytes are gone is a refusal, so Save writes nothing
 * rather than a world.yaml that points at a file that never lands.
 */
import { describe, it, expect, vi } from "vitest";
import { planUnifiedSave, type UnifiedSaveState } from "@/atlas/editor/saveGate";
import type { Entity } from "@/atlas/content/schema";
import type { LocalLayer } from "@/atlas/useMapLayers";

const WORLD_YAML = "content/w/_atlas/world.yaml";

function upload(id: string, dataUrl?: string): LocalLayer {
  return {
    id,
    origin: "upload",
    src: "blob:x",
    targetPath: `public/atlas/assets/maps/${id}.webp`,
    dataUrl,
  } as LocalLayer;
}

function state(over: Partial<UnifiedSaveState> = {}): UnifiedSaveState {
  return {
    allDraftPlacements: [],
    overrides: {},
    activeMapId: "m1",
    foreignMapDrafts: [],
    entitiesById: new Map<string, Entity>(),
    worldYamlDirty: false,
    worldYamlPath: WORLD_YAML,
    worldYamlBaseline: { loading: false, error: null, hash: "sha256:abc" },
    buildWorldYamlContent: () => "maps: []\n",
    localLayers: [],
    ...over,
  };
}

describe("planUnifiedSave", () => {
  it("reports nothing to save when nothing is dirty", async () => {
    const plan = await planUnifiedSave(state());
    expect(plan).toEqual({ kind: "nothing-to-save", message: "No changes to save" });
  });

  it("writes world.yaml with the upload's bytes first when every upload has bytes", async () => {
    const plan = await planUnifiedSave(
      state({ worldYamlDirty: true, localLayers: [upload("a", "data:image/webp;base64,AA")] }),
    );
    expect(plan.kind).toBe("save");
    if (plan.kind !== "save") return;
    expect(plan.changes.map((c) => [c.kind, c.path])).toEqual([
      ["asset-binary", "public/atlas/assets/maps/a.webp"],
      ["world-yaml", WORLD_YAML],
    ]);
    expect(plan.changes[1]).toMatchObject({ content: "maps: []\n", baseHash: "sha256:abc" });
  });

  it("refuses, writing nothing, when an uploaded image has no bytes", async () => {
    const buildWorldYamlContent = vi.fn(() => "maps: []\n");
    const plan = await planUnifiedSave(
      state({
        worldYamlDirty: true,
        buildWorldYamlContent,
        localLayers: [upload("a", "data:image/webp;base64,AA"), upload("b")],
      }),
    );
    expect(plan.kind).toBe("refused");
    if (plan.kind !== "refused") return;
    expect(plan.reason).toMatch(/1 uploaded image has no bytes/);
    expect(plan.detail).toMatch(/b/);
    expect(plan).not.toHaveProperty("changes");
    expect(buildWorldYamlContent).not.toHaveBeenCalled();
  });

  it("refuses before reading any entity file when an upload is missing", async () => {
    const fetchFn = vi.fn();
    const plan = await planUnifiedSave(
      state({
        worldYamlDirty: true,
        localLayers: [upload("b"), upload("c")],
        overrides: { "m1:e1": {} },
        allDraftPlacements: [{ entityId: "e1", mapId: "m1", x: 1, y: 2 }],
        deps: { fetchFn: fetchFn as unknown as typeof fetch },
      }),
    );
    expect(plan.kind).toBe("refused");
    if (plan.kind !== "refused") return;
    expect(plan.reason).toMatch(/2 uploaded images have no bytes/);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("refuses while the world.yaml baseline is loading or failed", async () => {
    const loading = await planUnifiedSave(
      state({
        worldYamlDirty: true,
        worldYamlBaseline: { loading: true, error: null, hash: null },
      }),
    );
    expect(loading).toMatchObject({ kind: "refused", reason: expect.stringMatching(/loading/) });
    const failed = await planUnifiedSave(
      state({
        worldYamlDirty: true,
        worldYamlBaseline: { loading: false, error: "HTTP 500", hash: null },
      }),
    );
    expect(failed).toMatchObject({ kind: "refused", reason: expect.stringMatching(/HTTP 500/) });
  });

  it("refuses when world.yaml content cannot be built", async () => {
    const plan = await planUnifiedSave(
      state({ worldYamlDirty: true, buildWorldYamlContent: () => null }),
    );
    expect(plan).toMatchObject({ kind: "refused", reason: "Cannot build world.yaml content" });
  });

  it("ignores uploads with no bytes when world.yaml is not being written", async () => {
    const plan = await planUnifiedSave(state({ localLayers: [upload("b")] }));
    expect(plan.kind).toBe("nothing-to-save");
  });

  it("reports no canonical changes when world.yaml is dirty but there is no active world", async () => {
    const plan = await planUnifiedSave(state({ worldYamlDirty: true, worldYamlPath: null }));
    expect(plan).toEqual({ kind: "nothing-to-save", message: "No canonical changes to write" });
  });
});
