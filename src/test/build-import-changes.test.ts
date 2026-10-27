import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildImportChanges, ImportCommitError } from "@/atlas/import/buildImportChanges";
import { parseFrontmatter } from "@/atlas/import/frontmatter";
import {
  buildStagingRows,
  updateStagingRow,
  type StagingRow,
  type StagingContext,
} from "@/atlas/import/stagingState";
import type { ImportFolderConfig, EntityVisibility } from "@/atlas/content/schema";

const WORLD = "astrath-deeprealm";

/** Mirrors content/astrath-deeprealm/_atlas/world.yaml import block. */
const TEST_IMPORT_CONFIG: ImportFolderConfig = {
  folders: {
    npc: "npcs",
    settlement: "settlements",
    ruin: "ruins",
    dungeon: "ruins",
    location: "places",
    map_note: "places",
    faction: "factions",
    event: "events",
    region: "regions",
    item: "items",
  },
  defaultFolder: "imports",
};

const TEST_ALLOWED_FOLDERS: ReadonlySet<string> = new Set([
  ...Object.values(TEST_IMPORT_CONFIG.folders),
  TEST_IMPORT_CONFIG.defaultFolder,
]);

function makeCtx(overrides?: {
  existingById?: ReadonlyMap<string, string>;
  existingPaths?: ReadonlySet<string>;
}): StagingContext {
  return {
    worldId: WORLD,
    importConfig: TEST_IMPORT_CONFIG,
    allowedFolders: TEST_ALLOWED_FOLDERS,
    existingById: overrides?.existingById ?? new Map(),
    existingPaths: overrides?.existingPaths ?? new Set(),
  };
}

function fakeReadFetch(map: Record<string, string>): typeof fetch {
  return (async (url: RequestInfo | URL) => {
    const u = typeof url === "string" ? url : url.toString();
    const m = u.match(/\/__atlas\/read\?path=(.+)$/);
    if (!m) throw new Error(`unexpected url: ${u}`);
    const path = decodeURIComponent(m[1]);
    if (!(path in map)) {
      return new Response("not found", { status: 404 }) as Response;
    }
    return new Response(JSON.stringify({ path, contents: map[path] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }) as Response;
  }) as unknown as typeof fetch;
}

describe("buildImportChanges", () => {
  it("skips uncommittable rows (blocked, excluded, parse-error)", async () => {
    const rows = buildStagingRows(
      [
        { filename: "ok.md", raw: "---\natlas: { type: npc, id: ok }\n---\nbody\n" },
        { filename: "bad.md", raw: "---\n: : not yaml\n---\n" }, // parseError → excluded
        { filename: "skipped.md", raw: "---\natlas: { type: npc, id: skipped }\n---\n" },
      ],
      makeCtx(),
    );
    // DM unchecks the third
    const adjusted: StagingRow[] = [
      rows[0],
      rows[1],
      updateStagingRow(rows[2], { included: false }, makeCtx()),
    ];
    const changes = await buildImportChanges(adjusted, { fetchFn: fakeReadFetch({}) });
    expect(changes).toHaveLength(1);
    expect(changes[0].path).toBe("content/astrath-deeprealm/npcs/ok.md");
    expect(changes[0].kind).toBe("entity-md");
    expect(changes[0].baseHash).toBeNull();
    expect(changes[0].content).toContain("body");
  });

  it("captures baseHash for path-collision rows by reading via /__atlas/read", async () => {
    const existingPaths = new Set(["content/astrath-deeprealm/settlements/thornhold.md"]);
    const ctx = makeCtx({ existingPaths });
    const onDisk = "---\natlas: { type: settlement, id: thornhold }\n---\nold body\n";
    const rows = buildStagingRows(
      [
        {
          filename: "thornhold.md",
          raw: "---\natlas: { type: settlement, id: thornhold }\n---\nnew body\n",
        },
      ],
      ctx,
    );
    // rows[0].rowKind === "path-collision", included === false — DM explicitly opts in.
    const opted = updateStagingRow(rows[0], { included: true }, ctx);
    const changes = await buildImportChanges([opted], {
      fetchFn: fakeReadFetch({
        "content/astrath-deeprealm/settlements/thornhold.md": onDisk,
      }),
    });
    expect(changes).toHaveLength(1);
    expect(changes[0].baseHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(changes[0].content).toContain("new body");
  });

  it("throws ImportCommitError when no rows would be committed", async () => {
    const rows = buildStagingRows(
      [{ filename: "x.md", raw: "---\natlas: { type: npc, id: x }\n---\n" }],
      makeCtx(),
    );
    const off = updateStagingRow(rows[0], { included: false }, makeCtx());
    await expect(buildImportChanges([off], { fetchFn: fakeReadFetch({}) })).rejects.toBeInstanceOf(
      ImportCommitError,
    );
  });

  it("wraps a failed read of a path-collision file into ImportCommitError", async () => {
    const existingPaths = new Set(["content/astrath-deeprealm/npcs/x.md"]);
    const ctx = makeCtx({ existingPaths });
    const rows = buildStagingRows(
      [{ filename: "x.md", raw: "---\natlas: { type: npc, id: x }\n---\n" }],
      ctx,
    );
    const opted = updateStagingRow(rows[0], { included: true }, ctx);
    // fetch map empty → read returns 404.
    const fetchFn = vi.fn(fakeReadFetch({}));
    await expect(buildImportChanges([opted], { fetchFn })).rejects.toBeInstanceOf(
      ImportCommitError,
    );
  });
});

// ── Task 1.4 — update rows merge instead of overwrite ─────────────────────────

describe("buildImportChanges — update rows use mergeImportFrontmatter", () => {
  it("update row keeps placements/visibility from disk, takes prose from vault", async () => {
    const diskRaw = [
      "---",
      "atlas:",
      "  id: corven",
      "  type: npc",
      "  visibility: dm",
      "  placements:",
      "    - mapId: m1",
      "      x: 10",
      "      y: 20",
      "---",
      "OLD PROSE",
    ].join("\n");
    const vaultRaw = ["---", "atlas:", "  summary: updated summary", "---", "NEW PROSE"].join("\n");

    const row = {
      id: "r1",
      filename: "corven.md",
      inferredType: "npc",
      resolvedId: "corven",
      targetPath: "content/w/npcs/corven.md",
      pathAllowed: true,
      rowKind: "update" as const,
      included: true,
      content: vaultRaw,
      rawContent: vaultRaw,
      typeWasExplicit: true,
      typeWasGuessed: false,
      resolvedVisibility: "dm",
    };
    const changes = await buildImportChanges([row as never], {
      fetchFn: fakeReadFetch({ "content/w/npcs/corven.md": diskRaw }),
    });
    expect(changes).toHaveLength(1);
    expect(changes[0].content).toContain("NEW PROSE");
    expect(changes[0].content).not.toContain("OLD PROSE");
    expect(changes[0].content).toContain("placements");
    expect(changes[0].content).toContain("visibility: dm");
    expect(changes[0].baseHash).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  // code-retro 04 replaced "new imports are always dm": commit writes what Staging shows.
  it("create row writes the visibility Staging shows (vault publish: true → player)", async () => {
    const vaultRaw = [
      "---",
      "atlas:",
      "  publish: true",
      "  summary: public note",
      "---",
      "Content",
    ].join("\n");
    const row = {
      id: "r1",
      filename: "newplace.md",
      inferredType: "location",
      resolvedId: "newplace",
      targetPath: "content/w/places/newplace.md",
      pathAllowed: true,
      rowKind: "create" as const,
      included: true,
      content: vaultRaw,
      rawContent: vaultRaw,
      typeWasExplicit: false,
      typeWasGuessed: false,
      resolvedVisibility: "player",
    };
    const [change] = await buildImportChanges([row as never]);
    const atlas = parseFrontmatter(change.content).data.atlas as Record<string, unknown>;
    expect(atlas.visibility).toBe("player");
    expect(change.baseHash).toBeNull();
  });
});

describe("buildImportChanges persists inferred atlas fields", () => {
  it("rewrites frontmatter (not verbatim) for a create row with no atlas.type", async () => {
    const raw = `---\ntags:\n  - npc\n---\n# Corven\n\nbody\n`;
    const row = {
      id: "r1",
      filename: "corven.md",
      inferredType: "npc",
      typeWasExplicit: false,
      resolvedId: "corven",
      resolvedVisibility: "dm",
      rawContent: raw,
      content: raw,
      targetPath: "content/w/npcs/corven.md",
      pathAllowed: true,
      rowKind: "create" as const,
      included: true,
      frontmatterPath: undefined,
    };
    const [change] = await buildImportChanges([row as never]);
    expect(change.content).not.toBe(raw); // not verbatim
    const atlas = parseFrontmatter(change.content).data.atlas as Record<string, unknown>;
    expect(atlas.type).toBe("npc");
    expect(atlas.id).toBe("corven");
    expect(atlas.visibility).toBe("dm");
    expect(parseFrontmatter(change.content).data.tags).toContain("npc");
    expect(change.baseHash).toBeNull(); // create-only
  });
});

// ── N92 branch-coverage gaps ───────────────────────────────────────────────

describe("buildImportChanges — readSourceFile branch coverage (N92)", () => {
  it("throws ImportCommitError on non-404 server error in update row", async () => {
    const raw = "---\natlas:\n  type: npc\n---\nbody\n";
    const row = {
      id: "r1",
      filename: "corven.md",
      inferredType: "npc",
      resolvedId: "corven",
      targetPath: "content/w/npcs/corven.md",
      pathAllowed: true,
      rowKind: "update" as const,
      included: true,
      content: raw,
      rawContent: raw,
      typeWasExplicit: true,
      typeWasGuessed: false,
      resolvedVisibility: "dm",
    };
    const serverErrorFetch: typeof fetch = async () =>
      new Response("internal server error", { status: 500 }) as Response;
    await expect(
      buildImportChanges([row as never], { fetchFn: serverErrorFetch }),
    ).rejects.toBeInstanceOf(ImportCommitError);
  });

  it("throws ImportCommitError when read response body has non-string contents", async () => {
    const raw = "---\natlas:\n  type: settlement\n  id: thornhold\n---\nbody\n";
    const row = {
      id: "r1",
      filename: "thornhold.md",
      inferredType: "settlement",
      resolvedId: "thornhold",
      targetPath: "content/w/settlements/thornhold.md",
      pathAllowed: true,
      rowKind: "path-collision" as const,
      included: true,
      content: raw,
      rawContent: raw,
      typeWasExplicit: false,
      typeWasGuessed: false,
      resolvedVisibility: "dm",
    };
    const malformedFetch: typeof fetch = async () =>
      new Response(JSON.stringify({ path: "content/w/settlements/thornhold.md", contents: 42 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }) as Response;
    await expect(
      buildImportChanges([row as never], { fetchFn: malformedFetch }),
    ).rejects.toBeInstanceOf(ImportCommitError);
  });

  it("needsReview secrecy-increase bypasses the dm default and uses resolvedVisibility", async () => {
    const raw = "---\natlas:\n  summary: public note\n---\nContent\n";
    const row = {
      id: "r1",
      filename: "newplace.md",
      inferredType: "location",
      resolvedId: "newplace",
      targetPath: "content/w/places/newplace.md",
      pathAllowed: true,
      rowKind: "create" as const,
      included: true,
      content: raw,
      rawContent: raw,
      typeWasExplicit: false,
      typeWasGuessed: false,
      resolvedVisibility: "player",
      needsReview: { reason: "secrecy-increase" as const },
    };
    const [change] = await buildImportChanges([row as never]);
    const atlas = parseFrontmatter(change.content).data.atlas as Record<string, unknown>;
    expect(atlas.visibility).toBe("player");
  });
});

describe("Sync keeps a note's title and type (code-retro 02)", () => {
  it("a new note keeps its exact title from the vault filename", async () => {
    const [row] = buildStagingRows(
      [
        {
          filename: "Isle de Marque.md",
          raw: "Fog-bound isle.\n",
          vaultRelPath: "02_Regions/Isle de Marque.md",
        },
      ],
      makeCtx(),
    );
    expect(row.title).toBe("Isle de Marque");
    const [change] = await buildImportChanges([row], { fetchFn: fakeReadFetch({}) });
    expect(change.path).toMatch(/isle-de-marque\.md$/);
    expect(parseFrontmatter(change.content).data.title).toBe("Isle de Marque");
  });

  it("a slug-named note still gets the build's title-cased title", () => {
    const [row] = buildStagingRows([{ filename: "great-hall.md", raw: "Hall.\n" }], makeCtx());
    expect(row.title).toBe("Great Hall");
  });

  it("a frontmatter title wins over the filename", () => {
    const [row] = buildStagingRows(
      [{ filename: "Marque.md", raw: "---\ntitle: Isle de Marque\n---\nIsle.\n" }],
      makeCtx(),
    );
    expect(row.title).toBe("Isle de Marque");
  });

  it("an update keeps the exact title although the vault note has no title field", async () => {
    const path = `content/${WORLD}/regions/isle-de-marque.md`;
    const disk =
      "---\ntitle: Isle de Marque\natlas:\n  id: isle-de-marque\n  type: region\n  visibility: player\n---\nOld.\n";
    const [row] = buildStagingRows(
      [
        {
          filename: "Isle de Marque.md",
          raw: "New prose.\n",
          vaultRelPath: "02_Regions/Isle de Marque.md",
        },
      ],
      makeCtx({
        existingById: new Map([["isle-de-marque", path]]),
        existingPaths: new Set([path]),
      }),
    );
    expect(row.rowKind).toBe("update");
    const [change] = await buildImportChanges([row], { fetchFn: fakeReadFetch({ [path]: disk }) });
    expect(parseFrontmatter(change.content).data.title).toBe("Isle de Marque");
  });

  it("a top-level type: npc stages and lands as npc, whatever its folder", async () => {
    const [row] = buildStagingRows(
      [
        {
          filename: "Varro.md",
          raw: "---\ntype: npc\n---\nA smuggler.\n",
          vaultRelPath: "01_Lore/Varro.md",
        },
      ],
      makeCtx(),
    );
    expect(row.inferredType).toBe("npc");
    expect(row.typeWasExplicit).toBe(true);
    expect(row.targetPath).toBe(`content/${WORLD}/npcs/varro.md`);
    const [change] = await buildImportChanges([row], { fetchFn: fakeReadFetch({}) });
    const atlas = parseFrontmatter(change.content).data.atlas as Record<string, unknown>;
    expect(atlas.type).toBe("npc");
  });

  it("atlas.type still wins over a top-level type", () => {
    const [row] = buildStagingRows(
      [{ filename: "Varro.md", raw: "---\ntype: npc\natlas:\n  type: faction\n---\n" }],
      makeCtx(),
    );
    expect(row.inferredType).toBe("faction");
  });
});

describe("Staging shows the visibility commit writes (code-retro 04)", () => {
  async function stageAndWrite(vaultRelPath: string, raw: string, ctx = makeCtx()) {
    const filename = vaultRelPath.split("/").pop()!;
    const [row] = buildStagingRows([{ filename, raw, vaultRelPath }], ctx);
    const [change] = await buildImportChanges([row], { fetchFn: fakeReadFetch(diskFiles) });
    const atlas = parseFrontmatter(change.content).data.atlas as Record<string, unknown>;
    return { shown: row.resolvedVisibility, written: atlas.visibility };
  }
  let diskFiles: Record<string, string> = {};
  beforeEach(() => {
    diskFiles = {};
  });

  it.each([
    ["01_Lore/The Sundering.md", "player"],
    ["02_Regions/Places/Thornhold.md", "player"],
    ["03_Entities/NPCs/Varro.md", "dm"],
    ["04_Factions/Red Hand.md", "dm"],
  ])("an untagged new note from %s arrives as %s", async (vaultRelPath, expected) => {
    const { shown, written } = await stageAndWrite(vaultRelPath, "Prose.\n");
    expect(shown).toBe(expected);
    expect(written).toBe(expected);
  });

  it("a tag wins over the folder rule", async () => {
    const { shown, written } = await stageAndWrite(
      "03_Entities/NPCs/Varro.md",
      "---\natlas:\n  visibility: player\n---\nPublic smuggler.\n",
    );
    expect(shown).toBe("player");
    expect(written).toBe("player");
  });

  it("a dropped file outside the vault stays dm when untagged", async () => {
    const [row] = buildStagingRows([{ filename: "loose.md", raw: "Loose.\n" }], makeCtx());
    expect(row.resolvedVisibility).toBe("dm");
  });

  const path = `content/${WORLD}/npcs/varro.md`;
  const updateCtx = (visibility: EntityVisibility) => ({
    ...makeCtx({ existingById: new Map([["varro", path]]), existingPaths: new Set([path]) }),
    entityMeta: new Map([["varro", { visibility, type: "npc", sourcePath: path }]]),
  });

  it("an update shows and keeps the atlas's own visibility", async () => {
    diskFiles = {
      [path]: "---\natlas:\n  id: varro\n  type: npc\n  visibility: hidden\n---\nOld.\n",
    };
    const { shown, written } = await stageAndWrite(
      "01_Lore/Varro.md",
      "New prose.\n",
      updateCtx("hidden"),
    );
    expect(shown).toBe("hidden");
    expect(written).toBe("hidden");
  });

  it("approving a secrecy increase writes the vault's visibility", async () => {
    diskFiles = { [path]: "---\natlas:\n  id: varro\n  type: npc\n  visibility: dm\n---\nOld.\n" };
    const [row] = buildStagingRows(
      [
        {
          filename: "Varro.md",
          raw: "---\natlas:\n  visibility: player\n---\nNow public.\n",
          vaultRelPath: "03_Entities/NPCs/Varro.md",
        },
      ],
      updateCtx("dm"),
    );
    expect(row.needsReview?.reason).toBe("secrecy-increase");
    expect(row.included).toBe(false);
    expect(row.resolvedVisibility).toBe("player");
    const approved = updateStagingRow(row, { included: true }, updateCtx("dm"));
    const [change] = await buildImportChanges([approved], { fetchFn: fakeReadFetch(diskFiles) });
    const atlas = parseFrontmatter(change.content).data.atlas as Record<string, unknown>;
    expect(atlas.visibility).toBe("player");
  });
});
