/**
 * R-01: while `atlas.config.json` `hosting` is not "private", a real Sync from
 * Obsidian writes nothing (the repo is public; see H-04). Dry runs still work.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { HostingPublicError, parseHosting } from "@/atlas/sync/hosting";
import { commitSync, planSync, type SyncWorld } from "@/atlas/sync/sync";
import type { SyncSource } from "@/atlas/sync/vaultPort";
import { createMemoryVaultPort } from "../helpers/memoryVaultPort";
import { readHosting } from "../../../scripts/atlas/hosting";
import { DEV_ROUTES, handleSaveRequest } from "../../../scripts/vite-plugin-atlas-save";
import { DEV_API_PATHS } from "../../../scripts/atlas/devRoutes";
import { parseSyncArgs, runSyncCli } from "../../../scripts/atlas-sync";

let tmp: string;
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "atlas-hosting-"));
});
afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

function writeConfig(root: string, extra: Record<string, unknown>) {
  fs.writeFileSync(
    path.join(root, "atlas.config.json"),
    JSON.stringify({ contentRoot: "content", ...extra }),
  );
}

describe("hosting in atlas.config.json", () => {
  it('only the exact string "private" is private', () => {
    expect(parseHosting("private")).toBe("private");
    expect(parseHosting("public")).toBe("public");
    for (const v of [undefined, null, "", "Private", " private", "privat", true, 1, {}]) {
      expect(parseHosting(v)).toBe("public");
    }
  });

  it("reads public when the file, the key or a valid value is missing", () => {
    expect(readHosting(tmp)).toBe("public"); // no config at all
    fs.writeFileSync(path.join(tmp, "atlas.config.json"), "{ not json");
    expect(readHosting(tmp)).toBe("public");
    fs.writeFileSync(path.join(tmp, "atlas.config.json"), "[]");
    expect(readHosting(tmp)).toBe("public");
    writeConfig(tmp, {});
    expect(readHosting(tmp)).toBe("public");
    writeConfig(tmp, { hosting: "secret" });
    expect(readHosting(tmp)).toBe("public");
    writeConfig(tmp, { hosting: "private" });
    expect(readHosting(tmp)).toBe("private");
  });

  it("the repo's own config says public", () => {
    expect(readHosting(path.resolve(__dirname, "../../.."))).toBe("public");
  });
});

const WORLD: SyncWorld = {
  worldId: "w",
  importConfig: { folders: { npc: "npcs" }, defaultFolder: "imports" },
  existingById: new Map([["placeholder", "content/w/npcs/placeholder.md"]]),
};
const SOURCE: SyncSource = { vaultRoot: "/vault", ignoreGlobs: [], candidateFolders: [] };
const NOTES = {
  "03_Entities/Corven.md":
    "---\ntitle: Corven\natlas:\n  type: npc\n---\nA smuggler. ![[corven.png]]\n",
};

describe("Sync refuses real writes while hosting is public", () => {
  it("plans (a dry run) but refuses the commit, writing and copying nothing", async () => {
    const port = createMemoryVaultPort({
      notes: NOTES,
      images: ["03_Entities/corven.png"],
      hosting: "public",
    });
    const plan = await planSync(port, WORLD, SOURCE, { dryRun: true });
    expect(plan.rows.some((r) => r.included)).toBe(true);
    await expect(commitSync(port, plan.rows, SOURCE)).rejects.toThrow(HostingPublicError);
    expect(port.copiedImages).toEqual([]);
    expect(port.writes).toEqual([]);
    expect(port.atlas.size).toBe(0);
  });

  it("refuses the write itself when there is no image to copy first", async () => {
    const port = createMemoryVaultPort({
      notes: { "03_Entities/Corven.md": "---\ntitle: Corven\n---\nA smuggler.\n" },
      hosting: "public",
    });
    const plan = await planSync(port, WORLD, SOURCE, { dryRun: true });
    await expect(commitSync(port, plan.rows, SOURCE)).rejects.toThrow(/hosting.*public.*H-04/s);
    expect(port.writes).toEqual([]);
  });

  it("writes when hosting is private", async () => {
    const port = createMemoryVaultPort({
      notes: NOTES,
      images: ["03_Entities/corven.png"],
      hosting: "private",
    });
    const plan = await planSync(port, WORLD, SOURCE);
    const result = await commitSync(port, plan.rows, SOURCE);
    expect(result.saved).toBe(1);
    expect(port.copiedImages).toHaveLength(1);
  });
});

describe("the save endpoint (server side)", () => {
  const files = [
    { path: "content/w/npcs/corven.md", content: "x", kind: "entity-md", baseHash: null },
  ];

  it('refuses an origin "sync" save with 403 and the reason while public', async () => {
    writeConfig(tmp, { hosting: "public" });
    const r = await handleSaveRequest({ files, origin: "sync" }, tmp);
    expect(r.status).toBe(403);
    expect(JSON.stringify(r.payload)).toMatch(/hosting.*public.*H-04/);
    expect(fs.existsSync(path.join(tmp, "content/w/npcs/corven.md"))).toBe(false);
  });

  it("refuses it with no config at all (fail closed)", async () => {
    const r = await handleSaveRequest({ files, origin: "sync" }, tmp);
    expect(r.status).toBe(403);
  });

  it("allows it when private, and never blocks the editor's own saves", async () => {
    writeConfig(tmp, { hosting: "private" });
    expect((await handleSaveRequest({ files, origin: "sync" }, tmp)).status).toBe(200);
    writeConfig(tmp, { hosting: "public" });
    const other = [{ ...files[0], path: "content/w/npcs/other.md" }];
    expect((await handleSaveRequest({ files: other }, tmp)).status).toBe(200);
  });

  it("refuses a marked note while public even with no origin (the server doesn't trust the client)", async () => {
    writeConfig(tmp, { hosting: "public" });
    const marked = [
      {
        ...files[0],
        content: "---\ntitle: Corven\natlas:\n  id: corven\n  source: vault\n---\nA smuggler.\n",
      },
    ];
    const r = await handleSaveRequest({ files: marked }, tmp);
    expect(r.status).toBe(403);
    expect(r.payload).toMatchObject({
      error: "HostingPublic",
      paths: ["content/w/npcs/corven.md"],
    });
    expect(fs.existsSync(path.join(tmp, "content/w/npcs/corven.md"))).toBe(false);
    writeConfig(tmp, { hosting: "private" });
    expect((await handleSaveRequest({ files: marked }, tmp)).status).toBe(200);
  });

  it("refuses, with no origin, a note whose id the sync map names; fails closed on a broken map", async () => {
    writeConfig(tmp, { hosting: "public" });
    fs.mkdirSync(path.join(tmp, ".local-atlas"), { recursive: true });
    const mapFile = path.join(tmp, ".local-atlas", "sync-map.json");
    fs.writeFileSync(
      mapFile,
      JSON.stringify({ "03_Entities/Corven.md": { id: "corven", baseType: "npc" } }),
    );
    const named = [{ ...files[0], content: "---\ntitle: Corven\n---\nA smuggler.\n" }];
    expect((await handleSaveRequest({ files: named }, tmp)).status).toBe(403);
    const unnamed = [
      { ...files[0], path: "content/w/npcs/other.md", content: "---\ntitle: Other\n---\nx\n" },
    ];
    expect((await handleSaveRequest({ files: unnamed }, tmp)).status).toBe(200);
    fs.writeFileSync(mapFile, "{ broken");
    const r = await handleSaveRequest({ files: unnamed }, tmp);
    expect(r.status).toBe(403);
    expect(JSON.stringify(r.payload)).toMatch(/sync-map\.json is not valid JSON/);
  });

  it("refuses a vault image copy while public", async () => {
    writeConfig(tmp, { hosting: "public" });
    const route = DEV_ROUTES.find((r) => r.path === DEV_API_PATHS.vaultImageCopy)!;
    const reply = await route.handle({
      url: new URL("http://localhost/__atlas/vault-image-copy"),
      body: { vaultRoot: tmp, candidateFolders: [], noteRelPath: "a.md", rawSrc: "a.png" },
      root: tmp,
    });
    expect(reply).toMatchObject({ status: 403, json: { ok: false, error: "HostingPublic" } });
  });
});

describe("npm run atlas:sync", () => {
  beforeEach(() => {
    const vault = path.join(tmp, "vault");
    fs.mkdirSync(path.join(vault, "03_Entities"), { recursive: true });
    fs.writeFileSync(path.join(vault, "03_Entities", "Corven.md"), NOTES["03_Entities/Corven.md"]);
    fs.mkdirSync(path.join(tmp, "repo", ".local-atlas"), { recursive: true });
    fs.writeFileSync(
      path.join(tmp, "repo", ".local-atlas", "atlas.json"),
      JSON.stringify({
        worlds: [{ id: "w", importFolders: WORLD.importConfig }],
        entities: [
          { id: "x", sourcePath: "content/w/npcs/x.md", type: "npc", visibility: "player" },
        ],
      }),
    );
    writeConfig(path.join(tmp, "repo"), { hosting: "public" });
  });
  const args = (mode: string) =>
    parseSyncArgs([mode, path.join(tmp, "vault"), "--repo", path.join(tmp, "repo")]);

  it("--write refuses while public and writes nothing", async () => {
    await expect(runSyncCli(args("--write"))).rejects.toThrow(HostingPublicError);
    expect(fs.existsSync(path.join(tmp, "repo", "content"))).toBe(false);
  });

  it("--dry-run still works while public", async () => {
    expect(await runSyncCli(args("--dry-run"))).toMatch(/Nothing written/);
  });
});
