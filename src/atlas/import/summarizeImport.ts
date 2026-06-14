import type { StagingRow } from "./stagingState";

export interface ImportSummary {
  added: number;
  updated: number;
  replaced: number;
  skipped: number;
  couldntBeRead: number;
}

/**
 * Bucket staged rows into plain-language outcome counts.
 * "Couldn't be read" rows (parse error or disallowed path) are checked first so
 * they are never mis-counted as "skipped" even though included===false for both.
 */
export function summarizeImport(rows: StagingRow[]): ImportSummary {
  let added = 0;
  let updated = 0;
  let replaced = 0;
  let skipped = 0;
  let couldntBeRead = 0;

  for (const row of rows) {
    if (row.parseError || !row.pathAllowed) {
      couldntBeRead++;
    } else if (row.included) {
      if (row.rowKind === "create") added++;
      else if (row.rowKind === "update") updated++;
      else replaced++;
    } else {
      skipped++;
    }
  }

  return { added, updated, replaced, skipped, couldntBeRead };
}

/** Compact one-liner showing only non-zero buckets, e.g. "3 added · 1 updated". */
export function formatImportSummaryLine(summary: ImportSummary): string {
  const parts: string[] = [];
  if (summary.added) parts.push(`${summary.added} added`);
  if (summary.updated) parts.push(`${summary.updated} updated`);
  if (summary.replaced) parts.push(`${summary.replaced} replaced`);
  if (summary.skipped) parts.push(`${summary.skipped} skipped`);
  return parts.join(" · ");
}
