/**
 * How a note's id, title, type and visibility are worked out from its raw
 * markdown. The build, Staging, the merge and the safety scans all call this,
 * so they can never disagree about whether a note ships (code-retro 06).
 *
 * Browser-safe: no node imports. The YAML parser (`./frontmatter`) is the
 * editor's too; it ends the frontmatter where gray-matter did and fails on a
 * fence it can't read cleanly.
 *
 * Rules:
 *   - visibility (ADR-0001): a valid `atlas.visibility`; an invalid one is
 *     `dm` with a warning; with none, the legacy `atlas.publish: true` means
 *     `player`; anything else is `dm`. A top-level `visibility:` isn't read.
 *   - secret: not player-visible, or `atlas.publish: false`.
 *   - title: frontmatter `title` (trimmed); else the filename with dashes
 *     and underscores read as spaces, each word capitalised ("isle-de-marque"
 *     and "Isle de Marque" both give "Isle De Marque"). The build's rule.
 *   - aliases: `atlas.aliases`, else a flat `aliases:`; strings only.
 *   - id: a non-empty `atlas.id`, else the slug of the title.
 *   - type: `atlas.type`, else a flat top-level `type:` (trimmed); undefined
 *     if the note names none. Callers apply their own fallback.
 *   - malformed YAML never throws: the note comes back with `parseError`,
 *     empty data, a filename title, and `dm` (fail closed).
 */
import { parseFrontmatter } from "./frontmatter";
import type { EntityVisibility } from "./schema";
import { isPlayerVisible, isValidVisibility } from "./visibility";
import { slugify } from "./slugify";

export interface Note {
  /** The path the caller passed in (used for the filename title and warnings). */
  relPath: string;
  /** The whole frontmatter mapping (`{}` when there is none or it failed to parse). */
  data: Record<string, unknown>;
  /** The `atlas:` block (`{}` when missing or not a mapping). */
  atlas: Record<string, unknown>;
  /** Everything after the frontmatter. The raw text when the YAML failed to parse. */
  body: string;
  /** May be "" when neither the frontmatter nor the filename gives one. */
  title: string;
  id: string;
  /** True when `id` came from `atlas.id` rather than the title. */
  idFromFrontmatter: boolean;
  type: string | undefined;
  /** Other names the note answers to (wikilink targets, secret names). */
  aliases: string[];
  visibility: EntityVisibility;
  /**
   * True when the note itself decided its visibility (an `atlas.visibility`,
   * valid or not, or `atlas.publish: true`). False means the ADR-0001 default.
   */
  visibilityTagged: boolean;
  /** Must never reach players. */
  isSecret: boolean;
  warnings: string[];
  /** Set when the frontmatter YAML is malformed. */
  parseError?: string;
}

export function readNote(raw: string, relPath: string): Note {
  let data: Record<string, unknown> = {};
  let body: string;
  let parseError: string | undefined;
  try {
    const parsed = parseFrontmatter(raw);
    data = parsed.data;
    body = parsed.content;
  } catch (e) {
    parseError = e instanceof Error ? e.message : String(e);
    body = raw;
  }
  const atlas = isRecord(data.atlas) ? data.atlas : {};
  const warnings: string[] = [];

  let visibility: EntityVisibility = "dm";
  let visibilityTagged = false;
  if (typeof atlas.visibility === "string") {
    visibilityTagged = true;
    if (isValidVisibility(atlas.visibility)) {
      visibility = atlas.visibility;
    } else {
      // Fail-safe: an invalid value must never fall through to a looser default.
      warnings.push(
        `${relPath}: invalid atlas.visibility "${atlas.visibility}" — defaulted to "dm"`,
      );
    }
  } else if (atlas.publish === true) {
    visibility = "player";
    visibilityTagged = true;
  }
  const isSecret = !isPlayerVisible(visibility) || atlas.publish === false;

  const title = noteTitle(relPath, data.title);
  const idFromFrontmatter = typeof atlas.id === "string" && atlas.id.length > 0;
  const id = idFromFrontmatter ? (atlas.id as string) : slugify(title);
  const type = [atlas.type, data.type]
    .find((t): t is string => typeof t === "string" && t.trim().length > 0)
    ?.trim();
  const aliases = stringList(atlas.aliases ?? data.aliases);

  return {
    relPath,
    data,
    atlas,
    body,
    title,
    id,
    idFromFrontmatter,
    type,
    aliases,
    visibility,
    visibilityTagged,
    isSecret,
    warnings,
    ...(parseError !== undefined ? { parseError } : {}),
  };
}

function noteTitle(relPath: string, fmTitle: unknown): string {
  if (typeof fmTitle === "string" && fmTitle.trim()) return fmTitle.trim();
  const base = relPath.split(/[\\/]/).pop() ?? "";
  return base
    .replace(/\.md$/i, "")
    .replace(/[-_]+/g, " ")
    .trim()
    .replace(/(^|\s)(\p{L})/gu, (_m, sp: string, ch: string) => sp + ch.toUpperCase());
}

function stringList(v: unknown): string[] {
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === "string");
  return typeof v === "string" && v ? [v] : [];
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
