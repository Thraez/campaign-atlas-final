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
import { parseFrontmatter, stringifyFrontmatter } from "./frontmatter";
import { mergeImportFrontmatter } from "./mergeImportFrontmatter";
import { readNote } from "@/atlas/content/readNote";
import { isWritableSourcePath } from "@/atlas/save/sourcePathAllowlist";
import { rewriteFrontmatter } from "@/atlas/content/frontmatterRewrite";
import type { StagingRow } from "./stagingState";

export class ImportCommitError extends Error {
  constructor(
    message: string,
    public readonly path?: string,
  ) {
    super(message);
    this.name = "ImportCommitError";
  }
}

export interface BuildImportChangesDeps {
  fetchFn?: typeof fetch;
  /** Reads an atlas file's current text; wins over `fetchFn` (Sync passes its vault port). */
  readFile?: (path: string) => Promise<string>;
}

export async function readSourceFile(path: string, fetchFn: typeof fetch): Promise<string> {
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
  const readFile =
    deps?.readFile ?? ((path: string) => readSourceFile(path, deps?.fetchFn ?? fetch));
  const eligible = rows.filter((r) => r.included && r.pathAllowed && !r.parseError);
  if (eligible.length === 0) {
    throw new ImportCommitError("No rows selected for import");
  }

  const changes: FileChange[] = [];
  for (const row of eligible) {
    let baseHash: string | null = null;
    let content: string;

    if (row.rowKind === "update") {
      // Read fresh disk content at commit time (not stale staging-time snapshot).
      const currentRaw = await readFile(row.targetPath);
      baseHash = await hashContent(currentRaw);
      const disk = readNote(currentRaw, row.targetPath);
      if (disk.parseError !== undefined) {
        throw new ImportCommitError(
          `${row.targetPath} has malformed frontmatter: ${disk.parseError}`,
          row.targetPath,
        );
      }
      const merged = mergeImportFrontmatter({
        disk,
        vault: parseFrontmatter(row.rawContent),
        inferredType: row.inferredType,
        baseType: row.baseType, // from sync-map (Phase 2); undefined → vault wins on type
      });
      // An approved secrecy increase is the one case where the vault's visibility wins.
      if (row.needsReview?.reason === "secrecy-increase") {
        (merged.data.atlas as Record<string, unknown>).visibility = row.resolvedVisibility;
      }
      // The vault's title is its filename, which the merge doesn't see.
      content = stringifyFrontmatter(merged.content, { title: row.title, ...merged.data });
    } else {
      // path-collision: read disk for baseHash but still rewrite from vault.
      if (row.rowKind === "path-collision") {
        const currentRaw = await readFile(row.targetPath);
        baseHash = await hashContent(currentRaw);
      }
      // create/path-collision: the visibility Staging showed (the note's tag,
      // else the vault folder rule; see stagingState).
      content = rewriteFrontmatter(row.rawContent, {
        title: row.title,
        id: row.resolvedId,
        type: row.inferredType,
        visibility: row.resolvedVisibility,
        tagsAdd: row.inferredType ? [row.inferredType] : [],
      });
    }

    changes.push({ path: row.targetPath, content, kind: "entity-md", baseHash });
  }
  return changes;
}
