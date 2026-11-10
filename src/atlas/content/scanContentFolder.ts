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
 * Exclude globs fail closed (R-07): a leading or inner `**` + `/` also means
 * zero folders, so `**` + `/_dm/**` catches `_dm/` right under the content
 * root, and they match case-blind, so `_DM/` and `Archive/` are caught too
 * (the Mac's file system is case-blind). Include globs keep the strict
 * reading (`**` + `/*.md` needs a folder, so a stray note at the content
 * root stays unread): widening them would read more, not less.
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
  const include = rules.include.map((g) => globToRegExp(g));
  const exclude = rules.exclude.map((g) => globToRegExp(g, { failClosed: true }));
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

/**
 * `failClosed` (exclude globs): the glob is normalised first (a backslash read as
 * `/`, a leading `/` or `./` dropped, a trailing `/` read as `/**`), every
 * regex character is literal (`[dm]` is a folder name, not a class), `**` + `/`
 * may match zero folders, and the match ignores case. Include globs keep the
 * plain reading.
 */
function globToRegExp(glob: string, opts: { failClosed?: boolean } = {}): RegExp {
  const source = opts.failClosed ? normaliseExcludeGlob(glob) : glob;
  const meta = opts.failClosed ? /[.+^${}()|[\]\\]/g : /[.+^${}()|\\]/g;
  let escaped = source
    .replace(meta, "\\$&")
    .replace(/\*\*\//g, opts.failClosed ? "::DSTARSLASH::" : "::DSTAR::/")
    .replace(/\*\*/g, "::DSTAR::")
    .replace(/\*/g, "[^/]*")
    .replace(/\?/g, ".");
  escaped = escaped.replace(/::DSTARSLASH::/g, "(?:.*/)?").replace(/::DSTAR::/g, ".*");
  return new RegExp(`^${escaped}$`, opts.failClosed ? "i" : "");
}

function normaliseExcludeGlob(glob: string): string {
  let g = glob.replace(/\\/g, "/").replace(/\/{2,}/g, "/");
  while (g.startsWith("./") || g.startsWith("/")) g = g.startsWith("/") ? g.slice(1) : g.slice(2);
  if (g.endsWith("/")) g += "**";
  return g;
}
