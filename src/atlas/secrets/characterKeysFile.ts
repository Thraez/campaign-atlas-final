import yaml from "js-yaml";

/**
 * The one reader and writer for `content/<world>/_dm/character-keys.yaml`
 * (DM-only: character name -> secret key). Used by the Character Keys panel and
 * by the entity panel's "for:" dropdown. The build reads the file on its own in
 * `scripts/build-atlas.ts` (strings only); `serializeCharacterKeys` always
 * writes strings, so every key saved here reaches it.
 *
 * Nothing here logs, and error messages never quote the file, so key values
 * stay out of consoles and toasts.
 */

export interface CharacterKeyEntry {
  name: string;
  key: string;
}

export type CharacterKeysParse =
  | {
      ok: true;
      /** Entries that are a name and a key, in file order. */
      entries: CharacterKeyEntry[];
      /** Names whose value isn't a single key (empty, nested map, list). */
      unsupported: string[];
    }
  | { ok: false; error: string };

const isScalar = (v: unknown) =>
  typeof v === "number" || typeof v === "boolean" || v instanceof Date;

export function parseCharacterKeys(text: string): CharacterKeysParse {
  let typed: unknown;
  let literal: unknown;
  try {
    typed = yaml.load(text);
    // Failsafe keeps every scalar as the text that was typed, so a hand-edited
    // `Bob: 0123` stays "0123" rather than becoming the number 123.
    literal = yaml.load(text, { schema: yaml.FAILSAFE_SCHEMA });
  } catch (e) {
    if (e instanceof yaml.YAMLException) {
      const line = e.mark ? ` on line ${e.mark.line + 1}` : "";
      return { ok: false, error: `it isn't valid YAML (${e.reason}${line})` };
    }
    return { ok: false, error: "it isn't valid YAML" };
  }
  if (typed === null || typed === undefined) return { ok: true, entries: [], unsupported: [] };
  if (typeof typed !== "object" || Array.isArray(typed)) {
    return { ok: false, error: "it isn't a list of names and keys" };
  }
  const literalMap =
    literal && typeof literal === "object" && !Array.isArray(literal)
      ? (literal as Record<string, unknown>)
      : {};
  const entries: CharacterKeyEntry[] = [];
  const unsupported: string[] = [];
  for (const [name, value] of Object.entries(typed as Record<string, unknown>)) {
    if (typeof value === "string") {
      entries.push({ name, key: value });
    } else if (isScalar(value)) {
      const text = literalMap[name];
      entries.push({ name, key: typeof text === "string" ? text : String(value) });
    } else {
      unsupported.push(name);
    }
  }
  return { ok: true, entries, unsupported };
}

/** YAML for the given rows. Blank names are skipped; names are trimmed. */
export function serializeCharacterKeys(entries: readonly CharacterKeyEntry[]): string {
  const obj: Record<string, string> = Object.create(null) as Record<string, string>;
  for (const { name, key } of entries) {
    const trimmed = name.trim();
    if (trimmed) obj[trimmed] = key;
  }
  return yaml.dump(obj);
}

export interface CharacterKeysRebase {
  /** The DM's rows moved onto the file as it is now. */
  rows: CharacterKeyEntry[];
  /** Names added, removed or given another key on disk since `base` was read. */
  added: string[];
  removed: string[];
  changed: string[];
  /** Of those, the names where the DM's rows win, so a save overwrites the disk. */
  overwritten: string[];
}

/**
 * Move unsaved rows onto a file that changed on disk (a save conflict). `base`
 * is the file as last read, `mine` the rows on screen, `theirs` the file now.
 * A row the DM didn't touch follows the disk (new key, or gone); a row the DM
 * edited, added or removed keeps the DM's version; names added on disk that
 * the DM doesn't have are appended. Blank-name rows are kept as they are.
 */
export function rebaseCharacterKeys(
  base: readonly CharacterKeyEntry[],
  mine: readonly CharacterKeyEntry[],
  theirs: readonly CharacterKeyEntry[],
): CharacterKeysRebase {
  const baseMap = new Map(base.map((e) => [e.name, e.key]));
  const theirsMap = new Map(theirs.map((e) => [e.name, e.key]));
  const mineNames = new Set(mine.map((r) => r.name.trim()).filter(Boolean));

  const rows: CharacterKeyEntry[] = [];
  for (const row of mine) {
    const name = row.name.trim();
    const untouched = name !== "" && baseMap.get(name) === row.key;
    if (!untouched) {
      rows.push(row);
    } else if (theirsMap.has(name)) {
      rows.push({ ...row, key: theirsMap.get(name)! });
    }
  }
  for (const e of theirs) {
    if (!baseMap.has(e.name) && !mineNames.has(e.name)) rows.push(e);
  }

  const added = theirs.filter((e) => !baseMap.has(e.name)).map((e) => e.name);
  const removed = base.filter((e) => !theirsMap.has(e.name)).map((e) => e.name);
  const changed = base
    .filter((e) => theirsMap.has(e.name) && theirsMap.get(e.name) !== e.key)
    .map((e) => e.name);

  const finalMap = new Map<string, string>();
  for (const r of rows) if (r.name.trim()) finalMap.set(r.name.trim(), r.key);
  const overwritten = [...added, ...removed, ...changed].filter(
    (n) => finalMap.get(n) !== theirsMap.get(n),
  );
  return { rows, added, removed, changed, overwritten };
}
