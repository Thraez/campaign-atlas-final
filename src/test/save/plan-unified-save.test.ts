/**
 * planUnifiedSave: the editor's whole Save batch decision, tested without
 * mounting AtlasPlacementEditor. Entity reads go through the injected fetchFn.
 * The headline rule (eval-12): an uploaded map image whose bytes are gone is a
 * refusal, so Save writes nothing rather than a world.yaml that points at a
 * file that never lands.
 */
import { describe, it, expect, vi } from "vitest";
import { planUnifiedSave, type UnifiedSaveState } from "@/atlas/save/planUnifiedSave";
import { uploadsMissingBytes } from "@/atlas/save/buildSaveBatch";
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

type WorldYaml = NonNullable<UnifiedSaveState["worldYaml"]>;

/** A dirty world.yaml for the active world, with overrides. */
function dirtyYaml(over: Partial<WorldYaml> = {}): WorldYaml {
  return {
    path: WORLD_YAML,
    baseline: { loading: false, error: null, hash: "sha256:abc" },
    buildContent: () => "maps: []\n",
    ...over,
  };
}

function state(over: Partial<UnifiedSaveState> = {}): UnifiedSaveState {
  return {
    allDraftPlacements: [],
    overrides: {},
    activeMapId: "m1",
    foreignMapDrafts: [],
    entitiesById: new Map<string, Entity>(),
    worldYaml: null,
    localLayers: [],
    ...over,
  };
}

function reader(contents?: string) {
  return vi.fn(async () => new Response(JSON.stringify({ contents }), { status: 200 }));
}

const plan = (s: UnifiedSaveState, fetchFn = reader()) =>
  planUnifiedSave(s, { fetchFn: fetchFn as unknown as typeof fetch });

const placementEdit: Partial<UnifiedSaveState> = {
  overrides: { "m1:e1": {} },
  allDraftPlacements: [{ entityId: "e1", mapId: "m1", x: 1, y: 2 }],
  entitiesById: new Map([
    ["e1", { id: "e1", title: "Thornhold", sourcePath: "content/w/places/Thornhold.md" } as Entity],
  ]),
};

describe("planUnifiedSave", () => {
  it("reports nothing to save when nothing is dirty", async () => {
    expect(await plan(state())).toEqual({ kind: "nothing-to-save", message: "No changes to save" });
  });

  it("reads entity files through the injected fetchFn", async () => {
    const fetchFn = reader("---\ntitle: Thornhold\n---\nBody\n");
    const result = await plan(state(placementEdit), fetchFn);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(result.kind).toBe("save");
    if (result.kind !== "save") return;
    expect(result.changes.map((c) => [c.kind, c.path])).toEqual([
      ["entity-md", "content/w/places/Thornhold.md"],
    ]);
  });

  it("writes world.yaml with the upload's bytes first when every upload has bytes", async () => {
    const result = await plan(
      state({ worldYaml: dirtyYaml(), localLayers: [upload("a", "data:image/webp;base64,AA")] }),
    );
    expect(result.kind).toBe("save");
    if (result.kind !== "save") return;
    expect(result.changes.map((c) => [c.kind, c.path])).toEqual([
      ["asset-binary", "public/atlas/assets/maps/a.webp"],
      ["world-yaml", WORLD_YAML],
    ]);
    expect(result.changes[1]).toMatchObject({ content: "maps: []\n", baseHash: "sha256:abc" });
  });

  it("refuses, writing nothing, when an uploaded image has no bytes", async () => {
    const buildContent = vi.fn(() => "maps: []\n");
    const result = await plan(
      state({
        worldYaml: dirtyYaml({ buildContent }),
        localLayers: [upload("a", "data:image/webp;base64,AA"), upload("b")],
      }),
    );
    expect(result.kind).toBe("refused");
    if (result.kind !== "refused") return;
    expect(result.reason).toMatch(/1 uploaded image has no bytes/);
    expect(result.detail).toMatch(/b/);
    expect(result).not.toHaveProperty("changes");
    expect(buildContent).not.toHaveBeenCalled();
  });

  it("refuses before reading any entity file when an upload is missing", async () => {
    const fetchFn = reader("---\n---\n");
    const result = await plan(
      state({ ...placementEdit, worldYaml: dirtyYaml(), localLayers: [upload("b"), upload("c")] }),
      fetchFn,
    );
    expect(result.kind).toBe("refused");
    if (result.kind !== "refused") return;
    expect(result.reason).toMatch(/2 uploaded images have no bytes/);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("refuses while the world.yaml baseline is loading or failed", async () => {
    const loading = await plan(
      state({ worldYaml: dirtyYaml({ baseline: { loading: true, error: null, hash: null } }) }),
    );
    expect(loading).toMatchObject({ kind: "refused", reason: expect.stringMatching(/loading/) });
    const failed = await plan(
      state({
        worldYaml: dirtyYaml({ baseline: { loading: false, error: "HTTP 500", hash: null } }),
      }),
    );
    expect(failed).toMatchObject({ kind: "refused", reason: expect.stringMatching(/HTTP 500/) });
  });

  it("refuses when world.yaml content cannot be built", async () => {
    const result = await plan(state({ worldYaml: dirtyYaml({ buildContent: () => null }) }));
    expect(result).toMatchObject({ kind: "refused", reason: "Cannot build world.yaml content" });
  });

  it("ignores uploads with no bytes when world.yaml is not being written", async () => {
    const result = await plan(state({ localLayers: [upload("b")] }));
    expect(result.kind).toBe("nothing-to-save");
  });

  it("says map changes went unsaved when world.yaml is dirty but there is no active world", async () => {
    const result = await plan(
      state({ worldYaml: dirtyYaml({ path: null }), localLayers: [upload("b")] }),
    );
    expect(result).toEqual({
      kind: "nothing-to-save",
      message: "Map changes not saved: no active world to write world.yaml for",
    });
  });
});

describe("uploadsMissingBytes", () => {
  it("lists only upload-origin layers without a dataUrl", () => {
    const url = { id: "u", origin: "url", src: "x" } as LocalLayer;
    const missing = upload("b");
    expect(uploadsMissingBytes([upload("a", "data:,AA"), missing, url])).toEqual([missing]);
  });
});
