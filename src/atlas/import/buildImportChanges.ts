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
  /**
   * An existing atlas file's current text; throws `ImportCommitError` when it
   * is missing. Sync builds it from its vault port (`existingFileReader` in
   * `src/atlas/sync/sync.ts`).
   */
  readFile: (path: string) => Promise<string>;
}

export async function buildImportChanges(
  rows: StagingRow[],
  { readFile }: BuildImportChangesDeps,
): Promise<FileChange[]> {
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
      // The vault's visibility wins only on an approved review of it: a
      // secrecy increase, or a vault that keeps a player note from players.
      if (
        row.needsReview?.reason === "secrecy-increase" ||
        row.needsReview?.reason === "vault-more-secret"
      ) {
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
