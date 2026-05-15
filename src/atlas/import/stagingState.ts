/**
 * Pure state primitive for the `.md` import staging modal.
 *
 * Builds a row per dropped/picked file, decides where each one should land on
 * disk, and tracks include/conflict/allowlist state as the DM edits the table.
 * The modal component is a thin shell over this — every rule lives here so it
 * can be reasoned about in isolation.
 *
 * Phase 1C invariants:
 *   - Target paths are forced under content/<world>/{places,people,factions,
 *     items,events,regions,imports}/<slug>.md. The seven folders are the only
 *     legal destinations.
 *   - The source file's frontmatter `path` is NEVER used as the target — it's
 *     surfaced only as a tooltip suggestion. A malicious or sloppy file can't
 *     steer itself into _atlas/, another world, or a DM-only folder.
 *   - Conflict rows (target already exists on disk) default to included=false
 *     and require an explicit re-check to overwrite.
 */

import yaml from "js-yaml";

/**
 * Minimal browser-safe frontmatter parser. `gray-matter` references Node's
 * Buffer in its toBuffer path and crashes in the browser; we only need to
 * read `atlas.type` / `atlas.id` / `path` from the YAML head and don't care
 * about excerpts, custom delimiters, or stringification — so a regex split +
 * js-yaml is enough and avoids the polyfill question.
 */
function readFrontmatter(raw: string): { data: Record<string, unknown> } {
  // Frontmatter must be the very first thing in the file. Tolerate a BOM.
  const stripped = raw.replace(/^﻿/, "");
  const m = stripped.match(/^---\r?\n([\s\S]*?)\r?\n---(\r?\n|$)/);
  if (!m) return { data: {} };
  const parsed = yaml.load(m[1]);
  const data =
    parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  return { data };
}

export const ALLOWED_FOLDERS = [
  "places",
  "people",
  "factions",
  "items",
  "events",
  "regions",
  "imports",
] as const;
export type TargetFolder = (typeof ALLOWED_FOLDERS)[number];
const ALLOWED_FOLDER_SET = new Set<string>(ALLOWED_FOLDERS);

/**
 * Inferred entity-type (from frontmatter / fallback) → destination folder.
 * Unknown types route to imports/ — same behaviour as a file with no type.
 */
export function inferTargetFolder(inferredType: string): TargetFolder {
  switch (inferredType) {
    case "settlement":
    case "ruin":
    case "dungeon":
    case "location":
    case "map_note":
      return "places";
    case "npc":
      return "people";
    case "faction":
      return "factions";
    case "item":
      return "items";
    case "event":
      return "events";
    case "region":
      return "regions";
    default:
      return "imports";
  }
}

/** Slug rules mirror parseObsidian's — keep the import path identical to canon. */
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

function filenameStem(filename: string): string {
  return filename.replace(/\.md$/i, "");
}

export function computeTargetPath(worldId: string, folder: TargetFolder, stem: string): string {
  return `content/${worldId}/${folder}/${slugify(stem)}.md`;
}

/**
 * True iff `path` lives at exactly `content/<worldId>/<allowed-folder>/<file>.md`.
 * Rejects traversal, absolute paths, deeper nesting, and non-md extensions.
 */
export function isAllowedTargetPath(worldId: string, path: string): boolean {
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
  if (!ALLOWED_FOLDER_SET.has(parts[2])) return false;
  if (!/^[A-Za-z0-9_\-. ]+\.md$/.test(parts[3])) return false;
  return true;
}

export interface RawImportFile {
  filename: string;
  raw: string;
}

export interface StagingContext {
  worldId: string;
  /** Set of currently-on-disk entity .md paths under content/. Used for conflict detection. */
  existingPaths: Set<string>;
}

export interface StagingRow {
  id: string;
  filename: string;
  /** Inferred entity type — DM-editable via the type dropdown. */
  inferredType: string;
  /** Frontmatter `path` if the file declared one. Tooltip-only — never the target. */
  frontmatterPath?: string;
  /** Effective target path on disk. Drives conflict + allowlist checks. */
  targetPath: string;
  pathAllowed: boolean;
  conflict: boolean;
  included: boolean;
  parseError?: string;
  /** Full file body (text). Preserved verbatim through the commit. */
  content: string;
}

function parseFrontmatter(raw: string): {
  type: string;
  id: string | undefined;
  frontmatterPath: string | undefined;
  parseError: string | undefined;
} {
  try {
    const fm = readFrontmatter(raw);
    const data = fm.data;
    const atlas = (data.atlas ?? {}) as Record<string, unknown>;
    const type = typeof atlas.type === "string" && atlas.type.length > 0 ? atlas.type : "imports";
    const id = typeof atlas.id === "string" ? atlas.id : undefined;
    const frontmatterPath = typeof data.path === "string" ? data.path : undefined;
    return { type, id, frontmatterPath, parseError: undefined };
  } catch (e) {
    return {
      type: "imports",
      id: undefined,
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
  const { type, id, frontmatterPath, parseError } = parseFrontmatter(input.raw);
  const stem = id ?? filenameStem(input.filename);
  const folder = inferTargetFolder(type);
  const targetPath = computeTargetPath(ctx.worldId, folder, stem);
  const pathAllowed = isAllowedTargetPath(ctx.worldId, targetPath);
  const conflict = ctx.existingPaths.has(targetPath);
  // Default include: ON unless parse failed, path is bad, or there's a conflict.
  const included = !parseError && pathAllowed && !conflict;
  return {
    id: nextRowId(input.filename),
    filename: input.filename,
    inferredType: type,
    frontmatterPath,
    targetPath,
    pathAllowed,
    conflict,
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
 * Apply a DM edit to a staging row. Recomputes conflict + pathAllowed against
 * the latest context. The rule for `included`:
 *
 *   - Explicit `patch.included` is honoured verbatim (this is how the DM
 *     re-checks a conflict row to opt into an overwrite).
 *   - Changing the type recomputes the target path AND re-defaults
 *     `included` based on the new path's conflict / allowlist state.
 *   - Manually editing the target path re-defaults `included` the same way.
 */
export function updateStagingRow(
  row: StagingRow,
  patch: StagingRowPatch,
  ctx: StagingContext,
): StagingRow {
  let nextType = row.inferredType;
  let nextPath = row.targetPath;
  let pathChangedByCaller = false;
  let typeChanged = false;

  if (patch.inferredType !== undefined && patch.inferredType !== row.inferredType) {
    nextType = patch.inferredType;
    typeChanged = true;
    // Re-derive path from new type, preserving the existing stem.
    const stem = filenameStem(row.targetPath.split("/").pop() ?? row.filename);
    nextPath = computeTargetPath(ctx.worldId, inferTargetFolder(nextType), stem);
  }
  if (patch.targetPath !== undefined && patch.targetPath !== nextPath) {
    nextPath = patch.targetPath;
    pathChangedByCaller = true;
  }

  const pathAllowed = isAllowedTargetPath(ctx.worldId, nextPath);
  const conflict = ctx.existingPaths.has(nextPath);

  let nextIncluded: boolean;
  if (patch.included !== undefined) {
    // Explicit include toggle wins — even on a conflict (that's the overwrite opt-in).
    // But a parse error or disallowed path is hard-blocked.
    nextIncluded = !row.parseError && pathAllowed && patch.included;
  } else if (typeChanged || pathChangedByCaller) {
    nextIncluded = !row.parseError && pathAllowed && !conflict;
  } else {
    nextIncluded = row.included;
  }

  return {
    ...row,
    inferredType: nextType,
    targetPath: nextPath,
    pathAllowed,
    conflict,
    included: nextIncluded,
  };
}
