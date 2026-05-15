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
    .replace(/[̀-ͯ]/g, "")
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
}

/**
 * Derive a display title from filename and frontmatter, matching build-atlas.ts logic:
 *   title = fm.title.trim() if non-empty, else basename(file, '.md').replace(/[-_]+/g, ' ').trim()
 */
function deriveTitle(filename: string, fmTitle: unknown): string {
  if (typeof fmTitle === "string" && fmTitle.trim()) return fmTitle.trim();
  return filename.replace(/\.md$/i, "").replace(/[-_]+/g, " ").trim();
}

function extractStagingFields(raw: string): {
  type: string;
  id: string | undefined;
  fmTitle: string | undefined;
  frontmatterPath: string | undefined;
  parseError: string | undefined;
} {
  try {
    const fm = parseFrontmatter(raw);
    const data = fm.data;
    const atlas = (data.atlas ?? {}) as Record<string, unknown>;
    const type = typeof atlas.type === "string" && atlas.type.length > 0 ? atlas.type : "imports";
    const id = typeof atlas.id === "string" ? atlas.id : undefined;
    const fmTitle = typeof data.title === "string" ? data.title : undefined;
    const frontmatterPath = typeof data.path === "string" ? data.path : undefined;
    return { type, id, fmTitle, frontmatterPath, parseError: undefined };
  } catch (e) {
    return {
      type: "imports",
      id: undefined,
      fmTitle: undefined,
      frontmatterPath: undefined,
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
  const { type, id, fmTitle, frontmatterPath, parseError } = extractStagingFields(input.raw);

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
  };
}

export function buildStagingRows(inputs: RawImportFile[], ctx: StagingContext): StagingRow[] {
  return inputs.map((i) => buildStagingRow(i, ctx));
}

export interface StagingRowPatch {
  included?: boolean;
  inferredType?: string;
  targetPath?: string;
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
  } else if (pathChangedByCaller) {
    // Manual path edit: treat as create (or path-collision if occupied)
    nextRowKind = ctx.existingPaths.has(nextPath) ? "path-collision" : "create";
  } else {
    nextRowKind = ctx.existingPaths.has(nextPath) ? "path-collision" : "create";
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
  };
}
