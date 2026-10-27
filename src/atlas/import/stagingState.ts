/**
 * Pure state primitive for the `.md` import staging modal.
 *
 * Builds a row per dropped/picked file, decides where each one should land on
 * disk, and tracks include/update/collision state as the DM edits the table.
 * The modal component is a thin shell over this — every rule lives here so it
 * can be reasoned about in isolation.
 *
 * Routing invariants:
 *   - Target paths are forced under content/<world>/<folder>/<slug>.md where
 *     the allowed folders come from ImportFolderConfig (not a hardcoded list).
 *   - The source file's frontmatter `path` is NEVER used as the target — it's
 *     surfaced only as a tooltip suggestion. A malicious or sloppy file can't
 *     steer itself into _atlas/, another world, or a DM-only folder.
 *   - "update" rows (same resolvedId as an existing entity) route to that
 *     entity's current on-disk location and default to included=true.
 *   - "path-collision" rows (different id but occupied target path) default to
 *     included=false and require explicit opt-in to overwrite.
 */

import type { ImportFolderConfig, EntityVisibility } from "../content/schema";
import { inferTypeFromTags } from "./inferTypeFromTags";
import { defaultVisibilityForVaultPath, inferTypeFromPath } from "./inferType";
import { slugify } from "@/atlas/content/slugify";
import { readNote, type Note } from "@/atlas/content/readNote";
import { lookupByPath, type SyncMap, type VaultNoteState } from "./syncMap";
import { detectExposureIncrease, resolveType } from "./mergeImportFrontmatter";

/**
 * Inferred entity-type (from frontmatter / fallback) → destination folder.
 * Unknown types route to cfg.defaultFolder.
 */
export function inferTargetFolder(type: string, cfg: ImportFolderConfig): string {
  return cfg.folders[type] ?? cfg.defaultFolder;
}

export function computeTargetPath(worldId: string, folder: string, stem: string): string {
  return `content/${worldId}/${folder}/${slugify(stem)}.md`;
}

/**
 * True iff `path` lives at exactly `content/<worldId>/<allowed-folder>/<file>.md`.
 * Rejects traversal, absolute paths, deeper nesting, and non-md extensions.
 */
export function isAllowedTargetPath(
  worldId: string,
  path: string,
  allowedFolders: ReadonlySet<string>,
): boolean {
  if (typeof path !== "string" || path.length === 0) return false;
  if (path.startsWith("/") || path.startsWith("./") || path.startsWith("\\")) return false;
  if (path.includes("\\")) return false;
  const parts = path.split("/");
  if (parts.length !== 4) return false;
  for (const p of parts) {
    if (!p || p === "." || p === "..") return false;
  }
  if (parts[0] !== "content") return false;
  if (parts[1] !== worldId) return false;
  if (!allowedFolders.has(parts[2])) return false;
  if (!/^[A-Za-z0-9_\-. ]+\.md$/.test(parts[3])) return false;
  return true;
}

export interface RawImportFile {
  filename: string;
  raw: string;
  /** Vault-relative POSIX path (e.g. "notes/corven.md"). Used for sync-map identity lookup. */
  vaultRelPath?: string;
  /** Drift state from the sync map — present only for rows from a vault scan. */
  vaultState?: VaultNoteState;
  /** Hash of the raw vault bytes, recorded into the sync map after a successful sync. */
  vaultHash?: string;
}

export interface StagingContext {
  worldId: string;
  importConfig: ImportFolderConfig;
  /** Derived from importConfig: new Set([...Object.values(importConfig.folders), importConfig.defaultFolder]) */
  allowedFolders: ReadonlySet<string>;
  /** entity id → its current on-disk sourcePath. Used for in-place update detection. */
  existingById: ReadonlyMap<string, string>;
  /** Set of all existing on-disk sourcePaths. Derived from existingById.values(). */
  existingPaths: ReadonlySet<string>;
  /** Vault-path → { id, baseType } from the last sync. Used for identity resolution when atlas.id is absent. */
  syncMap?: SyncMap;
  /** entity id → { visibility, type, sourcePath } from the DM atlas. Used to detect exposure/type conflicts. */
  entityMeta?: ReadonlyMap<
    string,
    { visibility: EntityVisibility; type: string; sourcePath: string }
  >;
}

export interface StagingRow {
  id: string;
  filename: string;
  /** The note's exact title (see deriveTitle). Commit writes it as `title`. */
  title: string;
  /** Inferred entity type — DM-editable via the type dropdown. */
  inferredType: string;
  /** Frontmatter `path` if the file declared one. Tooltip-only — never the target. */
  frontmatterPath?: string;
  /** Resolved entity id — matches build-atlas.ts id derivation. Used for update detection. */
  resolvedId: string;
  /** Effective target path on disk. Drives rowKind + allowlist checks. */
  targetPath: string;
  pathAllowed: boolean;
  /**
   * "create"         — new entity, target path is free
   * "update"         — matches an existing entity by id; targetPath is that entity's current sourcePath
   * "path-collision" — new entity id, but computed targetPath is already occupied by a different entity
   */
  rowKind: "create" | "update" | "path-collision";
  included: boolean;
  parseError?: string;
  typeWasExplicit: boolean;
  /**
   * True when the type fell through to the silent lore-fallback because the note had no
   * explicit atlas.type, no recognized tags, and landed in an unmapped folder.
   * Used by the staging modal to surface a "Pick a type" affordance so the DM can fix
   * it before importing. Deliberately-typed lore notes (explicit or tag/folder-inferred)
   * are NOT flagged.
   */
  typeWasGuessed: boolean;
  resolvedVisibility: string;
  /** Full file body (text). Preserved verbatim through the commit. */
  rawContent: string;
  /** Last-synced vault type for this entity (from sync-map, §3.6). Undefined on first sync. */
  baseType?: string;
  /** Opt-in review flag: row defaults to included=false until the DM ticks it (Phase 2 populates). */
  needsReview?: { reason: "secrecy-increase" | "rename-link" | "type-conflict" | "local-edits" };
  /** Vault-relative POSIX path — present when the row came from a vault scan (openWithVaultScan). */
  vaultRelPath?: string;
  /** Drift state vs the last publish of this note. Undefined for non-vault rows. */
  vaultState?: VaultNoteState;
  /** Hash of the raw vault bytes for this row (vault scans only). */
  vaultHash?: string;
  /** Set when tags/aliases arrived as a comma-jammed scalar string instead of a YAML list. */
  frontmatterWarning?: string;
}

// The common Obsidian authoring mistake of writing a comma-separated scalar
// (`tags: npc, smuggler`) instead of a YAML list — YAML parses that as ONE
// string, silently corrupting tag/alias-based filtering with no signal to
// the DM. Mirrors the same detection in scripts/atlas/parseFrontmatter.ts.
function commaJammedWarning(rawTags: unknown, rawAliases: unknown): string | undefined {
  const jammed: string[] = [];
  if (typeof rawTags === "string" && rawTags.includes(",")) jammed.push("tags");
  if (typeof rawAliases === "string" && rawAliases.includes(",")) jammed.push("aliases");
  if (jammed.length === 0) return undefined;
  return `${jammed.join(" and ")} should be a YAML list, not a comma-separated string — treated as one value`;
}

/**
 * What Staging needs from a note. Title, id, explicit type and visibility come
 * from `readNote`, as for the build; the type guess (tags, then folder, then
 * "lore") is Staging's own, for notes that name no type.
 */
function extractStagingFields(
  raw: string,
  relPath: string,
): {
  note: Note;
  type: string;
  typeWasExplicit: boolean;
  typeWasGuessed: boolean;
  frontmatterPath: string | undefined;
  frontmatterWarning: string | undefined;
} {
  const note = readNote(raw, relPath);
  if (note.parseError !== undefined) {
    return {
      note,
      type: "lore",
      typeWasExplicit: false,
      typeWasGuessed: false,
      frontmatterPath: undefined,
      frontmatterWarning: undefined,
    };
  }
  const { data, atlas } = note;
  const explicit = note.type;
  const fromTags = explicit ? null : inferTypeFromTags(data.tags);
  const fromFolder = explicit || fromTags ? null : inferTypeFromPath(relPath);
  const type = explicit ?? fromTags ?? (fromFolder && fromFolder !== "note" ? fromFolder : "lore");
  // Guessed = no explicit type, no recognized tag, and the folder gave no useful signal.
  const typeWasGuessed = !explicit && !fromTags && fromFolder === "note";

  const frontmatterPath = typeof data.path === "string" ? data.path : undefined;
  const frontmatterWarning = commaJammedWarning(
    atlas.tags ?? data.tags,
    atlas.aliases ?? data.aliases,
  );
  return {
    note,
    type,
    typeWasExplicit: !!explicit,
    typeWasGuessed,
    frontmatterPath,
    frontmatterWarning,
  };
}

let rowIdCounter = 0;
function nextRowId(filename: string): string {
  rowIdCounter += 1;
  return `staging-${rowIdCounter}-${slugify(filename) || "row"}`;
}

export function buildStagingRow(input: RawImportFile, ctx: StagingContext): StagingRow {
  const { note, type, typeWasExplicit, typeWasGuessed, frontmatterPath, frontmatterWarning } =
    extractStagingFields(input.raw, input.filename);
  const parseError = note.parseError;
  // What the vault asks for: the note's own tag (readNote, as the build reads
  // it), else the vault folder rule. An unreadable note is dm (fail closed).
  const vaultVisibility: EntityVisibility =
    note.visibilityTagged || parseError !== undefined
      ? note.visibility
      : defaultVisibilityForVaultPath(input.vaultRelPath);

  // ── Identity resolution (§5.3 precedence) ──────────────────────────────────
  // Priority: (1) vault atlas.id; (2) sync-map[vaultRelPath]; (3) slugify(title)
  const syncEntry =
    input.vaultRelPath && ctx.syncMap ? lookupByPath(ctx.syncMap, input.vaultRelPath) : undefined;
  const title = note.title;
  const resolvedId = note.idFromFrontmatter ? note.id : (syncEntry?.id ?? note.id);
  const baseType = syncEntry?.baseType; // for two-way type resolution in §3.6

  // Stem for path computation: use resolvedId (same as build-atlas derivation)
  const stem = resolvedId;

  let targetPath: string;
  let rowKind: StagingRow["rowKind"];

  if (ctx.existingById.has(resolvedId)) {
    // In-place update: route to the existing entity's current file location
    targetPath = ctx.existingById.get(resolvedId)!;
    rowKind = "update";
  } else {
    // New entity: route by type to the configured folder
    const folder = inferTargetFolder(type, ctx.importConfig);
    targetPath = computeTargetPath(ctx.worldId, folder, stem);
    rowKind = ctx.existingPaths.has(targetPath) ? "path-collision" : "create";
  }

  const pathAllowed = isAllowedTargetPath(ctx.worldId, targetPath, ctx.allowedFolders);

  // ── needsReview from DM-canon (§2.3) ────────────────────────────────────────
  // Only computed for update rows; create/collision rows are never auto-exposed.
  let needsReview: StagingRow["needsReview"] = undefined;
  const meta = rowKind === "update" ? ctx.entityMeta?.get(resolvedId) : undefined;
  if (meta) {
    // Check secrecy increase: canon is hidden-tier, vault wants player visibility
    if (detectExposureIncrease(meta.visibility, note.atlas)) {
      needsReview = { reason: "secrecy-increase" };
    } else if (baseType) {
      // Check type conflict: both disk type and vault type diverged from last-synced base
      const { conflict } = resolveType({ diskType: meta.type, vaultType: type, baseType });
      if (conflict) needsReview = { reason: "type-conflict" };
    }
  }

  // The visibility commit will write, which is what Staging shows:
  // an update keeps the atlas's own unless the DM approves a secrecy increase;
  // a new note gets what the vault asks for.
  const resolvedVisibility =
    meta && needsReview?.reason !== "secrecy-increase" ? meta.visibility : vaultVisibility;

  // create and update default ON; path-collision requires explicit opt-in; needsReview rows default OFF
  // An unchanged note has nothing to import — leave it unticked so the default
  // action on a re-sync is "bring in what actually moved".
  const included =
    !parseError &&
    pathAllowed &&
    rowKind !== "path-collision" &&
    !needsReview &&
    input.vaultState !== "unchanged";

  return {
    id: nextRowId(input.filename),
    filename: input.filename,
    title,
    inferredType: type,
    frontmatterPath,
    resolvedId,
    targetPath,
    pathAllowed,
    rowKind,
    included,
    parseError,
    typeWasExplicit,
    typeWasGuessed,
    resolvedVisibility,
    rawContent: input.raw,
    baseType,
    needsReview,
    vaultRelPath: input.vaultRelPath,
    vaultState: input.vaultState,
    vaultHash: input.vaultHash,
    frontmatterWarning,
  };
}

export function buildStagingRows(inputs: RawImportFile[], ctx: StagingContext): StagingRow[] {
  return inputs.map((i) => buildStagingRow(i, ctx));
}

export interface StagingRowPatch {
  included?: boolean;
  inferredType?: string;
  targetPath?: string;
  resolvedVisibility?: string;
}

/**
 * Apply a DM edit to a staging row. Recomputes rowKind + pathAllowed against
 * the latest context. The rule for `included`:
 *
 *   - Explicit `patch.included` is honoured verbatim (this is how the DM
 *     re-checks a path-collision row to opt into an overwrite).
 *   - Changing the type recomputes the target path (for non-update rows) AND
 *     re-defaults `included` based on the new path's collision / allowlist state.
 *   - Manually editing the target path re-defaults `included` the same way.
 *   - Update rows (anchored to existing file location) are not rerouted on type change.
 */
export function updateStagingRow(
  row: StagingRow,
  patch: StagingRowPatch,
  ctx: StagingContext,
): StagingRow {
  let nextType = row.inferredType;
  let nextPath = row.targetPath;
  let typeChanged = false;
  let pathChangedByCaller = false;

  if (patch.inferredType !== undefined && patch.inferredType !== row.inferredType) {
    nextType = patch.inferredType;
    typeChanged = true;
    // Only reroute for non-update rows — update rows are anchored to existing file location
    if (row.rowKind !== "update") {
      const stem = row.resolvedId;
      nextPath = computeTargetPath(
        ctx.worldId,
        inferTargetFolder(nextType, ctx.importConfig),
        stem,
      );
    }
  }
  if (patch.targetPath !== undefined && patch.targetPath !== nextPath) {
    nextPath = patch.targetPath;
    pathChangedByCaller = true;
  }

  const pathAllowed = isAllowedTargetPath(ctx.worldId, nextPath, ctx.allowedFolders);

  // Re-evaluate rowKind
  let nextRowKind: StagingRow["rowKind"];
  if (ctx.existingById.has(row.resolvedId) && !pathChangedByCaller) {
    nextRowKind = "update";
  } else if (typeChanged || pathChangedByCaller) {
    // Type or path changed: recompute from the new target path
    nextRowKind = ctx.existingPaths.has(nextPath) ? "path-collision" : "create";
  } else {
    // Nothing changed — preserve existing rowKind
    nextRowKind = row.rowKind;
  }

  let nextIncluded: boolean;
  if (patch.included !== undefined) {
    nextIncluded = !row.parseError && pathAllowed && patch.included;
  } else if (typeChanged || pathChangedByCaller) {
    nextIncluded = !row.parseError && pathAllowed && nextRowKind !== "path-collision";
  } else {
    nextIncluded = row.included;
  }

  return {
    ...row,
    inferredType: nextType,
    targetPath: nextPath,
    pathAllowed,
    rowKind: nextRowKind,
    included: nextIncluded,
    resolvedVisibility: patch.resolvedVisibility ?? row.resolvedVisibility,
  };
}
