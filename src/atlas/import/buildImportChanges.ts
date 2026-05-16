/**
 * Phase 1C C3 — turn staged .md import rows into FileChange[] for the unified
 * Save endpoint.
 *
 * Rules:
 *   - New files (no conflict) → baseHash = null. The endpoint treats those
 *     as create-only and 409's if a file appeared between staging and commit.
 *   - Conflict rows (DM explicitly re-checked) → read current on-disk content,
 *     compute its SHA-256 as baseHash. The Save endpoint then enforces
 *     "still the same content" before overwriting and backs up the prior
 *     version under .atlas-backups/<ts>/.
 *   - Excluded / parse-error / outside-allowlist rows are silently dropped.
 *     The modal already prevents toggling them on, but defending here means
 *     a misuse can't widen the surface.
 */
import { hashContent, type FileChange } from "@/atlas/save/localFsSave";
import { isWritableSourcePath } from "@/atlas/save/sourcePathAllowlist";
import { rewriteFrontmatter } from "@/atlas/content/frontmatterRewrite";
import type { StagingRow } from "./stagingState";

export class ImportCommitError extends Error {
  constructor(message: string, public readonly path?: string) {
    super(message);
    this.name = "ImportCommitError";
  }
}

export interface BuildImportChangesDeps {
  fetchFn?: typeof fetch;
}

async function readSourceFile(path: string, fetchFn: typeof fetch): Promise<string> {
  if (!isWritableSourcePath(path)) {
    throw new ImportCommitError(`Path not in source allowlist: ${path}`, path);
  }
  const url = `/__atlas/read?path=${encodeURIComponent(path)}`;
  const res = await fetchFn(url, { method: "GET" });
  if (res.status === 404) {
    throw new ImportCommitError(`Source file not found: ${path}`, path);
  }
  if (!res.ok) {
    throw new ImportCommitError(`Failed to read ${path}: status ${res.status}`, path);
  }
  const body = (await res.json()) as { contents?: unknown };
  if (typeof body.contents !== "string") {
    throw new ImportCommitError(`Malformed read response for ${path}`, path);
  }
  return body.contents;
}

export async function buildImportChanges(
  rows: StagingRow[],
  deps?: BuildImportChangesDeps,
): Promise<FileChange[]> {
  const fetchFn = deps?.fetchFn ?? fetch;
  const eligible = rows.filter(
    (r) => r.included && r.pathAllowed && !r.parseError,
  );
  if (eligible.length === 0) {
    throw new ImportCommitError("No rows selected for import");
  }

  const changes: FileChange[] = [];
  for (const row of eligible) {
    let baseHash: string | null = null;
    if (row.rowKind === "update" || row.rowKind === "path-collision") {
      const currentRaw = await readSourceFile(row.targetPath, fetchFn);
      baseHash = await hashContent(currentRaw);
    }
    const content = rewriteFrontmatter(row.rawContent, {
      id: row.resolvedId,
      type: row.inferredType,
      visibility: row.resolvedVisibility,
      tagsAdd: row.inferredType ? [row.inferredType] : [],
    });
    changes.push({
      path: row.targetPath,
      content,
      kind: "entity-md",
      baseHash,
    });
  }
  return changes;
}
