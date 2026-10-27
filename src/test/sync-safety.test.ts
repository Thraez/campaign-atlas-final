/**
 * Sync from Obsidian, end to end without a browser (eval-2026-10/04).
 *
 * Drives the real seams in the order the editor runs them:
 *   handleVaultScanRequest (GET /__atlas/vault-scan)
 *   → vaultScanResultToInputs → buildStagingRows (Staging)
 *   → buildImportChanges (what the Save endpoint would write under content/)
 *   → scripts/build-atlas.ts --player (atlas.json, search-index.json).
 *
 * docs/GOALS.md: the vault folders that sync are 01_Lore, 02_Regions,
 * 03_Entities and 04_Factions; 10_DmNotesAndSecrets, 00_SessionNotes,
 * 11_DmToolBox, templates, inbox and archive stay out.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { handleVaultScanRequest } from "../../scripts/vite-plugin-atlas-save";
import { readVaultScanReply, vaultScanResultToInputs } from "@/atlas/import/useMdImportFlow";
import { buildStagingRows, type StagingContext } from "@/atlas/import/stagingState";
import { buildImportChanges } from "@/atlas/import/buildImportChanges";
import type { FileChange } from "@/atlas/save/localFsSave";
import type { ImportFolderConfig } from "@/atlas/content/schema";

const ROOT = path.resolve(__dirname, "../..");
const BUILD_SCRIPT = path.resolve(ROOT, "scripts/build-atlas.ts");
const IS_WIN = process.platform === "win32";
const WORLD = "test-world";

/** The folders docs/GOALS.md says Sync draws from. */
const SYNC_FOLDERS = ["01_Lore", "02_Regions", "03_Entities", "04_Factions"];

const SECRET = "CABAL_SECRET_MARKER_7f3a";

/** The real vault's top level (~/Documents/DnD-Campaign-Repository/Vault-DnD). */
const VAULT_NOTES: Record<string, string> = {
  "01_Lore/The Sundering.md": "The old war.\n",
  "03_Entities/NPCs/Corven.md": "---\ntags: [npc]\n---\nA smuggler.\n",
  "04_Factions/Red Hand.md": "A guild.\n",
  "10_DmNotesAndSecrets/The Cabal.md": `---\ntags: [faction]\n---\n${SECRET} runs the city.\n`,
  "00_SessionNotes/Session 1.md": "SESSION_NOTES_MARKER what happened.\n",
  "11_DmToolBox/Random Encounters.md": "DM_TOOLBOX_MARKER roll a d20.\n",
  "99_Templates/NPC Template.md": "TEMPLATE_MARKER fill me in.\n",
  "90_Inbox/Loose Idea.md": "INBOX_MARKER an idea.\n",
  "Z_Archive/Old Draft.md": "ARCHIVE_MARKER old.\n",
};

const IMPORT_CONFIG: ImportFolderConfig = {
  folders: { npc: "npcs", faction: "factions" },
  defaultFolder: "imports",
};

let tmpRoot: string;
let vaultRoot: string;

beforeAll(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sync-safety-"));
  vaultRoot = path.join(tmpRoot, "vault");
  for (const [rel, raw] of Object.entries(VAULT_NOTES)) {
    const abs = path.join(vaultRoot, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, raw);
  }
});
afterAll(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

interface SyncRun {
  scanned: string[];
  changes: FileChange[];
}

const stagingCtx = (): StagingContext => ({
  worldId: WORLD,
  importConfig: IMPORT_CONFIG,
  allowedFolders: new Set([...Object.values(IMPORT_CONFIG.folders), IMPORT_CONFIG.defaultFolder]),
  existingById: new Map(),
  existingPaths: new Set(),
});

/**
 * Scan → the route's reply as the client reads it → Staging → the changes
 * Save would write. Nothing exists in the atlas yet. The reply is built the
 * way the `/__atlas/vault-scan` route sends it (200, `{ files }`).
 */
async function runSync(candidateFolders: string[]): Promise<SyncRun> {
  const scan = await handleVaultScanRequest(vaultRoot, [], candidateFolders);
  if (!scan.ok) throw new Error(`scan failed: ${scan.error}`);
  const reply = await readVaultScanReply(
    new Response(JSON.stringify({ files: scan.files }), { status: 200 }),
  );
  if (!reply.ok) throw new Error(`client refused the scan: ${reply.error}`);
  const rows = buildStagingRows(vaultScanResultToInputs(reply.files), stagingCtx());
  const changes = await buildImportChanges(rows);
  return { scanned: Object.keys(reply.files), changes };
}

function leakedFrom(run: SyncRun, folder: string): string[] {
  const marker = VAULT_NOTES[Object.keys(VAULT_NOTES).find((p) => p.startsWith(`${folder}/`))!];
  return [
    ...run.scanned.filter((p) => p.startsWith(`${folder}/`)),
    ...run.changes.filter((c) => c.content.includes(marker.trim())).map((c) => c.path),
  ];
}

/** Write the changes into a fresh repo-shaped dir and run the strict player build. */
function buildPlayer(dir: string, changes: FileChange[]): string {
  fs.mkdirSync(path.join(dir, `content/${WORLD}`), { recursive: true });
  fs.writeFileSync(
    path.join(dir, "atlas.config.json"),
    JSON.stringify({
      contentRoot: "content",
      outputDir: "out",
      defaultWorld: WORLD,
      include: ["**/*.md"],
      exclude: [],
    }),
  );
  for (const c of changes) {
    const abs = path.join(dir, c.path);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, c.content);
  }
  const out = path.join(dir, "out");
  execFileSync(
    IS_WIN ? "npx.cmd" : "npx",
    [
      "tsx",
      BUILD_SCRIPT,
      "--player",
      "--strict",
      "--config",
      path.join(dir, "atlas.config.json"),
      "--out",
      out,
    ],
    {
      cwd: ROOT,
      stdio: ["ignore", "pipe", "pipe"],
      shell: IS_WIN,
      env: { ...process.env, ATLAS_ACK_DM_IN_SOURCE: "true" },
    },
  );
  return out;
}

function walkFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const abs = path.join(dir, e.name);
    return e.isDirectory() ? walkFiles(abs) : [abs];
  });
}

describe("Sync from Obsidian with the GOALS folders picked", () => {
  it("never scans, stages or writes a 10_DmNotesAndSecrets note", async () => {
    const run = await runSync(SYNC_FOLDERS);
    expect(leakedFrom(run, "10_DmNotesAndSecrets")).toEqual([]);
    expect(run.changes.some((c) => c.content.includes(SECRET))).toBe(false);
    // The synced folders did come through, so the scan is not vacuously empty.
    expect(run.scanned).toContain("04_Factions/Red Hand.md");
  });

  it.each(["00_SessionNotes", "11_DmToolBox", "99_Templates", "90_Inbox", "Z_Archive"])(
    "leaves out %s",
    async (folder) => {
      const run = await runSync(SYNC_FOLDERS);
      expect(leakedFrom(run, folder)).toEqual([]);
    },
  );
});

describe("Sync from Obsidian with no folders picked (the default)", () => {
  it.each(["99_Templates", "90_Inbox", "Z_Archive"])(
    "leaves out %s through the built-in ignore list",
    async (folder) => {
      const run = await runSync([]);
      expect(leakedFrom(run, folder)).toEqual([]);
    },
  );

  // eval-2026-10/13: these were only kept out by the DM's folder pick; with
  // nothing ticked the scan read the whole vault. IGNORED_FOLDERS names them now.
  it.each(["10_DmNotesAndSecrets", "00_SessionNotes", "11_DmToolBox"])(
    "leaves out %s",
    async (folder) => {
      const run = await runSync([]);
      expect(leakedFrom(run, folder)).toEqual([]);
    },
  );

  it("a 10_DmNotesAndSecrets note forced through Staging arrives as dm and never reaches the player build", async () => {
    // Backstop behind the ignore list: hand the note to Staging as if a scan
    // had returned it, and check the visibility rule and the build still hold.
    const cabalPath = "10_DmNotesAndSecrets/The Cabal.md";
    const forced = await buildImportChanges(
      buildStagingRows(
        vaultScanResultToInputs({ [cabalPath]: VAULT_NOTES[cabalPath] }),
        stagingCtx(),
      ),
    );
    const cabal = forced.find((c) => c.content.includes(SECRET));
    expect(cabal).toBeDefined();
    expect(cabal!.content).toMatch(/visibility:\s*dm\b/);

    const run = await runSync([]);
    run.changes.push(...forced);
    const out = buildPlayer(path.join(tmpRoot, "repo-default"), run.changes);
    const atlas = fs.readFileSync(path.join(out, "atlas.json"), "utf8");
    const searchIndex = fs.readFileSync(path.join(out, "search-index.json"), "utf8");
    expect(atlas).not.toContain(SECRET);
    expect(searchIndex).not.toContain(SECRET);
    expect(atlas).not.toMatch(/the-cabal/i);
    // Every file the player build emits (the shipped assets included).
    for (const f of walkFiles(out)) {
      expect(fs.readFileSync(f, "utf8"), f).not.toContain(SECRET);
    }
    // The build did ship the player notes, so the scan above is not vacuous.
    expect(atlas).toContain("the-sundering");
  });
});
