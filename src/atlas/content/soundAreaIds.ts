/**
 * Sound-area ids on one map that can't be trusted to name one area: blank or
 * missing ids, and ids two areas share. The player build looks verdicts up by
 * map and id, and the v1 adapter skips malformed areas, so a skipped area
 * sharing a shipped area's id would borrow its verdict. The strict player
 * build fails on any of these and the Publish Check blocks on the same list;
 * every build drops every area they name (fail closed).
 */
export interface SoundAreaIdProblem {
  kind: "missing-id" | "duplicate-id";
  /** The shared id, or "" for a missing one. */
  id: string;
  /** How many areas on the map have it. */
  count: number;
}

export function soundAreaIdProblems(areas: readonly { id?: unknown }[]): SoundAreaIdProblem[] {
  const counts = new Map<string, number>();
  let missing = 0;
  for (const a of areas) {
    if (typeof a.id !== "string" || a.id.trim() === "") missing += 1;
    else counts.set(a.id, (counts.get(a.id) ?? 0) + 1);
  }
  const out: SoundAreaIdProblem[] = [];
  if (missing > 0) out.push({ kind: "missing-id", id: "", count: missing });
  for (const [id, count] of counts) if (count > 1) out.push({ kind: "duplicate-id", id, count });
  return out;
}

/** Whether this area's id names it alone, so its own resolver verdict applies. */
export function soundAreaIdTrusted(
  area: { id?: unknown },
  problems: readonly SoundAreaIdProblem[],
): boolean {
  if (typeof area.id !== "string" || area.id.trim() === "") return false;
  return !problems.some((p) => p.kind === "duplicate-id" && p.id === area.id);
}
