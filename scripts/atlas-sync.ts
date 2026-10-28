/**
 * Sync from Obsidian without the editor.
 *
 *   npm run atlas:sync -- --dry-run <vault>   what a sync would do, per vault folder; writes nothing
 *   npm run atlas:sync -- --write <vault>     sync the notes Staging would tick by default
 *
 * `--write` refuses, listing them, when any note needs review (held in
 * Staging, a path collision, or a write that would show players something the
 * atlas keeps from them). `--skip-held` leaves held notes out and writes the
 * rest; a note that would lower secrecy still refuses the run.
 *
 * Options: --folder <name> (repeatable; the vault folders to read),
 * --ignore <glob> (repeatable), --world <id>, --repo <path> (default: cwd).
 * Folders and globs default to the editor's saved Sync settings.
 *
 * Needs the DM build (`npm run atlas:build`, `.local-atlas/atlas.json`) to
 * tell an update from a create, as the editor does. `--write` does not
 * rebuild: run `npm run atlas:build` afterwards.
 */
import path from "node:path";
import type { AtlasProject } from "../src/atlas/content/schema";
import {
  commitSync,
  planSync,
  syncWorldFromProject,
  unattendedRefusal,
  type FolderCounts,
} from "../src/atlas/sync/sync";
import type { SyncSettings } from "../src/atlas/sync/useSyncSettings";
import type { SyncSource } from "../src/atlas/sync/vaultPort";
import { createFsVaultPort, readLocalAtlasJson } from "./atlas/fsVaultPort";

export interface SyncCliArgs {
  mode: "dry-run" | "write";
  vaultRoot: string;
  repoRoot: string;
  worldId?: string;
  /** `--write` only: leave held notes out instead of refusing the whole run. */
  skipHeld?: boolean;
  folders?: string[];
  ignoreGlobs?: string[];
}

const USAGE =
  "Usage: npm run atlas:sync -- (--dry-run | --write [--skip-held]) <vault> [--folder <name>]... [--ignore <glob>]... [--world <id>] [--repo <path>]";

export function parseSyncArgs(argv: string[]): SyncCliArgs {
  let mode: SyncCliArgs["mode"] | undefined;
  let vaultRoot: string | undefined;
  let repoRoot = process.cwd();
  let worldId: string | undefined;
  let skipHeld = false;
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
    else if (a === "--skip-held") skipHeld = true;
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
    skipHeld,
    folders: folders.length > 0 ? folders : undefined,
    ignoreGlobs: ignoreGlobs.length > 0 ? ignoreGlobs : undefined,
  };
}

export function formatCounts(counts: FolderCounts[]): string {
  const total: FolderCounts = {
    folder: "total",
    create: 0,
    update: 0,
    unchanged: 0,
    held: 0,
    skipped: 0,
  };
  for (const c of counts) {
    total.create += c.create;
    total.update += c.update;
    total.unchanged += c.unchanged;
    total.held += c.held;
    total.skipped += c.skipped;
  }
  const rows = [...counts, total];
  const width = Math.max(6, ...rows.map((r) => r.folder.length));
  const line = (f: string, ...cols: (string | number)[]) =>
    [f.padEnd(width), ...cols.map((c) => String(c).padStart(9))].join("  ");
  return [
    line("folder", "create", "update", "unchanged", "held", "skipped"),
    ...rows.map((r) => line(r.folder, r.create, r.update, r.unchanged, r.held, r.skipped)),
  ].join("\n");
}

/**
 * Runs one sync and returns what to print. Throws on refusal: no DM build,
 * a corrupt `.local-atlas/` file, a scan failure, a conflict, or (with
 * `--write`) any note that needs a person to look at it.
 */
export async function runSyncCli(args: SyncCliArgs): Promise<string> {
  const project = await readLocalAtlasJson<AtlasProject | null>(args.repoRoot, "atlas.json", null);
  if (!project) throw new Error("No DM build in .local-atlas/ — run `npm run atlas:build` first.");
  const saved = await readLocalAtlasJson<SyncSettings>(args.repoRoot, "editor-settings.json", {});
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

  // A note whose vault copy is as last synced writes nothing, so only the
  // rest can need a person.
  const refusals = plan.rows.flatMap((row) => {
    if (row.vaultState === "unchanged") return [];
    const r = unattendedRefusal(row, world);
    return r ? [{ row, ...r }] : [];
  });
  const list = (rs: typeof refusals) =>
    rs.map((r) => `  ${r.row.vaultRelPath ?? r.row.filename}: ${r.reason}`);
  if (dryRun) {
    if (refusals.length > 0) {
      out.push(
        "",
        `${refusals.length} note(s) need review in the editor's Sync:`,
        ...list(refusals),
      );
    }
    return out.join("\n");
  }

  // Unattended, nothing may lower secrecy; held notes stop the run unless
  // the DM said to leave them out (they stay unticked, so nothing writes them).
  const blocking = refusals.filter(
    (r) => !args.skipHeld || r.kind === "lowers-secrecy" || r.row.included,
  );
  if (blocking.length > 0) {
    throw new Error(
      [
        `Refused: ${blocking.length} note(s) need review. Open Sync in the editor` +
          (blocking.every((r) => r.kind === "held") ? ", or rerun with --skip-held." : "."),
        ...list(blocking),
      ].join("\n"),
    );
  }
  if (refusals.length > 0) {
    out.push("", `Left out ${refusals.length} held note(s):`, ...list(refusals));
  }

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
