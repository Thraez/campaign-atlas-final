/**
 * Sync from Obsidian as one module: `planSync` reads the vault and decides
 * what each note would do (Staging's rows), `commitSync` writes the rows the
 * DM kept. Both talk to the world only through a `VaultPort` (`./vaultPort.ts`),
 * so the editor, the tests and `npm run atlas:sync` run the same steps.
 *
 * planSync, in order:
 *   1. refuses without the DM build (`DmBuildRequiredError`);
 *      the `SyncWorld` holds only the target world's entities and sync map
 *      (`syncWorldFromProject`, R-14);
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
 *   1. builds the file changes, refuses any outside `content/<world>/`
 *      (`ImportCommitError`), and checks every create target is still free,
 *      so a commit the save will refuse copies no image (`ConflictError`);
 *   2. copies embedded images and rewrites the embeds (a refused one is
 *      dropped and counted in `skippedImages`; a `HostingPublicError` from the
 *      port stops the commit, R-01);
 *   3. writes the files, marked `origin: "sync"` when they came from a vault;
 *   4. records every written vault note in the world's sync map, whether or not the
 *      rebuild worked, and stamps the sync time.
 * Errors: `ImportCommitError` (nothing to commit, unreadable atlas file),
 * `ConflictError`, and whatever the port's write throws (`SaveBusyError`).
 */
import type { AtlasProject, EntityVisibility, ImportFolderConfig } from "@/atlas/content/schema";
import { buildImportChanges, ImportCommitError } from "@/atlas/import/buildImportChanges";
import { makeIgnore } from "@/atlas/import/ignoreRules";
import { rewriteEmbeds } from "@/atlas/import/resolveVaultImage";
import {
  buildStagingRows,
  isHeldForOtherWorld,
  otherWorldMessage,
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
import { isPlayerVisible, isValidVisibility } from "@/atlas/content/visibility";
import type { SyncSource, VaultPort } from "./vaultPort";

/** The atlas side a sync works against, taken from the DM build. */
export interface SyncWorld {
  worldId: string;
  importConfig: ImportFolderConfig;
  /** Entity id → its content path: this world's entities only (R-14). */
  existingById: ReadonlyMap<string, string>;
  entityMeta?: StagingContext["entityMeta"];
  /**
   * Entity id → world, for ids other worlds already hold. Note ids are global
   * across worlds, so a new note with one of them is held, never created (R-14).
   */
  idsInOtherWorlds?: ReadonlyMap<string, string>;
  /**
   * Entities with a source file in the whole DM build, every world's. Zero
   * means no DM build is loaded (or it has no notes), so a world with nothing
   * in it yet can still be synced into while other worlds have notes. When
   * absent, `planSync` falls back to `existingById.size`, the target world's
   * own count.
   */
  dmBuildSize?: number;
}

/** What a plan would do in one top-level vault folder. */
export interface FolderCounts {
  /** Top-level vault folder, or "(vault root)" for notes at the top. */
  folder: string;
  /** New entities. */
  create: number;
  /** Notes that would rewrite an existing entity. */
  update: number;
  /** Notes the sync map says are as last synced. */
  unchanged: number;
  /** Notes Staging won't tick by default: held for review, or a path collision. */
  held: number;
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
 * Thrown when a sync wrote its notes but then couldn't record them in the sync
 * map (for example, the DM rebuild failed and the map route found no build).
 * The notes are on disk; the next sync after fixing the build records them.
 */
export class SyncMapNotSavedError extends Error {
  readonly saved: number;
  constructor(saved: number, cause: unknown, rebuildError?: string) {
    const why = cause instanceof Error ? cause.message : String(cause);
    super(
      `${saved} note(s) were saved, but the sync map wasn't (${why}).` +
        (rebuildError ? ` The DM rebuild failed: ${rebuildError}.` : "") +
        " Fix the DM build (npm run atlas:build) and sync again.",
    );
    this.name = "SyncMapNotSavedError";
    this.saved = saved;
  }
}

/** Thrown when a sync names no world, or one the DM build doesn't have (R-14). */
export class SyncWorldError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SyncWorldError";
  }
}

/**
 * One world's entities in a DM build: id → source path, and the meta Staging
 * reads. An entity of another world is left out, so a vault note can never
 * match, update or overwrite it (R-14); its id goes into `idsInOtherWorlds`
 * instead, because note ids are global across worlds (the build refuses a
 * duplicate) and a new note with that id must be held, not created. An
 * entity with no `world` counts only when the build has a single world (an
 * older build).
 */
export function worldEntities(
  project: Pick<AtlasProject, "worlds" | "entities">,
  worldId: string,
): {
  existingById: Map<string, string>;
  entityMeta: NonNullable<SyncWorld["entityMeta"]>;
  idsInOtherWorlds: Map<string, string>;
} {
  const oneWorld = project.worlds.length === 1 && project.worlds.some((w) => w.id === worldId);
  const existingById = new Map<string, string>();
  const entityMeta = new Map<
    string,
    { visibility: EntityVisibility; type: string; sourcePath: string }
  >();
  const idsInOtherWorlds = new Map<string, string>();
  for (const e of project.entities) {
    if (!e.id || !e.sourcePath) continue;
    if (e.world !== undefined && e.world !== "" ? e.world !== worldId : !oneWorld) {
      if (!idsInOtherWorlds.has(e.id)) idsInOtherWorlds.set(e.id, e.world || "(no world)");
      continue;
    }
    existingById.set(e.id, e.sourcePath);
    entityMeta.set(e.id, { visibility: e.visibility, type: e.type, sourcePath: e.sourcePath });
  }
  // An id this world holds updates here; it is only "elsewhere" when it isn't.
  for (const id of existingById.keys()) idsInOtherWorlds.delete(id);
  return { existingById, entityMeta, idsInOtherWorlds };
}

/**
 * The sync world from a DM build: the target world's entities with a source
 * file (`worldEntities`) and its import folders. With more than one world the
 * caller must name one; with exactly one, it is the default.
 */
export function syncWorldFromProject(project: AtlasProject, worldId?: string): SyncWorld {
  const ids = project.worlds.map((x) => x.id);
  // With exactly one world, naming it is optional.
  const target = worldId || (ids.length === 1 ? ids[0] : undefined);
  let w: AtlasProject["worlds"][number] | undefined;
  if (target) {
    w = project.worlds.find((x) => x.id === target);
    if (!w) {
      throw new SyncWorldError(
        `No world "${target}" in the DM build. Worlds: ${ids.join(", ") || "(none)"}.`,
      );
    }
  } else if (ids.length === 0) {
    throw new SyncWorldError("The DM build has no world.");
  } else {
    throw new SyncWorldError(
      `The DM build has ${ids.length} worlds; name the one to sync into. Worlds: ${ids.join(", ")}.`,
    );
  }
  return {
    worldId: w.id,
    importConfig: w.importFolders ?? { folders: {}, defaultFolder: "imports" },
    ...worldEntities(project, w.id),
    dmBuildSize: project.entities.filter((e) => e.id && e.sourcePath).length,
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
    idsInOtherWorlds: world.idsInOtherWorlds,
    syncMap,
  };
}

export async function planSync(
  port: VaultPort,
  world: SyncWorld,
  source: SyncSource,
  opts: { dryRun?: boolean } = {},
): Promise<SyncPlan> {
  if ((world.dmBuildSize ?? world.existingById.size) === 0) throw new DmBuildRequiredError();
  const files = await port.scanVault(source);
  let syncMap = await port.loadSyncMap(world.worldId);

  // A sync-map path this scan could have seen. An entry outside it isn't
  // "gone from the vault", only unscanned, so nothing may move away from it.
  const ignored = makeIgnore(source.ignoreGlobs);
  const scanned = (p: string) =>
    !ignored(p) &&
    (source.candidateFolders.length === 0 ||
      source.candidateFolders.some((f) => p === f || p.startsWith(`${f}/`)));
  const moves: [from: string, to: string][] = [];
  const inputs: RawImportFile[] = [];
  for (const [relPath, raw] of Object.entries(files)) {
    const hash = await hashContent(raw);
    let vaultState = classifyVaultNote(syncMap, relPath, hash);
    const movedFrom = vaultState === "new" ? findPathByApprovedHash(syncMap, hash) : undefined;
    if (movedFrom) {
      vaultState = "unchanged";
      if (!(movedFrom in files) && scanned(movedFrom)) moves.push([movedFrom, relPath]);
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
  if (moves.length > 0 && !opts.dryRun) await port.saveSyncMap(world.worldId, syncMap);

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
      c = { folder, create: 0, update: 0, unchanged: 0, held: 0, skipped: 0 };
      byFolder.set(folder, c);
    }
    if (row.parseError !== undefined || !row.pathAllowed) c.skipped += 1;
    else if (row.vaultState === "unchanged") c.unchanged += 1;
    else if (row.needsReview || row.rowKind === "path-collision") c.held += 1;
    else if (row.rowKind === "update") c.update += 1;
    else c.create += 1;
  }
  return [...byFolder.values()].sort((a, b) => a.folder.localeCompare(b.folder));
}

export interface UnattendedRefusal {
  /** "lowers-secrecy": writing it would show players an entity the atlas keeps from them. */
  kind: "lowers-secrecy" | "held";
  reason: string;
}

/**
 * Why a row must not be written without a person looking at it, or null:
 * held rows (review flags, path collisions), and any update whose written
 * visibility would show players an entity the atlas keeps from them.
 */
export function unattendedRefusal(row: StagingRow, world: SyncWorld): UnattendedRefusal | null {
  const atlasVis = world.entityMeta?.get(row.resolvedId)?.visibility;
  if (
    row.rowKind === "update" &&
    atlasVis !== undefined &&
    !isPlayerVisible(atlasVis) &&
    isValidVisibility(row.resolvedVisibility) &&
    isPlayerVisible(row.resolvedVisibility)
  ) {
    return { kind: "lowers-secrecy", reason: `would show players a ${atlasVis} entity` };
  }
  if (isHeldForOtherWorld(row)) {
    return { kind: "held", reason: `held for review (${otherWorldMessage(row)})` };
  }
  if (row.needsReview)
    return { kind: "held", reason: `held for review (${row.needsReview.reason})` };
  if (row.rowKind === "path-collision") return { kind: "held", reason: "path collision" };
  return null;
}

/** An existing atlas file's text through the port; a missing or non-content path throws. */
export function existingFileReader(port: VaultPort): (path: string) => Promise<string> {
  return async (path) => {
    if (!isWritableSourcePath(path)) {
      throw new ImportCommitError(`Path not in source allowlist: ${path}`, path);
    }
    const raw = await port.readAtlasFile(path);
    if (raw === null) throw new ImportCommitError(`Source file not found: ${path}`, path);
    return raw;
  };
}

export async function commitSync(
  port: VaultPort,
  world: Pick<SyncWorld, "worldId" | "idsInOtherWorlds">,
  rows: StagingRow[],
  source: SyncSource | null,
): Promise<SyncCommitResult> {
  const readFile = existingFileReader(port);

  // R-14: ids are global across worlds. Re-checked here from the world, not
  // from the row's own review flag, so a row whose flag was lost or stripped
  // still can't put a second copy of another world's note in this one.
  for (const row of rows) {
    const otherWorld = row.included ? world.idsInOtherWorlds?.get(row.resolvedId) : undefined;
    if (otherWorld !== undefined) {
      throw new ImportCommitError(
        `${row.targetPath}: id "${row.resolvedId}" is already a note in world ${otherWorld}`,
        row.targetPath,
      );
    }
  }

  // Conflicts first: a commit the save will refuse must not copy images.
  const firstChanges = await buildImportChanges(rows, { readFile });
  // R-14: rows staged for another world never write here (nor into its sync map).
  const worldRoot = `content/${world.worldId}/`;
  for (const c of firstChanges) {
    if (!world.worldId || !c.path.startsWith(worldRoot)) {
      throw new ImportCommitError(
        `${c.path} is outside the world being synced (${worldRoot})`,
        c.path,
      );
    }
  }
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

  // A vault sync says so, so the port can refuse it while hosting is public (R-01).
  const written = await port.writeAtlasFiles(changes, source ? { origin: "sync" } : undefined);

  // The files are written whether or not the rebuild worked: record them.
  const vaultRows = rows.filter(
    (r) => r.vaultRelPath && r.included && r.pathAllowed && !r.parseError,
  );
  if (vaultRows.length > 0) {
    const contentByPath = new Map(changes.map((c) => [c.path, c.content]));
    let syncMap = await port.loadSyncMap(world.worldId);
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
    try {
      await port.saveSyncMap(world.worldId, syncMap);
    } catch (e) {
      throw new SyncMapNotSavedError(written.saved, e, written.rebuildError);
    }
    await port.markSynced(new Date().toISOString());
  }

  return {
    saved: written.saved,
    rebuilt: written.rebuilt,
    rebuildError: written.rebuildError,
    skippedImages,
  };
}
