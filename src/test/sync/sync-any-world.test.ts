/**
 * R-14: Sync targets any world. With several worlds in the DM build, a sync
 * names its world, matches and updates only that world's entities, writes
 * only under `content/<world>/`, and keeps one sync map per world. Note ids
 * are global across worlds (the build refuses a duplicate), so a vault note
 * whose id lives in another world is held, never created as a second copy.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { renderHook, act } from "@testing-library/react";
import type { AtlasProject, Entity, ImportFolderConfig } from "@/atlas/content/schema";
import {
  commitSync,
  planSync,
  stagingContext,
  syncWorldFromProject,
  SyncWorldError,
  unattendedRefusal,
  worldEntities,
} from "@/atlas/sync/sync";
import { HostingPublicError } from "@/atlas/sync/hosting";
import { ImportCommitError } from "@/atlas/import/buildImportChanges";
import { updateStagingRow, type StagingRow } from "@/atlas/import/stagingState";
import { useMdImportFlow } from "@/atlas/import/useMdImportFlow";
import { hashContent } from "@/atlas/save/localFsSave";
import type { SyncSource } from "@/atlas/sync/vaultPort";
import { createMemoryVaultPort } from "../helpers/memoryVaultPort";
import { DEV_ROUTES, handleSaveRequest } from "../../../scripts/vite-plugin-atlas-save";
import { DEV_API_PATHS } from "../../../scripts/atlas/devRoutes";
import { parseSyncArgs, runSyncCli } from "../../../scripts/atlas-sync";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), warning: vi.fn(), success: vi.fn() } }));

const importConfig: ImportFolderConfig = { folders: { npc: "npcs" }, defaultFolder: "imports" };
/** Corven is a DM-only note of world A. */
const A_CORVEN = "content/a/npcs/corven.md";
/** Sela is a note of world B. */
const B_SELA = "content/b/npcs/sela.md";
/** Where a second Corven would land in B: never written. */
const B_CORVEN = "content/b/npcs/corven.md";
const A_TEXT =
  "---\ntitle: Corven\natlas:\n  id: corven\n  type: npc\n  visibility: dm\n---\nA's Corven.\n";
const B_TEXT = "---\ntitle: Sela\natlas:\n  id: sela\n  type: npc\n---\nB's Sela.\n";
/** The vault says player for Corven: the probe that must never reach world B. */
const VAULT_CORVEN =
  "---\ntitle: Corven\natlas:\n  id: corven\n  type: npc\n  visibility: player\n---\nThe vault's Corven.\n";
/** Corven as A keeps it (DM), so a sync into A updates it without a review. */
const VAULT_CORVEN_DM = VAULT_CORVEN.replace("visibility: player", "visibility: dm");
const VAULT_SELA = "---\ntitle: Sela\natlas:\n  id: sela\n  type: npc\n---\nThe vault's Sela.\n";
const SOURCE: SyncSource = { vaultRoot: "/vault", ignoreGlobs: [], candidateFolders: [] };

function entity(
  id: string,
  world: string | undefined,
  sourcePath: string,
  visibility = "dm",
): Entity {
  return {
    id,
    title: id,
    type: "npc",
    ...(world !== undefined ? { world } : {}),
    visibility,
    aliases: [],
    tags: [],
    images: [],
    body: "",
    bodyHtml: "",
    frontmatter: {},
    sourcePath,
  } as unknown as Entity;
}

function defaultEntities(): Entity[] {
  return [
    entity("corven", "a", A_CORVEN),
    entity("mara", "a", "content/a/npcs/mara.md"),
    entity("sela", "b", B_SELA),
  ];
}

/** A DM build of worlds `a` and `b`; ids are unique across them. */
function twoWorlds(entities: Entity[] = defaultEntities()): AtlasProject {
  return {
    version: "1",
    publishedAt: "",
    worlds: [
      { id: "a", name: "World A", importFolders: importConfig },
      { id: "b", name: "World B", importFolders: importConfig },
    ],
    maps: [],
    entities,
    placements: [],
    assets: [],
  } as unknown as AtlasProject;
}

const rowFor = (rows: StagingRow[], id: string) => rows.find((r) => r.resolvedId === id)!;

describe("syncWorldFromProject picks the world", () => {
  it("with several worlds and none named, refuses and lists the worlds", () => {
    expect(() => syncWorldFromProject(twoWorlds())).toThrow(SyncWorldError);
    expect(() => syncWorldFromProject(twoWorlds())).toThrow(/2 worlds.*Worlds: a, b/);
  });

  it("an unknown world is refused, listing the worlds", () => {
    expect(() => syncWorldFromProject(twoWorlds(), "c")).toThrow(/No world "c".*Worlds: a, b/);
  });

  it("with exactly one world, defaults to it", () => {
    const one = { ...twoWorlds(), worlds: [twoWorlds().worlds[0]] } as AtlasProject;
    expect(syncWorldFromProject(one).worldId).toBe("a");
  });

  it("matches only the target world's entities, and knows which ids other worlds hold", () => {
    const w = syncWorldFromProject(twoWorlds(), "b");
    expect(w.worldId).toBe("b");
    expect([...w.existingById]).toEqual([["sela", B_SELA]]);
    expect([...(w.entityMeta?.keys() ?? [])]).toEqual(["sela"]);
    expect([...(w.idsInOtherWorlds ?? [])]).toEqual([
      ["corven", "a"],
      ["mara", "a"],
    ]);
    expect(w.dmBuildSize).toBe(3);
  });

  it("an entity with no world counts only in a one-world build", () => {
    const legacy = entity("old", undefined, "content/a/npcs/old.md");
    expect(worldEntities(twoWorlds([legacy]), "a").existingById.size).toBe(0);
    const one = { ...twoWorlds([legacy]), worlds: [twoWorlds().worlds[0]] } as AtlasProject;
    expect([...worldEntities(one, "a").existingById.keys()]).toEqual(["old"]);
  });
});

describe("a sync into world B over the memory port", () => {
  const port = () =>
    createMemoryVaultPort({
      notes: { "03_Entities/Corven.md": VAULT_CORVEN, "03_Entities/Sela.md": VAULT_SELA },
      atlas: { [A_CORVEN]: A_TEXT, [B_SELA]: B_TEXT },
      defaultWorld: "a",
    });

  it("a dry run updates B's own note and holds the note whose id lives in A", async () => {
    const p = port();
    const plan = await planSync(p, syncWorldFromProject(twoWorlds(), "b"), SOURCE, {
      dryRun: true,
    });
    expect(plan.rows.every((r) => r.targetPath.startsWith("content/b/"))).toBe(true);
    const sela = rowFor(plan.rows, "sela");
    expect([sela.rowKind, sela.targetPath, sela.included]).toEqual(["update", B_SELA, true]);
    const corven = rowFor(plan.rows, "corven");
    expect(corven.included).toBe(false);
    expect(corven.needsReview).toEqual({ reason: "id-in-other-world", otherWorld: "a" });
    expect(plan.counts[0]).toMatchObject({ update: 1, held: 1, create: 0 });
    expect(p.writes).toEqual([]);
  });

  it("an unattended sync refuses the held note, naming the other world", async () => {
    const world = syncWorldFromProject(twoWorlds(), "b");
    const plan = await planSync(port(), world, SOURCE, { dryRun: true });
    expect(unattendedRefusal(rowFor(plan.rows, "corven"), world)).toEqual({
      kind: "held",
      reason: expect.stringMatching(/"corven" is already a note in world a/),
    });
  });

  it("a commit updates only B's own note; no second Corven is written", async () => {
    const p = port();
    const world = syncWorldFromProject(twoWorlds(), "b");
    const plan = await planSync(p, world, SOURCE);
    await commitSync(p, world, plan.rows, plan.source);
    expect(p.atlas.get(B_SELA)).toContain("The vault's Sela.");
    expect(p.atlas.has(B_CORVEN)).toBe(false);
    expect(p.atlas.get(A_CORVEN)).toBe(A_TEXT);
    expect(Object.keys(p.syncMapOf("b"))).toEqual(["03_Entities/Sela.md"]);
    expect(p.syncMapFile.worlds.a).toBeUndefined();
  });

  it("the held row can't be ticked, and a ticked one can't be committed", async () => {
    const p = port();
    const world = syncWorldFromProject(twoWorlds(), "b");
    const plan = await planSync(p, world, SOURCE);
    const corven = rowFor(plan.rows, "corven");
    expect(updateStagingRow(corven, { included: true }, stagingContext(world)).included).toBe(
      false,
    );
    expect(
      updateStagingRow(corven, { inferredType: "location" }, stagingContext(world)).included,
    ).toBe(false);
    const forced = plan.rows.map((r) => (r === corven ? { ...r, included: true } : r));
    await expect(commitSync(p, world, forced, plan.source)).rejects.toThrow(ImportCommitError);
    await expect(commitSync(p, world, forced, plan.source)).rejects.toThrow(/world a/);
    expect(p.writes).toEqual([]);
  });

  it("creates under content/b/ a note whose id no world has", async () => {
    const p = createMemoryVaultPort({
      notes: { "03_Entities/Ilse.md": "---\ntitle: Ilse\natlas:\n  type: npc\n---\nA cook.\n" },
      atlas: { [A_CORVEN]: A_TEXT, [B_SELA]: B_TEXT },
    });
    const world = syncWorldFromProject(twoWorlds(), "b");
    const plan = await planSync(p, world, SOURCE);
    expect(plan.rows.map((r) => [r.rowKind, r.targetPath, r.included])).toEqual([
      ["create", "content/b/npcs/ilse.md", true],
    ]);
    await commitSync(p, world, plan.rows, plan.source);
    expect(p.atlas.get("content/b/npcs/ilse.md")).toContain("A cook.");
  });

  it("syncs into a world with no entities yet, once the DM build is loaded", async () => {
    const p = createMemoryVaultPort({ notes: { "03_Entities/Sela.md": VAULT_SELA } });
    const project = twoWorlds([entity("mara", "a", "content/a/npcs/mara.md")]);
    const plan = await planSync(p, syncWorldFromProject(project, "b"), SOURCE, { dryRun: true });
    expect(plan.rows.map((r) => [r.rowKind, r.targetPath])).toEqual([["create", B_SELA]]);
  });

  /** Corven as DM-only in the vault too, so A takes it without a review. */
  const dmPort = () =>
    createMemoryVaultPort({
      notes: { "03_Entities/Corven.md": VAULT_CORVEN_DM, "03_Entities/Sela.md": VAULT_SELA },
      atlas: { [A_CORVEN]: A_TEXT, [B_SELA]: B_TEXT },
      defaultWorld: "a",
    });

  it("syncing A then B keeps each world's sync-map entries", async () => {
    const p = dmPort();
    for (const id of ["a", "b"]) {
      const world = syncWorldFromProject(twoWorlds(), id);
      const plan = await planSync(p, world, SOURCE);
      await commitSync(p, world, plan.rows, plan.source);
    }
    expect(Object.keys(p.syncMapOf("a"))).toEqual(["03_Entities/Corven.md"]);
    expect(Object.keys(p.syncMapOf("b"))).toEqual(["03_Entities/Sela.md"]);
    expect(p.atlas.get(A_CORVEN)).toContain("The vault's Corven.");
    const again = await planSync(p, syncWorldFromProject(twoWorlds(), "a"), SOURCE, {
      dryRun: true,
    });
    expect(rowFor(again.rows, "corven").vaultState).toBe("unchanged");
  });

  it("an old flat sync map reads as the default world's, not B's", async () => {
    const hash = await hashContent(VAULT_SELA);
    const p = createMemoryVaultPort({
      notes: { "03_Entities/Sela.md": VAULT_SELA },
      atlas: { [A_CORVEN]: A_TEXT, [B_SELA]: B_TEXT },
      syncMap: { "03_Entities/Sela.md": { id: "sela", baseType: "npc", approvedHash: hash } },
      defaultWorld: "a",
    });
    const inA = await planSync(p, syncWorldFromProject(twoWorlds(), "a"), SOURCE, {
      dryRun: true,
    });
    expect(inA.rows.map((r) => r.vaultState)).toEqual(["unchanged"]);
    const inB = await planSync(p, syncWorldFromProject(twoWorlds(), "b"), SOURCE, {
      dryRun: true,
    });
    expect(inB.rows.map((r) => r.vaultState)).toEqual(["new"]);
  });

  it("refuses rows staged for another world, writing nothing", async () => {
    const p = dmPort();
    const planA = await planSync(p, syncWorldFromProject(twoWorlds(), "a"), SOURCE);
    const aRows = planA.rows.filter((r) => r.resolvedId === "corven");
    await expect(
      commitSync(p, syncWorldFromProject(twoWorlds(), "b"), aRows, planA.source),
    ).rejects.toThrow(/outside the world being synced/);
    expect(p.atlas.get(A_CORVEN)).toBe(A_TEXT);
    expect(p.writes).toEqual([]);
  });

  it("R-01 still holds: a real sync into B is refused while hosting is public", async () => {
    const p = createMemoryVaultPort({
      notes: { "03_Entities/Sela.md": VAULT_SELA },
      atlas: { [A_CORVEN]: A_TEXT, [B_SELA]: B_TEXT },
      hosting: "public",
    });
    const world = syncWorldFromProject(twoWorlds(), "b");
    const plan = await planSync(p, world, SOURCE, { dryRun: true });
    await expect(commitSync(p, world, plan.rows, plan.source)).rejects.toThrow(HostingPublicError);
    expect(p.atlas.get(B_SELA)).toBe(B_TEXT);
  });
});

describe("the editor's drag-and-drop and paste import into world B", () => {
  it("holds a dropped note whose id lives in A, and never writes it", async () => {
    const p = createMemoryVaultPort({ atlas: { [A_CORVEN]: A_TEXT, [B_SELA]: B_TEXT } });
    // The editor builds its import args from the same helper (AtlasPlacementEditor).
    const { existingById, entityMeta, idsInOtherWorlds } = worldEntities(twoWorlds(), "b");
    const { result } = renderHook(() =>
      useMdImportFlow({
        worldId: "b",
        importConfig,
        existingById,
        entityMeta,
        idsInOtherWorlds,
        dmBuildSize: 3,
        onImported: () => {},
        port: p,
      }),
    );
    act(() => {
      result.current.openWithInputs([{ filename: "Corven.md", raw: VAULT_CORVEN }]);
    });
    const [row] = result.current.rows;
    expect([row.included, row.needsReview?.reason]).toEqual([false, "id-in-other-world"]);
    act(() => {
      result.current.patchRow(row.id, { included: true });
    });
    expect(result.current.rows[0].included).toBe(false);
    await act(async () => {
      await result.current.commit();
    });
    expect(p.writes).toEqual([]);
    expect(p.atlas.has(B_CORVEN)).toBe(false);
  });
});

describe("the sync-map file on disk", () => {
  let tmp: string;
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "atlas-r14-"));
  });
  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });
  const write = (rel: string, text: string) => {
    const abs = path.join(tmp, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, text);
  };
  const readMap = () =>
    JSON.parse(fs.readFileSync(path.join(tmp, ".local-atlas/sync-map.json"), "utf8"));
  const route = (p: string, method: string) =>
    DEV_ROUTES.find((r) => r.path === p && r.method === method)!;
  const getSyncMap = () =>
    route(DEV_API_PATHS.localSyncMap, "GET").handle({
      url: new URL(`http://localhost${DEV_API_PATHS.localSyncMap}`),
      body: undefined,
      root: tmp,
    });
  const postWorld = async (body: unknown) =>
    (await route(DEV_API_PATHS.localSyncMapWorld, "POST").handle({
      url: new URL(`http://localhost${DEV_API_PATHS.localSyncMapWorld}`),
      body,
      root: tmp,
    })) as { status: number; json: unknown };

  it("the dev route serves an old flat map as the default world's", async () => {
    write("atlas.config.json", JSON.stringify({ defaultWorld: "a" }));
    write(".local-atlas/sync-map.json", JSON.stringify({ "x.md": { id: "x", baseType: "npc" } }));
    expect(await getSyncMap()).toEqual({
      status: 200,
      json: { version: 2, worlds: { a: { "x.md": { id: "x", baseType: "npc" } } } },
    });
  });

  it("the dev route serves no map as empty, and a broken one as an error", async () => {
    expect(await getSyncMap()).toEqual({ status: 200, json: { version: 2, worlds: {} } });
    write(".local-atlas/sync-map.json", "{ broken");
    expect(await getSyncMap()).toMatchObject({ status: 500 });
  });

  it("two concurrent saves for different worlds both land", async () => {
    write(
      ".local-atlas/sync-map.json",
      JSON.stringify({ version: 2, worlds: { c: { "C.md": { id: "c", baseType: "npc" } } } }),
    );
    const results = await Promise.all([
      postWorld({ worldId: "a", map: { "A.md": { id: "x", baseType: "npc" } } }),
      postWorld({ worldId: "b", map: { "B.md": { id: "y", baseType: "npc" } } }),
    ]);
    expect(results.map((r) => r.status)).toEqual([200, 200]);
    expect(Object.keys(readMap().worlds).sort()).toEqual(["a", "b", "c"]);
    expect(fs.existsSync(path.join(tmp, ".local-atlas/sync-map.json.lock"))).toBe(false);
  });

  it("the merge route keeps unknown top-level fields and refuses a bad body", async () => {
    write(".local-atlas/sync-map.json", JSON.stringify({ version: 2, worlds: {}, note: "keep" }));
    await postWorld({ worldId: "a", map: {} });
    expect(readMap()).toEqual({ version: 2, worlds: { a: {} }, note: "keep" });
    expect((await postWorld({ worldId: "", map: {} })).status).toBe(400);
    expect((await postWorld({ worldId: "a", map: [] })).status).toBe(400);
    expect((await postWorld({ worldId: "__proto__", map: {} })).status).toBe(500);
  });

  describe("the R-01 save guard while public", () => {
    const file = (p: string, title: string) => ({
      path: p,
      content: `---\ntitle: ${title}\n---\nx\n`,
      kind: "entity-md" as const,
      baseHash: null,
    });
    const save = async (p: string, title: string) =>
      (await handleSaveRequest({ files: [file(p, title)] }, tmp)).status;
    beforeEach(() => write("atlas.config.json", JSON.stringify({ hosting: "public" })));

    it("reads every world's ids from a per-world map", async () => {
      write(
        ".local-atlas/sync-map.json",
        JSON.stringify({
          version: 2,
          worlds: { b: { "03_Entities/Corven.md": { id: "corven", baseType: "npc" } } },
        }),
      );
      expect(await save("content/a/npcs/corven.md", "Corven")).toBe(403);
      expect(await save("content/a/npcs/other.md", "Other")).toBe(200);
    });

    it.each([
      ["an unknown version", { version: 3, worlds: {} }],
      ["worlds as a list", { version: 2, worlds: [{ "x.md": { id: "corven" } }] }],
      ["a reserved world id", '{"version":2,"worlds":{"__proto__":{}}}'],
    ])("refuses every note save on a map Sync can't read: %s", async (_label, map) => {
      write(".local-atlas/sync-map.json", typeof map === "string" ? map : JSON.stringify(map));
      expect(await save("content/a/npcs/other.md", "Other")).toBe(403);
    });
  });

  describe("npm run atlas:sync with two worlds", () => {
    const vault = () => path.join(tmp, "vault");
    beforeEach(() => {
      write("vault/03_Entities/Corven.md", VAULT_CORVEN);
      write("vault/03_Entities/Sela.md", VAULT_SELA);
      write(A_CORVEN, A_TEXT);
      write(B_SELA, B_TEXT);
      write(
        "atlas.config.json",
        JSON.stringify({ contentRoot: "content", defaultWorld: "a", hosting: "private" }),
      );
      write(".local-atlas/atlas.json", JSON.stringify(twoWorlds()));
    });

    it("without --world, refuses and lists the worlds", async () => {
      await expect(
        runSyncCli(parseSyncArgs(["--dry-run", vault(), "--repo", tmp])),
      ).rejects.toThrow(/Worlds: a, b/);
    });

    it("--world b refuses while a note's id lives in world a", async () => {
      await expect(
        runSyncCli(parseSyncArgs(["--write", vault(), "--repo", tmp, "--world", "b"])),
      ).rejects.toThrow(/"corven" is already a note in world a/);
      expect(fs.existsSync(path.join(tmp, B_CORVEN))).toBe(false);
      expect(fs.readFileSync(path.join(tmp, B_SELA), "utf8")).toBe(B_TEXT);
    });

    it("--world b --skip-held writes only B's note and B's map, keeping A's old entries", async () => {
      write(
        ".local-atlas/sync-map.json",
        JSON.stringify({ "01_Lore/Old.md": { id: "old", baseType: "lore" } }),
      );
      const out = await runSyncCli(
        parseSyncArgs(["--write", "--skip-held", vault(), "--repo", tmp, "--world", "b"]),
      );
      expect(out).toMatch(/into b\./);
      expect(fs.readFileSync(path.join(tmp, B_SELA), "utf8")).toContain("The vault's Sela.");
      expect(fs.existsSync(path.join(tmp, B_CORVEN))).toBe(false);
      expect(fs.readFileSync(path.join(tmp, A_CORVEN), "utf8")).toBe(A_TEXT);
      const map = readMap();
      expect(map.version).toBe(2);
      expect(map.worlds.a).toEqual({ "01_Lore/Old.md": { id: "old", baseType: "lore" } });
      expect(Object.keys(map.worlds.b)).toEqual(["03_Entities/Sela.md"]);
    });
  });
});
