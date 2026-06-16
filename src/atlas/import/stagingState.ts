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

import { parseFrontmatter } from "./frontmatter";
import type { ImportFolderConfig } from "../content/schema";
import { inferTypeFromTags } from "./inferTypeFromTags";
import { inferTypeFromPath } from "./inferType";

/**
 * Inferred entity-type (from frontmatter / fallback) → destination folder.
 * Unknown types route to cfg.defaultFolder.
 */
export function inferTargetFolder(type: string, cfg: ImportFolderConfig): string {
  return cfg.folders[type] ?? cfg.defaultFolder;
}

/** Slug rules mirror scripts/atlas/slugify.ts exactly — keep derivation identical to build. */
function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
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
  allowedFolders: ReadonlySet<string>
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
}

export interface StagingRow {
  id: string;
  filename: string;
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
  /** Full file body (text). Preserved verbatim through the commit. */
  content: string;
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
  rawContent: string;
  /** Last-synced vault type for this entity (from sync-map, §3.6). Undefined on first sync. */
  baseType?: string;
  /** Opt-in review flag: row defaults to included=false until the DM ticks it (Phase 2 populates). */
  needsReview?: { reason: "secrecy-increase" | "rename-link" | "type-conflict" };
}

/**
 * Derive a display title from filename and frontmatter, matching build-atlas.ts logic:
 *   title = fm.title.trim() if non-empty, else title-cased slug ("great-hall" → "Great Hall")
 */
function deriveTitle(filename: string, fmTitle: unknown): string {
  if (typeof fmTitle === "string" && fmTitle.trim()) return fmTitle.trim();
  return filename
    .replace(/\.md$/i, "")
    .replace(/[-_]+/g, " ")
    .trim()
    .replace(/(^|\s)(\p{L})/gu, (_m, sp, ch) => sp + ch.toUpperCase());
}

function extractStagingFields(raw: string, relPath: string): {
  type: string;
  typeWasExplicit: boolean;
  typeWasGuessed: boolean;
  id: string | undefined;
  visibility: string;
  fmTitle: string | undefined;
  frontmatterPath: string | undefined;
  parseError: string | undefined;
} {
  try {
    const fm = parseFrontmatter(raw);
    const data = fm.data;
    const atlas = (data.atlas ?? {}) as Record<string, unknown>;

    const explicit =
      typeof atlas.type === "string" && atlas.type.trim().length > 0
        ? atlas.type.trim()
        : undefined;
    const fromTags = explicit ? null : inferTypeFromTags(data.tags);
    const fromFolder = explicit || fromTags ? null : inferTypeFromPath(relPath);
    const type = explicit ?? fromTags ?? (fromFolder && fromFolder !== "note" ? fromFolder : "lore");
    // Guessed = no explicit type, no recognized tag, and the folder gave no useful signal.
    const typeWasGuessed = !explicit && !fromTags && fromFolder === "note";

    const visRaw = typeof atlas.visibility === "string" ? atlas.visibility : undefined;
    const validVis = ["player", "dm", "hidden", "rumor"];
    const visibility = visRaw && validVis.includes(visRaw)
      ? visRaw
      : atlas.publish === true ? "player" : "dm";

    const id = typeof atlas.id === "string" ? atlas.id : undefined;
    const fmTitle = typeof data.title === "string" ? data.title : undefined;
    const frontmatterPath = typeof data.path === "string" ? data.path : undefined;
    return {
      type, typeWasExplicit: !!explicit, typeWasGuessed, id, visibility,
      fmTitle, frontmatterPath, parseError: undefined,
    };
  } catch (e) {
    return {
      type: "lore", typeWasExplicit: false, typeWasGuessed: false, id: undefined, visibility: "dm",
      fmTitle: undefined, frontmatterPath: undefined,
      parseError: e instanceof Error ? e.message : String(e),
    };
  }
}

let rowIdCounter = 0;
function nextRowId(filename: string): string {
  rowIdCounter += 1;
  return `staging-${rowIdCounter}-${slugify(filename) || "row"}`;
}

export function buildStagingRow(input: RawImportFile, ctx: StagingContext): StagingRow {
  const { type, typeWasExplicit, typeWasGuessed, id, visibility, fmTitle, frontmatterPath, parseError } =
    extractStagingFields(input.raw, input.filename);

  // Compute resolvedId matching build-atlas.ts logic exactly:
  // build uses: parsed.atlas.id || slugify(deriveTitle(file, fm.title))
  const title = deriveTitle(input.filename, fmTitle);
  const resolvedId = id ?? slugify(title);

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
  // create and update default ON; path-collision requires explicit opt-in (same as today's conflict)
  const included = !parseError && pathAllowed && rowKind !== "path-collision";

  return {
    id: nextRowId(input.filename),
    filename: input.filename,
    inferredType: type,
    frontmatterPath,
    resolvedId,
    targetPath,
    pathAllowed,
    rowKind,
    included,
    parseError,
    content: input.raw,
    typeWasExplicit,
    typeWasGuessed,
    resolvedVisibility: visibility,
    rawContent: input.raw,
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
      nextPath = computeTargetPath(ctx.worldId, inferTargetFolder(nextType, ctx.importConfig), stem);
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
