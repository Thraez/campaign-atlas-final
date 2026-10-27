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

const OPEN_FENCE_RE = /^---\r?\n/;
const CLEAN_CLOSE_RE = /^---[ \t]*$/;

/**
 * Parse a string with optional YAML frontmatter. Returns the parsed data
 * (or `{}` if there's no frontmatter / the YAML is empty) and the body
 * exactly as it appears after the closing fence (no leading-newline trim,
 * matching gray-matter).
 *
 * The frontmatter ends at the first line that starts with `---`, as in
 * gray-matter. That line must be a clean fence (`---` plus optional spaces):
 * anything else (`---x: 1`, `----`) throws instead of being read past, which
 * could pick up keys gray-matter never saw, such as a stray
 * `atlas.visibility: player` (code-retro 06). No closing fence means no
 * frontmatter.
 *
 * Throws on malformed YAML or a malformed fence — callers that need
 * tolerance should wrap. `readNote` turns a throw into `dm`.
 */
export function parseFrontmatter(raw: string): ParsedFrontmatter {
  // Strip a leading BOM so `---` matches at column 0.
  const stripped = raw.replace(/^\uFEFF/, "");
  const open = stripped.match(OPEN_FENCE_RE);
  if (!open) return { data: {}, content: stripped };

  let lineStart = open[0].length;
  while (lineStart < stripped.length) {
    const nl = stripped.indexOf("\n", lineStart);
    const lineEnd = nl === -1 ? stripped.length : nl;
    const line = stripped.slice(lineStart, lineEnd).replace(/\r$/, "");
    if (line.startsWith("---")) {
      if (!CLEAN_CLOSE_RE.test(line)) {
        throw new Error(`frontmatter fence "${line}" is not a clean closing "---"`);
      }
      const parsed = yaml.load(stripped.slice(open[0].length, lineStart));
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
  return { data: {}, content: stripped };
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
