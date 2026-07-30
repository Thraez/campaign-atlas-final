/** Short form of a git sha for display (first 7 chars, the conventional abbreviation length). */
export function shortCommit(commit: string): string {
  return commit.slice(0, 7);
}

/**
 * Plain-language summary of what a publish shipped, e.g. "Published 5 entities
 * and 3 pins (commit a1b2c3d)." Degrades when a count is zero (omitted from the
 * list) or all counts are zero (just "Published (commit …)."), and when no
 * commit is known (drops the trailing parenthetical).
 */
export function formatPublishSummary(
  counts: { entities: number; placements: number },
  commit?: string,
): string {
  const parts: string[] = [];
  if (counts.entities > 0) {
    parts.push(`${counts.entities} ${counts.entities === 1 ? "entity" : "entities"}`);
  }
  if (counts.placements > 0) {
    parts.push(`${counts.placements} ${counts.placements === 1 ? "pin" : "pins"}`);
  }
  const body = parts.length > 0 ? `Published ${parts.join(" and ")}` : "Published";
  return commit ? `${body} (commit ${shortCommit(commit)}).` : `${body}.`;
}
