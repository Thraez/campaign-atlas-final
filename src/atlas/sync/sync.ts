/**
 * Sync from Obsidian as one module: `planSync` reads the vault and decides
 * what each note would do (Staging's rows), `commitSync` writes the rows the
 * DM kept. Both talk to the world only through a `VaultPort` (`./vaultPort.ts`),
 * so the editor, the tests and `npm run atlas:sync` run the same steps.
 *
 * planSync, in order:
 *   1. refuses without the DM build (`DmBuildRequiredError`);
 *   2. scans the vault (`VaultScanError` from the port);
 *   3. classifies each note against the sync map: a note with no entry at its
 *      path whose bytes match an entry elsewhere has moved, so it counts as
 *      unchanged and, unless `dryRun`, its entry is re-keyed and saved (a copy,
 *      whose original is still in the vault, moves nothing);
 *   4. builds Staging rows (`stagingState.ts`), with the sync map for identity;
 *   5. holds a changed update for review when the atlas copy differs from what
 *      the last sync wrote (the DM edited it in the editor).
 * A dry run reads only.
 *
 * commitSync, in order:
 *   1. builds the file changes and checks every create target is still free,
 *      so a commit the save will refuse copies no image (`ConflictError`);
 *   2. copies embedded images and rewrites the embeds (a refused one is
 *      dropped and counted in `skippedImages`);
 *   3. writes the files;
 *   4. records every written vault note in the sync map, whether or not the
 *      rebuild worked, and stamps the sync time.
 * Errors: `ImportCommitError` (nothing to commit, unreadable atlas file),
 * `ConflictError`, and whatever the port's write throws (`SaveBusyError`).
 */
import type { AtlasProject, EntityVisibility, ImportFolderConfig } from "@/atlas/content/schema";
import { buildImportChanges, ImportCommitError } from "@/atlas/import/buildImportChanges";
import { rewriteEmbeds } from "@/atlas/import/resolveVaultImage";
import {
  buildStagingRows,
  type RawImportFile,
  type StagingContext,
  type StagingRow,
} from "@/atlas/import/stagingState";
import {
  classifyVaultNote,
  findPathByApprovedHash,
  hasLocalEdits,
  moveSyncEntry,
  recordSync,
  type SyncMap,
} from "@/atlas/import/syncMap";
import { ConflictError, hashContent } from "@/atlas/save/localFsSave";
import { isWritableSourcePath } from "@/atlas/save/sourcePathAllowlist";
import type { SyncSource, VaultPort } from "./vaultPort";

/** The atlas side a sync works against, taken from the DM build. */
export interface SyncWorld {
  worldId: string;
  importConfig: ImportFolderConfig;
  /** Entity id → its content path. */
  existingById: ReadonlyMap<string, string>;
  entityMeta?: StagingContext["entityMeta"];
}

/** What a plan would do in one top-level vault folder. */
export interface FolderCounts {
  /** Top-level vault folder, or "(vault root)" for notes at the top. */
  folder: string;
  /** New entities (a path collision counts here too). */
  create: number;
  /** Notes that would rewrite an existing entity. */
  update: number;
  /** Notes the sync map says are as last synced. */
  unchanged: number;
  /** Notes that can't be synced: unreadable frontmatter or a target outside the import folders. */
  skipped: number;
}

export interface SyncPlan {
  /** Null for rows that didn't come from a vault (dropped or pasted files). */
  source: SyncSource | null;
  rows: StagingRow[];
  counts: FolderCounts[];
}

export interface SyncCommitResult {
  saved: number;
  rebuilt?: boolean;
  rebuildError?: string;
  /** Embedded images refused (outside the picked folders, missing, too large...). */
  skippedImages: number;
}

/** Thrown when the DM atlas has not been built: Sync needs every entity to tell update from create. */
export class DmBuildRequiredError extends Error {
  constructor() {
    super("Rebuild in DM mode first — Sync needs the full DM atlas loaded.");
    this.name = "DmBuildRequiredError";
  }
}

export function assertDmBuildLoaded(existingById: ReadonlyMap<string, string>): void {
  if (existingById.size === 0) throw new DmBuildRequiredError();
}

/**
 * The sync world from a DM build: every entity with a source file, and the
 * world's import folders (the first world when `worldId` is not given).
 */
export function syncWorldFromProject(project: AtlasProject, worldId?: string): SyncWorld {
  const w = worldId ? project.worlds.find((x) => x.id === worldId) : project.worlds[0];
  if (!w)
    throw new Error(
      worldId ? `No world "${worldId}" in the DM build` : "The DM build has no world",
    );
  const existingById = new Map<string, string>();
  const entityMeta = new Map<
    string,
    { visibility: EntityVisibility; type: string; sourcePath: string }
  >();
  for (const e of project.entities) {
    if (!e.id || !e.sourcePath) continue;
    existingById.set(e.id, e.sourcePath);
    entityMeta.set(e.id, { visibility: e.visibility, type: e.type, sourcePath: e.sourcePath });
  }
  return {
    worldId: w.id,
    importConfig: w.importFolders ?? { folders: {}, defaultFolder: "imports" },
    existingById,
    entityMeta,
  };
}

/** Staging's context for a world; pass the sync map for a vault sync. */
export function stagingContext(world: SyncWorld, syncMap?: SyncMap): StagingContext {
  return {
    worldId: world.worldId,
    importConfig: world.importConfig,
    allowedFolders: new Set([
      ...Object.values(world.importConfig.folders),
      world.importConfig.defaultFolder,
    ]),
    existingById: world.existingById,
    existingPaths: new Set(world.existingById.values()),
    entityMeta: world.entityMeta,
    syncMap,
  };
}

export async function planSync(
  port: VaultPort,
  world: SyncWorld,
  source: SyncSource,
  opts: { dryRun?: boolean } = {},
): Promise<SyncPlan> {
  assertDmBuildLoaded(world.existingById);
  const files = await port.scanVault(source);
  let syncMap = await port.loadSyncMap();

  const moves: [from: string, to: string][] = [];
  const inputs: RawImportFile[] = [];
  for (const [relPath, raw] of Object.entries(files)) {
    const hash = await hashContent(raw);
    let vaultState = classifyVaultNote(syncMap, relPath, hash);
    const movedFrom = vaultState === "new" ? findPathByApprovedHash(syncMap, hash) : undefined;
    if (movedFrom) {
      vaultState = "unchanged";
      if (!(movedFrom in files)) moves.push([movedFrom, relPath]);
    }
    inputs.push({
      filename: relPath.split("/").pop() ?? relPath,
      raw,
      vaultRelPath: relPath,
      vaultState,
      vaultHash: hash,
    });
  }
  for (const [from, to] of moves) syncMap = moveSyncEntry(syncMap, from, to);
  if (moves.length > 0 && !opts.dryRun) await port.saveSyncMap(syncMap);

  const staged = buildStagingRows(inputs, stagingContext(world, syncMap));
  const rows: StagingRow[] = [];
  for (const row of staged) rows.push(await holdLocalEdits(port, syncMap, row));
  return { source, rows, counts: countByFolder(rows) };
}

/** A changed update would overwrite the atlas copy: if the DM edited it since the last sync, hold it. */
async function holdLocalEdits(
  port: VaultPort,
  syncMap: SyncMap,
  row: StagingRow,
): Promise<StagingRow> {
  if (row.rowKind !== "update" || row.vaultState !== "changed" || !row.vaultRelPath) return row;
  let diskRaw: string | null;
  try {
    diskRaw = await port.readAtlasFile(row.targetPath);
  } catch {
    return row; // can't verify: don't block the DM on a read failure
  }
  if (diskRaw === null) return row;
  if (!hasLocalEdits(syncMap, row.vaultRelPath, await hashContent(diskRaw))) return row;
  return { ...row, needsReview: { reason: "local-edits" }, included: false };
}

export function countByFolder(rows: readonly StagingRow[]): FolderCounts[] {
  const byFolder = new Map<string, FolderCounts>();
  for (const row of rows) {
    const rel = row.vaultRelPath ?? row.filename;
    const folder = rel.includes("/") ? rel.split("/")[0] : "(vault root)";
    let c = byFolder.get(folder);
    if (!c) {
      c = { folder, create: 0, update: 0, unchanged: 0, skipped: 0 };
      byFolder.set(folder, c);
    }
    if (row.parseError !== undefined || !row.pathAllowed) c.skipped += 1;
    else if (row.vaultState === "unchanged") c.unchanged += 1;
    else if (row.rowKind === "update") c.update += 1;
    else c.create += 1;
  }
  return [...byFolder.values()].sort((a, b) => a.folder.localeCompare(b.folder));
}

export async function commitSync(
  port: VaultPort,
  rows: StagingRow[],
  source: SyncSource | null,
): Promise<SyncCommitResult> {
  const readFile = async (path: string): Promise<string> => {
    if (!isWritableSourcePath(path)) {
      throw new ImportCommitError(`Path not in source allowlist: ${path}`, path);
    }
    const raw = await port.readAtlasFile(path);
    if (raw === null) throw new ImportCommitError(`Source file not found: ${path}`, path);
    return raw;
  };

  // Conflicts first: a commit the save will refuse must not copy images.
  const firstChanges = await buildImportChanges(rows, { readFile });
  for (const c of firstChanges) {
    if (c.baseHash === null && (await port.readAtlasFile(c.path)) !== null) {
      throw new ConflictError("already-exists", c.path);
    }
  }

  let skippedImages = 0;
  const rowsForCommit: StagingRow[] = [];
  for (const row of rows) {
    if (!row.included || !row.vaultRelPath || !source) {
      rowsForCommit.push(row);
      continue;
    }
    const embeds = [...row.rawContent.matchAll(/!\[\[([^\]]+)\]\]/g)].map((m) =>
      m[1].split("|")[0].trim(),
    );
    if (embeds.length === 0) {
      rowsForCommit.push(row);
      continue;
    }
    const copied: Record<string, string> = {};
    for (const [index, rawSrc] of embeds.entries()) {
      const result = await port.copyVaultImage({
        vaultRoot: source.vaultRoot,
        candidateFolders: source.candidateFolders,
        noteRelPath: row.vaultRelPath,
        rawSrc,
        entityId: row.resolvedId,
        index,
      });
      if (result.ok) copied[rawSrc] = result.target;
      else skippedImages += 1;
    }
    rowsForCommit.push({ ...row, rawContent: rewriteEmbeds(row.rawContent, copied) });
  }
  const changes = rowsForCommit.some((r, i) => r !== rows[i])
    ? await buildImportChanges(rowsForCommit, { readFile })
    : firstChanges;

  const written = await port.writeAtlasFiles(changes);

  // The files are written whether or not the rebuild worked: record them.
  const vaultRows = rows.filter(
    (r) => r.vaultRelPath && r.included && r.pathAllowed && !r.parseError,
  );
  if (vaultRows.length > 0) {
    const contentByPath = new Map(changes.map((c) => [c.path, c.content]));
    let syncMap = await port.loadSyncMap();
    for (const r of vaultRows) {
      const content = contentByPath.get(r.targetPath);
      const syncedFileHash = content !== undefined ? await hashContent(content) : undefined;
      syncMap = recordSync(
        syncMap,
        r.vaultRelPath!,
        r.resolvedId,
        r.inferredType,
        r.vaultHash,
        syncedFileHash,
      );
    }
    await port.saveSyncMap(syncMap);
    await port.markSynced(new Date().toISOString());
  }

  return {
    saved: written.saved,
    rebuilt: written.rebuilt,
    rebuildError: written.rebuildError,
    skippedImages,
  };
}
