/**
 * Moving pins out of, and back into, a note's frontmatter as text (R-20).
 *
 * The migration must leave a note's other frontmatter and its body
 * byte-identical, so it edits lines rather than parsing and re-dumping the
 * YAML. Every edit is checked by parsing the result: the frontmatter must
 * read exactly as before apart from the pin fields, or the edit is refused
 * (fail closed: the caller refuses the migration and names the note).
 *
 * Only block-style `atlas:` is edited. A flow-style one (`atlas: { ... }`)
 * that holds a pin is refused.
 */
import { isDeepStrictEqual } from "node:util";
import { parseFrontmatter } from "../../../src/atlas/content/frontmatter";

/** The frontmatter keys under `atlas:` that place a note on a map in v1. */
export const PIN_KEYS = ["placements", "x", "y"] as const;

/** A v1 placement as the down-migration writes it. */
export interface PlacementText {
  mapId: string;
  x: number;
  y: number;
}

export type NoteEdit = { ok: true; raw: string } | { ok: false; reason: string };

interface Split {
  /** Everything before the first YAML line (BOM and the opening fence). */
  head: string;
  /** The frontmatter's lines, each with its own line ending. */
  lines: string[];
  /** The closing fence and the body, untouched. */
  tail: string;
  eol: string;
}

/** Split a note at its frontmatter; null when it has none. */
function split(raw: string): Split | null {
  const bom = raw.startsWith("\uFEFF") ? "\uFEFF" : "";
  const s = raw.slice(bom.length);
  if (!/^---[ \t]*\r?\n/.test(s)) return null;
  const firstNl = s.indexOf("\n");
  const eol = s[firstNl - 1] === "\r" ? "\r\n" : "\n";
  const lines: string[] = [];
  let at = firstNl + 1;
  while (at < s.length) {
    const nl = s.indexOf("\n", at);
    const end = nl === -1 ? s.length : nl + 1;
    const line = s.slice(at, end);
    if (line.startsWith("---")) {
      return { head: bom + s.slice(0, firstNl + 1), lines, tail: s.slice(at), eol };
    }
    lines.push(line);
    at = end;
  }
  return null;
}

const bare = (line: string) => line.replace(/\r?\n$/, "");
const isBlankOrComment = (line: string) => /^\s*(#.*)?$/.test(bare(line));
const indentOf = (line: string) => /^ */.exec(line)![0].length;

/** The `atlas:` block: its key line and the index after its last line, or null. */
function atlasBlock(lines: string[]): { key: number; end: number; flow: boolean } | null {
  const key = lines.findIndex((l) => /^atlas[ \t]*:/.test(l));
  if (key < 0) return null;
  const flow = !/^atlas[ \t]*:[ \t]*(#.*)?$/.test(bare(lines[key]));
  let end = key + 1;
  while (end < lines.length && (isBlankOrComment(lines[end]) || indentOf(lines[end]) > 0)) end++;
  // Trailing blank or comment lines belong to whatever follows.
  while (end > key + 1 && isBlankOrComment(lines[end - 1])) end--;
  return { key, end, flow };
}

function atlasOf(data: Record<string, unknown>): Record<string, unknown> | undefined {
  const a = data.atlas;
  return a && typeof a === "object" && !Array.isArray(a)
    ? (a as Record<string, unknown>)
    : undefined;
}

function parse(raw: string): Record<string, unknown> | string {
  try {
    return parseFrontmatter(raw).data;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

/** True when the note's frontmatter places it on a map (`atlas.placements`, `x` or `y`). */
export function hasPinFields(raw: string): boolean {
  const data = parse(raw);
  if (typeof data === "string") return false;
  const atlas = atlasOf(data);
  return !!atlas && PIN_KEYS.some((k) => atlas[k] !== undefined);
}

/**
 * The note with `atlas.placements`, `atlas.x` and `atlas.y` removed, and an
 * `atlas:` left empty removed with them. Every other line is kept as it was.
 */
export function stripPinFields(raw: string): NoteEdit {
  const before = parse(raw);
  if (typeof before === "string")
    return { ok: false, reason: `frontmatter can't be read: ${before}` };
  const atlas = atlasOf(before);
  if (!atlas || !PIN_KEYS.some((k) => atlas[k] !== undefined)) return { ok: true, raw };
  const parts = split(raw)!;
  const block = atlasBlock(parts.lines);
  if (!block) return { ok: false, reason: "atlas: block not found" };
  if (block.flow) {
    return {
      ok: false,
      reason: "atlas: is written flow-style ({ ... }); write it as a block first",
    };
  }
  const body = parts.lines.slice(block.key + 1, block.end);
  const child = body.find((l) => !isBlankOrComment(l));
  const childIndent = child ? indentOf(child) : 2;
  const keyRe = new RegExp(`^ {${childIndent}}(?:placements|x|y|"x"|"y"|'x'|'y')[ \\t]*:`);
  const kept: string[] = [];
  for (let i = 0; i < body.length; i++) {
    if (!keyRe.test(body[i])) {
      kept.push(body[i]);
      continue;
    }
    // Skip the key's value: deeper lines, and a block sequence at the key's own indent.
    let j = i + 1;
    while (
      j < body.length &&
      (isBlankOrComment(body[j]) ||
        indentOf(body[j]) > childIndent ||
        (indentOf(body[j]) === childIndent && /^ *-(\s|$)/.test(body[j])))
    ) {
      j++;
    }
    while (j > i + 1 && isBlankOrComment(body[j - 1])) j--;
    i = j - 1;
  }
  const empty = kept.every(isBlankOrComment);
  const lines = [
    ...parts.lines.slice(0, block.key),
    ...(empty ? [] : [parts.lines[block.key]]),
    ...kept,
    ...parts.lines.slice(block.end),
  ];
  const out = parts.head + lines.join("") + parts.tail;

  const expected = structuredClone(before);
  const expAtlas = atlasOf(expected)!;
  for (const k of PIN_KEYS) delete expAtlas[k];
  if (Object.keys(expAtlas).length === 0) delete expected.atlas;
  const after = parse(out);
  if (typeof after === "string" || !isDeepStrictEqual(after, expected)) {
    return { ok: false, reason: "removing the pin fields would change other frontmatter" };
  }
  return { ok: true, raw: out };
}

function placementLines(pins: PlacementText[], indent: string, eol: string): string[] {
  const n = (v: number) => String(v);
  return pins.flatMap((p) => [
    `${indent}  - mapId: ${JSON.stringify(p.mapId)}${eol}`,
    `${indent}    x: ${n(p.x)}${eol}`,
    `${indent}    "y": ${n(p.y)}${eol}`,
  ]);
}

/**
 * The note with `atlas.placements` set to `pins` (the down-migration). A note
 * that already has pin fields is refused; one with no frontmatter gets one.
 */
export function addPlacements(raw: string, pins: PlacementText[]): NoteEdit {
  if (pins.length === 0) return { ok: true, raw };
  const before = parse(raw);
  if (typeof before === "string")
    return { ok: false, reason: `frontmatter can't be read: ${before}` };
  const atlas = atlasOf(before);
  if (atlas && PIN_KEYS.some((k) => atlas[k] !== undefined)) {
    return { ok: false, reason: "the note already has pin fields" };
  }
  if (before.atlas !== undefined && before.atlas !== null && !atlas) {
    return { ok: false, reason: "atlas: is not a mapping" };
  }
  let out: string;
  const parts = split(raw);
  if (!parts) {
    const eol = raw.includes("\r\n") ? "\r\n" : "\n";
    const bom = raw.startsWith("\uFEFF") ? "\uFEFF" : "";
    out =
      `${bom}---${eol}atlas:${eol}  placements:${eol}` +
      placementLines(pins, "  ", eol).join("") +
      `---${eol}` +
      raw.slice(bom.length);
  } else {
    const block = atlasBlock(parts.lines);
    const { eol } = parts;
    if (block && block.flow && atlas && Object.keys(atlas).length > 0) {
      return {
        ok: false,
        reason: "atlas: is written flow-style ({ ... }); write it as a block first",
      };
    }
    if (!block) {
      const lines = [...parts.lines];
      if (lines.length > 0 && !/\n$/.test(lines[lines.length - 1])) lines[lines.length - 1] += eol;
      lines.push(`atlas:${eol}`, `  placements:${eol}`, ...placementLines(pins, "  ", eol));
      out = parts.head + lines.join("") + parts.tail;
    } else {
      const body = parts.lines.slice(block.key + 1, block.end);
      const child = body.find((l) => !isBlankOrComment(l));
      const indent = " ".repeat(child ? indentOf(child) : 2);
      const last = parts.lines.slice(0, block.end);
      if (block.flow) last[block.key] = `atlas:${eol}`; // `atlas: {}` or `atlas: null`
      if (!/\n$/.test(last[last.length - 1])) last[last.length - 1] += eol;
      const lines = [
        ...last,
        `${indent}placements:${eol}`,
        ...placementLines(pins, indent, eol),
        ...parts.lines.slice(block.end),
      ];
      out = parts.head + lines.join("") + parts.tail;
    }
  }
  const expected = structuredClone(before);
  expected.atlas = {
    ...(atlas ?? {}),
    placements: pins.map((p) => ({ mapId: p.mapId, x: p.x, y: p.y })),
  };
  const after = parse(out);
  if (typeof after === "string" || !isDeepStrictEqual(after, expected)) {
    return { ok: false, reason: "adding the placements would change other frontmatter" };
  }
  return { ok: true, raw: out };
}
