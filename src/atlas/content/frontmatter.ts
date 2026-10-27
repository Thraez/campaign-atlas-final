/**
 * Browser-safe frontmatter parser/serializer.
 *
 * Drop-in replacement for the two gray-matter call shapes the editor uses:
 *
 *   matter(raw)                  -> parseFrontmatter(raw)
 *   matter.stringify(content, d) -> stringifyFrontmatter(content, d)
 *
 * gray-matter pulls in Node's Buffer via its toBuffer guard and crashes in
 * real browsers with `Buffer is not defined`. jsdom (the vitest env) exposes
 * Buffer, which is why the regression slipped past tests. js-yaml is already
 * a dependency and is browser-safe.
 *
 * Anything fancy (excerpts, custom delimiters, alternate engines) is
 * intentionally not implemented — the editor only ever needs YAML between
 * `---` fences. If you need more, reconsider whether the call site really
 * belongs in the browser-shipped bundle.
 */
import yaml from "js-yaml";

export interface ParsedFrontmatter {
  data: Record<string, unknown>;
  content: string;
}

/** A clean fence line: `---` plus optional spaces or tabs. */
const CLEAN_FENCE_RE = /^---[ \t]*$/;

/**
 * Parse a string with optional YAML frontmatter. Returns the parsed data
 * (or `{}` if there's no frontmatter / the YAML is empty) and the body
 * exactly as it appears after the closing fence (no leading-newline trim,
 * matching gray-matter).
 *
 * Fail closed against gray-matter (code-retro 06): anything gray-matter would
 * read as frontmatter is either read the same way here or throws, never
 * comes back as "no frontmatter". gray-matter opens on any first line that
 * starts with `---` (`--- `, `---yaml`), ends at the next line that starts
 * with `---`, and runs to the end of the file when there is none. So:
 *
 *   - a first line starting with `---` must be a clean fence (`---` plus
 *     optional spaces or tabs), else it throws;
 *   - the first later line starting with `---` must also be clean, else it
 *     throws (reading past `---x: 1` could pick up keys gray-matter never
 *     saw, such as a stray `atlas.visibility: player`);
 *   - an opening fence with no closing fence throws.
 *
 * Throws on malformed YAML or a malformed fence — callers that need
 * tolerance should wrap. `readNote` turns a throw into `dm`, and the build
 * stops on it.
 */
export function parseFrontmatter(raw: string): ParsedFrontmatter {
  // Strip a leading BOM so `---` matches at column 0.
  const stripped = raw.replace(/^\uFEFF/, "");
  if (!stripped.startsWith("---")) return { data: {}, content: stripped };

  const firstNl = stripped.indexOf("\n");
  const firstLine = (firstNl === -1 ? stripped : stripped.slice(0, firstNl)).replace(/\r$/, "");
  if (!CLEAN_FENCE_RE.test(firstLine)) {
    throw new Error(`frontmatter fence "${firstLine}" is not a clean opening "---"`);
  }
  if (firstNl === -1) throw new Error("frontmatter opening fence has no closing fence");

  const yamlStart = firstNl + 1;
  let lineStart = yamlStart;
  while (lineStart < stripped.length) {
    const nl = stripped.indexOf("\n", lineStart);
    const lineEnd = nl === -1 ? stripped.length : nl;
    const line = stripped.slice(lineStart, lineEnd).replace(/\r$/, "");
    if (line.startsWith("---")) {
      if (!CLEAN_FENCE_RE.test(line)) {
        throw new Error(`frontmatter fence "${line}" is not a clean closing "---"`);
      }
      const parsed = yaml.load(stripped.slice(yamlStart, lineStart));
      const data =
        parsed && typeof parsed === "object" && !Array.isArray(parsed)
          ? (parsed as Record<string, unknown>)
          : {};
      const content = nl === -1 ? "" : stripped.slice(nl + 1);
      return { data, content };
    }
    if (nl === -1) break;
    lineStart = nl + 1;
  }
  throw new Error("frontmatter opening fence has no closing fence");
}

/**
 * Serialize content + data back into a frontmattered string. Matches
 * gray-matter's output:
 *
 *   - empty data    -> omit the frontmatter block entirely
 *   - non-empty data -> "---\n<yaml>---\n<content>" with exactly one trailing
 *     newline added when the content doesn't already end with one (multiple
 *     trailing newlines in the source are preserved verbatim)
 */
export function stringifyFrontmatter(content: string, data: Record<string, unknown>): string {
  const hasKeys = data && Object.keys(data).length > 0;
  const body = content.endsWith("\n") ? content : `${content}\n`;
  if (!hasKeys) return body;
  const AMBIGUOUS = /^(?:true|false|null|~|-?\d+(?:\.\d+)?|\d{1,4}-\d{1,2}-\d{1,2}.*)$/i;
  const hasAmbiguous = JSON.stringify(data).match(AMBIGUOUS) != null;
  const yamlText = yaml.dump(data, {
    lineWidth: -1, // never fold → no '>' or '|' multiline scalars
    noRefs: true, // no YAML anchors/aliases
    quotingType: '"', // consistent double-quote style Obsidian accepts
    forceQuotes: hasAmbiguous, // force-quote ALL strings when any ambiguous value present
    sortKeys: false, // preserve author key order
  });
  return `---\n${yamlText}---\n${body}`;
}
