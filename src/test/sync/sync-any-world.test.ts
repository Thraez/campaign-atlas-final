/**
 * R-14: Sync targets any world. With several worlds in the DM build, a sync
 * names its world, sees only that world's entities, writes only under
 * `content/<world>/`, and keeps one sync map per world.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AtlasProject, Entity, ImportFolderConfig } from "@/atlas/content/schema";
import {
  commitSync,
  planSync,
  syncWorldFromProject,
  SyncWorldError,
  worldEntities,
} from "@/atlas/sync/sync";
import { HostingPublicError } from "@/atlas/sync/hosting";
import { hashContent } from "@/atlas/save/localFsSave";
import type { SyncSource } from "@/atlas/sync/vaultPort";
import { createMemoryVaultPort } from "../helpers/memoryVaultPort";
import { DEV_ROUTES, handleSaveRequest } from "../../../scripts/vite-plugin-atlas-save";
import { DEV_API_PATHS } from "../../../scripts/atlas/devRoutes";
import { parseSyncArgs, runSyncCli } from "../../../scripts/atlas-sync";

const importConfig: ImportFolderConfig = { folders: { npc: "npcs" }, defaultFolder: "imports" };
const A_CORVEN = "content/a/npcs/corven.md";
const B_CORVEN = "content/b/npcs/corven.md";
const A_TEXT = "---\ntitle: Corven\natlas:\n  id: corven\n  type: npc\n---\nA's Corven.\n";
const B_TEXT = "---\ntitle: Corven\natlas:\n  id: corven\n  type: npc\n---\nB's Corven.\n";
const VAULT_CORVEN =
  "---\ntitle: Corven\natlas:\n  id: corven\n  type: npc\n---\nThe vault's Corven.\n";
const SOURCE: SyncSource = { vaultRoot: "/vault", ignoreGlobs: [], candidateFolders: [] };

function entity(id: string, world: string | undefined, sourcePath: string): Entity {
  return {
    id,
    title: id,
    type: "npc",
    ...(world !== undefined ? { world } : {}),
    visibility: "dm",
    aliases: [],
    tags: [],
    images: [],
    body: "",
    bodyHtml: "",
    frontmatter: {},
    sourcePath,
  } as unknown as Entity;
}

/** A DM build of worlds `a` and `b`, both holding an entity `corven`. */
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

function defaultEntities(): Entity[] {
  return [
    entity("corven", "a", A_CORVEN),
    entity("corven", "b", B_CORVEN),
    entity("mara", "a", "content/a/npcs/mara.md"),
  ];
}

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

  it("holds only the target world's entities: a shared id maps to B's file", () => {
    const w = syncWorldFromProject(twoWorlds(), "b");
    expect(w.worldId).toBe("b");
    expect([...w.existingById]).toEqual([["corven", B_CORVEN]]);
    expect([...(w.entityMeta?.keys() ?? [])]).toEqual(["corven"]);
    expect(w.entityMeta?.get("corven")?.sourcePath).toBe(B_CORVEN);
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
      notes: { "03_Entities/Corven.md": VAULT_CORVEN },
      atlas: { [A_CORVEN]: A_TEXT, [B_CORVEN]: B_TEXT },
      defaultWorld: "a",
    });

  it("a dry run lists only B's rows and writes nothing", async () => {
    const p = port();
    const plan = await planSync(p, syncWorldFromProject(twoWorlds(), "b"), SOURCE, {
      dryRun: true,
    });
    expect(plan.rows.map((r) => [r.rowKind, r.targetPath])).toEqual([["update", B_CORVEN]]);
    expect(plan.rows.every((r) => r.targetPath.startsWith("content/b/"))).toBe(true);
    expect(p.writes).toEqual([]);
  });

  it("updates only B's file and records the note in B's sync map", async () => {
    const p = port();
    const world = syncWorldFromProject(twoWorlds(), "b");
    const plan = await planSync(p, world, SOURCE);
    await commitSync(p, world, plan.rows, plan.source);
    expect(p.atlas.get(B_CORVEN)).toContain("The vault's Corven.");
    expect(p.atlas.get(A_CORVEN)).toBe(A_TEXT);
    expect(p.syncMapOf("b")["03_Entities/Corven.md"]).toMatchObject({ id: "corven" });
    expect(p.syncMapFile.worlds.a).toBeUndefined();
  });

  it("creates under content/b/ when only A has the entity", async () => {
    const p = createMemoryVaultPort({
      notes: { "03_Entities/Mara.md": "---\ntitle: Mara\natlas:\n  type: npc\n---\nA cook.\n" },
      atlas: { [A_CORVEN]: A_TEXT, [B_CORVEN]: B_TEXT, "content/a/npcs/mara.md": "a's mara\n" },
    });
    const world = syncWorldFromProject(twoWorlds(), "b");
    const plan = await planSync(p, world, SOURCE);
    expect(plan.rows.map((r) => [r.rowKind, r.targetPath])).toEqual([
      ["create", "content/b/npcs/mara.md"],
    ]);
    await commitSync(p, world, plan.rows, plan.source);
    expect(p.atlas.get("content/b/npcs/mara.md")).toContain("A cook.");
    expect(p.atlas.get("content/a/npcs/mara.md")).toBe("a's mara\n");
  });

  it("syncs into a world with no entities yet, once the DM build is loaded", async () => {
    const p = createMemoryVaultPort({ notes: { "03_Entities/Corven.md": VAULT_CORVEN } });
    const project = twoWorlds([entity("mara", "a", "content/a/npcs/mara.md")]);
    const plan = await planSync(p, syncWorldFromProject(project, "b"), SOURCE, { dryRun: true });
    expect(plan.rows.map((r) => [r.rowKind, r.targetPath])).toEqual([["create", B_CORVEN]]);
  });

  it("the same vault note synced into A and into B keeps an entry in each", async () => {
    const p = port();
    for (const id of ["a", "b"]) {
      const world = syncWorldFromProject(twoWorlds(), id);
      const plan = await planSync(p, world, SOURCE);
      await commitSync(p, world, plan.rows, plan.source);
    }
    expect(p.syncMapOf("a")["03_Entities/Corven.md"]).toMatchObject({ id: "corven" });
    expect(p.syncMapOf("b")["03_Entities/Corven.md"]).toMatchObject({ id: "corven" });
    // A re-sync into A finds the note as last synced there.
    const again = await planSync(p, syncWorldFromProject(twoWorlds(), "a"), SOURCE, {
      dryRun: true,
    });
    expect(again.rows.map((r) => r.vaultState)).toEqual(["unchanged"]);
  });

  it("an old flat sync map reads as the default world's, not B's", async () => {
    const hash = await hashContent(VAULT_CORVEN);
    const p = createMemoryVaultPort({
      notes: { "03_Entities/Corven.md": VAULT_CORVEN },
      atlas: { [A_CORVEN]: A_TEXT, [B_CORVEN]: B_TEXT },
      syncMap: { "03_Entities/Corven.md": { id: "corven", baseType: "npc", approvedHash: hash } },
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
    const p = port();
    const planA = await planSync(p, syncWorldFromProject(twoWorlds(), "a"), SOURCE);
    await expect(
      commitSync(p, syncWorldFromProject(twoWorlds(), "b"), planA.rows, planA.source),
    ).rejects.toThrow(/outside the world being synced/);
    expect(p.atlas.get(A_CORVEN)).toBe(A_TEXT);
    expect(p.writes).toEqual([]);
  });

  it("R-01 still holds: a real sync into B is refused while hosting is public", async () => {
    const p = createMemoryVaultPort({
      notes: { "03_Entities/Corven.md": VAULT_CORVEN },
      atlas: { [A_CORVEN]: A_TEXT, [B_CORVEN]: B_TEXT },
      hosting: "public",
    });
    const world = syncWorldFromProject(twoWorlds(), "b");
    const plan = await planSync(p, world, SOURCE, { dryRun: true });
    await expect(commitSync(p, world, plan.rows, plan.source)).rejects.toThrow(HostingPublicError);
    expect(p.atlas.get(B_CORVEN)).toBe(B_TEXT);
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
  const getSyncMap = () =>
    DEV_ROUTES.find((r) => r.path === DEV_API_PATHS.localSyncMap && r.method === "GET")!.handle({
      url: new URL(`http://localhost${DEV_API_PATHS.localSyncMap}`),
      body: undefined,
      root: tmp,
    });

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

  it("the R-01 save guard reads every world's ids from a per-world map", async () => {
    write("atlas.config.json", JSON.stringify({ hosting: "public" }));
    write(
      ".local-atlas/sync-map.json",
      JSON.stringify({
        version: 2,
        worlds: { b: { "03_Entities/Corven.md": { id: "corven", baseType: "npc" } } },
      }),
    );
    const file = (p: string, title: string) => ({
      path: p,
      content: `---\ntitle: ${title}\n---\nx\n`,
      kind: "entity-md" as const,
      baseHash: null,
    });
    expect(
      (await handleSaveRequest({ files: [file("content/a/npcs/corven.md", "Corven")] }, tmp))
        .status,
    ).toBe(403);
    expect(
      (await handleSaveRequest({ files: [file("content/a/npcs/other.md", "Other")] }, tmp)).status,
    ).toBe(200);
  });

  describe("npm run atlas:sync with two worlds", () => {
    const vault = () => path.join(tmp, "vault");
    beforeEach(() => {
      write("vault/03_Entities/Corven.md", VAULT_CORVEN);
      write(A_CORVEN, A_TEXT);
      write(B_CORVEN, B_TEXT);
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

    it("--world b writes only B's file and B's sync map, keeping A's old entries", async () => {
      write(
        ".local-atlas/sync-map.json",
        JSON.stringify({ "01_Lore/Old.md": { id: "old", baseType: "lore" } }),
      );
      const out = await runSyncCli(
        parseSyncArgs(["--write", vault(), "--repo", tmp, "--world", "b"]),
      );
      expect(out).toMatch(/into b\./);
      expect(fs.readFileSync(path.join(tmp, B_CORVEN), "utf8")).toContain("The vault's Corven.");
      expect(fs.readFileSync(path.join(tmp, A_CORVEN), "utf8")).toBe(A_TEXT);
      const map = JSON.parse(fs.readFileSync(path.join(tmp, ".local-atlas/sync-map.json"), "utf8"));
      expect(map.version).toBe(2);
      expect(map.worlds.a).toEqual({ "01_Lore/Old.md": { id: "old", baseType: "lore" } });
      expect(map.worlds.b["03_Entities/Corven.md"]).toMatchObject({ id: "corven" });
    });
  });
});
