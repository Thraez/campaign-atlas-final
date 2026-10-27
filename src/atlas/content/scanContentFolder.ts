/**
 * Splits a content folder's notes into the ones the build reads and the ones
 * it only knows by name (folder-excluded by `atlas.config.json`: `_dm/`,
 * `_drafts/`, ... and anything the `include` globs miss). The build and the
 * derived-secrets scan both use it, so the scan treats exactly the notes the
 * build never ships as secret (code-retro 06).
 *
 * Browser-safe: the caller lists and reads the files (see
 * `scripts/atlas/readContentFiles.ts`); this only decides.
 *
 * A note is excluded when its path, or any folder above it, matches an
 * `exclude` glob, or when `include` is non-empty and its path matches none.
 * Globs: `**` any depth, `*` within one segment, `?` one character, matched
 * against the content-root-relative POSIX path.
 *
 * Throws when any note's frontmatter is malformed: the build must not guess
 * what such a note is.
 */
import { readNote, type Note } from "./readNote";

export interface ContentFile {
  /** Path relative to the content root, POSIX. Matched against the globs. */
  contentPath: string;
  /** Path handed to readNote (titles and warnings). */
  relPath: string;
  raw: string;
}

export interface ContentRules {
  include: readonly string[];
  exclude: readonly string[];
}

export interface ContentScan {
  /** Notes the build reads, in the order given. */
  notes: Note[];
  /** Notes the build never reads or ships, in the order given. */
  excluded: Note[];
}

export function scanContentFolder(
  files: readonly ContentFile[],
  rules: ContentRules,
): ContentScan {
  const include = rules.include.map(globToRegExp);
  const exclude = rules.exclude.map(globToRegExp);
  const notes: Note[] = [];
  const excluded: Note[] = [];
  for (const f of files) {
    const note = readNote(f.raw, f.relPath);
    if (note.parseError !== undefined) {
      throw new Error(`${f.relPath}: malformed frontmatter: ${note.parseError}`);
    }
    if (isExcluded(f.contentPath, include, exclude)) excluded.push(note);
    else notes.push(note);
  }
  return { notes, excluded };
}

function isExcluded(contentPath: string, include: RegExp[], exclude: RegExp[]): boolean {
  const segs = contentPath.split("/");
  for (let i = 1; i <= segs.length; i++) {
    const prefix = segs.slice(0, i).join("/");
    if (exclude.some((re) => re.test(prefix))) return true;
  }
  return include.length > 0 && !include.some((re) => re.test(contentPath));
}

function globToRegExp(glob: string): RegExp {
  const escaped = glob
    .replace(/[.+^${}()|\\]/g, "\\$&")
    .replace(/\*\*/g, "::DSTAR::")
    .replace(/\*/g, "[^/]*")
    .replace(/::DSTAR::/g, ".*")
    .replace(/\?/g, ".");
  return new RegExp(`^${escaped}$`);
}
