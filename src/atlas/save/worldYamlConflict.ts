/**
 * What changed in world.yaml outside the editor, and which of those outside
 * edits a rebuilt save would replace. Used when a world.yaml save hits a
 * conflict: the editor re-reads the file, rebuilds its batch on top, and tells
 * the DM what moved underneath before they Try again.
 *
 * Compares parsed YAML leaf by leaf, so comments and formatting don't count.
 * Arrays of objects with an `id` (maps, layers, regions, routes) are keyed by
 * id, so a path reads `maps.caves.name` rather than `maps.1.name`.
 */
import yaml from "js-yaml";

export interface WorldYamlConflict {
  /** Leaf paths that differ between the editor's old baseline and the file now on disk. */
  changedOutside: string[];
  /** The subset the rebuilt file would replace: Try again overwrites these outside edits. */
  overwritten: string[];
}

const DELETED = "(the whole file was deleted)";

function isIdArray(v: unknown[]): v is { id: string }[] {
  return (
    v.length > 0 &&
    v.every((x) => !!x && typeof x === "object" && typeof (x as { id?: unknown }).id === "string")
  );
}

/** Flatten to path → JSON of each leaf (scalars and id-less arrays). */
function flatten(value: unknown, prefix: string, out: Map<string, string>): void {
  if (Array.isArray(value) && isIdArray(value)) {
    for (const item of value) flatten(item, prefix ? `${prefix}.${item.id}` : item.id, out);
    return;
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0 && prefix) out.set(prefix, "{}");
    for (const [k, v] of entries) {
      // An object's own `id` is already in its path.
      if (k === "id" && prefix) continue;
      flatten(v, prefix ? `${prefix}.${k}` : k, out);
    }
    return;
  }
  out.set(prefix, JSON.stringify(value));
}

function leaves(raw: string | null): Map<string, string> {
  const out = new Map<string, string>();
  if (raw === null) return out;
  let parsed: unknown;
  try {
    parsed = yaml.load(raw);
  } catch {
    // Unparseable: treat the whole document as one changed leaf.
    out.set("(the whole file)", raw);
    return out;
  }
  flatten(parsed ?? {}, "", out);
  return out;
}

/**
 * Collapse leaf paths under a removed or added subtree to the subtree, so a
 * deleted map reads `maps.caves` rather than each of its fields.
 */
function collapse(paths: string[], a: Map<string, string>, b: Map<string, string>): string[] {
  const prefixes = (p: string) =>
    p.split(".").map((_, i, parts) => parts.slice(0, i + 1).join("."));
  const present = (m: Map<string, string>, prefix: string) =>
    [...m.keys()].some((k) => k === prefix || k.startsWith(`${prefix}.`));
  const out = new Set<string>();
  for (const p of paths) {
    // The shortest prefix that exists on only one side names the whole subtree.
    const whole = prefixes(p).find((pre) => present(a, pre) !== present(b, pre));
    out.add(whole ?? p);
  }
  return [...out].sort();
}

function changedPaths(a: Map<string, string>, b: Map<string, string>): string[] {
  const keys = new Set([...a.keys(), ...b.keys()]);
  return collapse(
    [...keys].filter((k) => a.get(k) !== b.get(k)),
    a,
    b,
  );
}

export function describeWorldYamlConflict({
  before,
  after,
  rebuilt,
}: {
  /** The baseline the editor's save was built on (null: it thought there was no file). */
  before: string | null;
  /** The file on disk now (null: deleted). */
  after: string | null;
  /** The world.yaml the editor would write now, rebuilt on top of `after`. */
  rebuilt: string;
}): WorldYamlConflict {
  if (after === null && before !== null) {
    return { changedOutside: [DELETED], overwritten: [] };
  }
  const was = leaves(before);
  const now = leaves(after);
  const next = leaves(rebuilt);
  const changedOutside = changedPaths(was, now);
  const replaced = new Set(changedPaths(now, next));
  const overwritten = changedOutside.filter(
    (p) =>
      replaced.has(p) || [...replaced].some((r) => p.startsWith(`${r}.`) || r.startsWith(`${p}.`)),
  );
  return { changedOutside, overwritten };
}

function list(paths: string[], max = 6): string {
  if (paths.length <= max) return paths.join(", ");
  return `${paths.slice(0, max).join(", ")} and ${paths.length - max} more`;
}

/** The DM-facing notice for a recovered world.yaml conflict. */
export function worldYamlConflictNotice({
  changedOutside,
  overwritten,
}: WorldYamlConflict): string {
  const what =
    changedOutside.length === 0
      ? "only comments or formatting changed"
      : `changed there: ${list(changedOutside)}`;
  const warning =
    overwritten.length > 0
      ? ` Your drafts touch the same settings, so Try again will overwrite these outside edits: ${list(overwritten)}.`
      : "";
  return (
    `world.yaml changed on disk after the editor read it (${what}), so Save was refused and ` +
    "nothing was written. The editor re-read it and the atlas and rebuilt your changes on top; " +
    `the diff below is against the file as it is now. Your changes are kept.${warning} ` +
    "Check the diff, then Try again."
  );
}
