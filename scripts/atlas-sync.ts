/**
 * Sync from Obsidian without the editor.
 *
 *   npm run atlas:sync -- --dry-run <vault>   what a sync would do, per vault folder; writes nothing
 *   npm run atlas:sync -- --write <vault>     sync the notes Staging would tick by default
 *
 * Options: --folder <name> (repeatable; the vault folders to read),
 * --ignore <glob> (repeatable), --world <id>, --repo <path> (default: cwd).
 * Folders and globs default to the editor's saved Sync settings.
 *
 * Needs the DM build (`npm run atlas:build`, `.local-atlas/atlas.json`) to
 * tell an update from a create, as the editor does. `--write` does not
 * rebuild: run `npm run atlas:build` afterwards.
 */
import fs from "node:fs";
import path from "node:path";
import type { AtlasProject } from "../src/atlas/content/schema";
import {
  commitSync,
  planSync,
  syncWorldFromProject,
  type FolderCounts,
} from "../src/atlas/sync/sync";
import type { SyncSource } from "../src/atlas/sync/vaultPort";
import { createFsVaultPort } from "./atlas/fsVaultPort";

export interface SyncCliArgs {
  mode: "dry-run" | "write";
  vaultRoot: string;
  repoRoot: string;
  worldId?: string;
  folders?: string[];
  ignoreGlobs?: string[];
}

const USAGE =
  "Usage: npm run atlas:sync -- (--dry-run | --write) <vault> [--folder <name>]... [--ignore <glob>]... [--world <id>] [--repo <path>]";

export function parseSyncArgs(argv: string[]): SyncCliArgs {
  let mode: SyncCliArgs["mode"] | undefined;
  let vaultRoot: string | undefined;
  let repoRoot = process.cwd();
  let worldId: string | undefined;
  const folders: string[] = [];
  const ignoreGlobs: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const value = () => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`${a} needs a value\n${USAGE}`);
      return v;
    };
    if (a === "--dry-run") mode = "dry-run";
    else if (a === "--write") mode = "write";
    else if (a === "--folder") folders.push(value());
    else if (a === "--ignore") ignoreGlobs.push(value());
    else if (a === "--world") worldId = value();
    else if (a === "--repo") repoRoot = value();
    else if (a.startsWith("--")) throw new Error(`Unknown option ${a}\n${USAGE}`);
    else if (vaultRoot === undefined) vaultRoot = a;
    else throw new Error(`One vault only\n${USAGE}`);
  }
  if (!mode) throw new Error(`Say --dry-run or --write\n${USAGE}`);
  if (!vaultRoot) throw new Error(`Which vault?\n${USAGE}`);
  return {
    mode,
    vaultRoot: path.resolve(vaultRoot),
    repoRoot: path.resolve(repoRoot),
    worldId,
    folders: folders.length > 0 ? folders : undefined,
    ignoreGlobs: ignoreGlobs.length > 0 ? ignoreGlobs : undefined,
  };
}

export function formatCounts(counts: FolderCounts[]): string {
  const total: FolderCounts = { folder: "total", create: 0, update: 0, unchanged: 0, skipped: 0 };
  for (const c of counts) {
    total.create += c.create;
    total.update += c.update;
    total.unchanged += c.unchanged;
    total.skipped += c.skipped;
  }
  const rows = [...counts, total];
  const width = Math.max(6, ...rows.map((r) => r.folder.length));
  const line = (f: string, ...cols: (string | number)[]) =>
    [f.padEnd(width), ...cols.map((c) => String(c).padStart(9))].join("  ");
  return [
    line("folder", "create", "update", "unchanged", "skipped"),
    ...rows.map((r) => line(r.folder, r.create, r.update, r.unchanged, r.skipped)),
  ].join("\n");
}

function readJsonFile<T>(file: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as T;
  } catch {
    return null;
  }
}

/** Runs one sync and returns what to print. Throws on refusal (no DM build, scan failure, conflict). */
export async function runSyncCli(args: SyncCliArgs): Promise<string> {
  const localAtlas = path.join(args.repoRoot, ".local-atlas");
  const project = readJsonFile<AtlasProject>(path.join(localAtlas, "atlas.json"));
  if (!project) throw new Error("No DM build in .local-atlas/ — run `npm run atlas:build` first.");
  const saved =
    readJsonFile<{ candidateFolders?: string[]; ignoreGlobs?: string[] }>(
      path.join(localAtlas, "editor-settings.json"),
    ) ?? {};
  const source: SyncSource = {
    vaultRoot: args.vaultRoot,
    candidateFolders: args.folders ?? saved.candidateFolders ?? [],
    ignoreGlobs: args.ignoreGlobs ?? saved.ignoreGlobs ?? [],
  };
  const dryRun = args.mode === "dry-run";
  const port = createFsVaultPort({ repoRoot: args.repoRoot, dryRun });
  const world = syncWorldFromProject(project, args.worldId);
  const plan = await planSync(port, world, source, { dryRun });

  const scope =
    source.candidateFolders.length > 0 ? source.candidateFolders.join(", ") : "the whole vault";
  const head = dryRun
    ? `Dry run: ${args.vaultRoot} (${scope}) into ${world.worldId}. Nothing written.`
    : `Sync: ${args.vaultRoot} (${scope}) into ${world.worldId}.`;
  const out = [head, "", formatCounts(plan.counts)];
  const held = plan.rows.filter((r) => r.needsReview).length;
  if (held > 0) out.push("", `${held} note(s) held for review: open Sync in the editor.`);
  if (dryRun) return out.join("\n");

  if (!plan.rows.some((r) => r.included)) return [...out, "", "Nothing to write."].join("\n");
  const result = await commitSync(port, plan.rows, source);
  out.push("", `Wrote ${result.saved} file(s). Run \`npm run atlas:build\` to rebuild.`);
  if (result.skippedImages > 0) out.push(`${result.skippedImages} image(s) skipped.`);
  return out.join("\n");
}

function isMainModule(): boolean {
  try {
    return import.meta.url === new URL(`file://${path.resolve(process.argv[1])}`).href;
  } catch {
    return false;
  }
}

if (isMainModule()) {
  try {
    const args = parseSyncArgs(process.argv.slice(2));
    runSyncCli(args)
      .then((text) => console.log(text))
      .catch((e: unknown) => {
        console.error(e instanceof Error ? e.message : e);
        process.exit(1);
      });
  } catch (e) {
    console.error(e instanceof Error ? e.message : e);
    process.exit(2);
  }
}
