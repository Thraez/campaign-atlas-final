/**
 * code-retro 07: `npm run atlas:sync` over real folders. A dry run writes
 * nothing anywhere; a write then a second run reports nothing left to change.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseSyncArgs, runSyncCli } from "../atlas-sync";
import { createFsVaultPort, DryRunWriteError } from "./fsVaultPort";

const WORLD = "w";
const CORVEN = "---\ntitle: Corven\natlas:\n  type: npc\n---\nA smuggler.\n";
const PLACEHOLDER = "---\ntitle: Placeholder\natlas:\n  id: placeholder\n  type: npc\n---\nOld.\n";

let tmp: string;
let vault: string;
let repo: string;

function write(root: string, rel: string, text: string) {
  const abs = path.join(root, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, text);
}

/** Every file under `root` with its bytes, to prove nothing changed. */
function snapshot(root: string): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, e.name);
      if (e.isDirectory()) walk(abs);
      else out[path.relative(root, abs)] = fs.readFileSync(abs, "utf8");
    }
  };
  walk(root);
  return out;
}

/** The DM build the CLI reads: the entities that exist in `repo/content`. */
function writeDmBuild(entities: Record<string, string>) {
  const project = {
    worlds: [{ id: WORLD, importFolders: { folders: { npc: "npcs" }, defaultFolder: "imports" } }],
    entities: Object.entries(entities).map(([id, sourcePath]) => ({
      id,
      sourcePath,
      type: "npc",
      visibility: "player",
    })),
  };
  write(repo, ".local-atlas/atlas.json", JSON.stringify(project));
}

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "atlas-sync-"));
  vault = path.join(tmp, "vault");
  repo = path.join(tmp, "repo");
  write(vault, "03_Entities/NPCs/Corven.md", CORVEN);
  write(vault, "03_Entities/NPCs/Placeholder.md", "---\ntitle: Placeholder\n---\nNew.\n");
  write(vault, "01_Lore/History.md", "The old war.\n");
  write(vault, "10_DmNotesAndSecrets/Cabal.md", "secret\n");
  write(repo, `content/${WORLD}/npcs/placeholder.md`, PLACEHOLDER);
  writeDmBuild({ placeholder: `content/${WORLD}/npcs/placeholder.md` });
});

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("npm run atlas:sync", () => {
  it("--dry-run prints counts per vault folder and writes nothing", async () => {
    const before = { vault: snapshot(vault), repo: snapshot(repo) };
    const text = await runSyncCli(parseSyncArgs(["--dry-run", vault, "--repo", repo]));
    expect(text).toMatch(/Nothing written/);
    expect(text).toMatch(/01_Lore\s+1\s+0\s+0\s+0/);
    expect(text).toMatch(/03_Entities\s+1\s+1\s+0\s+0/);
    expect(text).toMatch(/total\s+2\s+1\s+0\s+0/);
    expect(text).not.toMatch(/10_Dm/);
    expect({ vault: snapshot(vault), repo: snapshot(repo) }).toEqual(before);
  });

  it("--write, then a second run: nothing left to change, and the vault untouched", async () => {
    const vaultBefore = snapshot(vault);
    const first = await runSyncCli(parseSyncArgs(["--write", vault, "--repo", repo]));
    expect(first).toMatch(/Wrote 3 file/);
    expect(fs.readFileSync(path.join(repo, `content/${WORLD}/npcs/corven.md`), "utf8")).toContain(
      "A smuggler.",
    );

    // As after `npm run atlas:build`: the new notes are entities now.
    writeDmBuild({
      placeholder: `content/${WORLD}/npcs/placeholder.md`,
      corven: `content/${WORLD}/npcs/corven.md`,
      history: `content/${WORLD}/imports/history.md`,
    });
    const second = await runSyncCli(parseSyncArgs(["--write", vault, "--repo", repo]));
    expect(second).toMatch(/total\s+0\s+0\s+3\s+0/);
    expect(second).toMatch(/Nothing to write/);
    expect(snapshot(vault)).toEqual(vaultBefore);
  });

  it("a dry-run port refuses every write", async () => {
    const port = createFsVaultPort({ repoRoot: repo, dryRun: true });
    await expect(port.saveSyncMap({})).rejects.toBeInstanceOf(DryRunWriteError);
    await expect(port.markSynced("now")).rejects.toBeInstanceOf(DryRunWriteError);
    await expect(
      port.writeAtlasFiles([
        { path: `content/${WORLD}/npcs/x.md`, content: "x", kind: "entity-md", baseHash: null },
      ]),
    ).rejects.toBeInstanceOf(DryRunWriteError);
  });

  it("refuses without a DM build", async () => {
    fs.rmSync(path.join(repo, ".local-atlas"), { recursive: true });
    await expect(runSyncCli(parseSyncArgs(["--dry-run", vault, "--repo", repo]))).rejects.toThrow(
      /atlas:build/,
    );
  });

  it("asks for a mode and a vault", () => {
    expect(() => parseSyncArgs([vault])).toThrow(/--dry-run or --write/);
    expect(() => parseSyncArgs(["--dry-run"])).toThrow(/Which vault/);
  });
});
