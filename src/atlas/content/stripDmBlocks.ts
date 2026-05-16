// Strip Obsidian comment blocks: %% ... %% (single or multi-line) AND
// field-level DM callouts: :::dm ... ::: (multi-line, paragraph-level).
//
// Both syntaxes are stripped from player builds. `%%` is the Obsidian-native
// inline comment; `:::dm` is the project's own callout-style block, easier to
// read in prose and one-click insertable from the editor.
//
// Returns cleaned text, the number of blocks removed, and whether the input
// had an unbalanced `%%` delimiter or an unclosed `:::dm` callout outside
// fenced code — both are hard build errors, since an unclosed block can leak
// everything after it.
export function stripDmBlocks(input: string): {
  text: string;
  count: number;
  unbalanced: boolean;
} {
  let count = 0;

  // Strip :::dm ... ::: callouts first. The closing fence is a line that
  // contains only ::: (allowing whitespace around it). The opening fence is
  // a line that contains only :::dm (with optional whitespace). Multi-line.
  let text = input.replace(/^[ \t]*:::dm[ \t]*\r?\n[\s\S]*?^[ \t]*:::[ \t]*$\r?\n?/gm, () => {
    count += 1;
    return "";
  });

  // Strip %% ... %% blocks.
  text = text.replace(/%%[\s\S]*?%%/g, () => {
    count += 1;
    return "";
  });

  // Detect unclosed %% by counting %% occurrences in the input with fenced
  // code blocks stripped (so a literal %% inside ``` ... ``` is excluded).
  // Inline code spans are NOT excluded — a DM who literally writes `%%` in
  // single backticks will get a false positive, which is rare enough in
  // fantasy prose to be acceptable.
  const withoutFences = input.replace(/```[\s\S]*?```/g, "");
  const pctOccurrences = withoutFences.match(/%%/g) ?? [];
  const pctUnbalanced = pctOccurrences.length % 2 !== 0;

  // Detect unclosed :::dm callout by counting opens vs closes outside fences.
  // A line that starts with :::dm is an open; a line that is exactly ::: is
  // the matching close (we require nesting parity, not pairing — an unmatched
  // :::dm with no following ::: is an error).
  const opens = (withoutFences.match(/^[ \t]*:::dm[ \t]*$/gm) ?? []).length;
  const closes = (withoutFences.match(/^[ \t]*:::[ \t]*$/gm) ?? []).length;
  const calloutUnbalanced = opens > closes;

  const unbalanced = pctUnbalanced || calloutUnbalanced;

  // Collapse runs of >2 blank lines left behind by stripping.
  return {
    text: text.replace(/\n{3,}/g, "\n\n"),
    count,
    unbalanced,
  };
}

// Strip both `%%...%%` and `:::dm...:::` from a single shipping string
// (summary, alias, tag, label, region/route name, profile freeform value).
// Whitespace is collapsed because removing an inline block typically leaves
// extra whitespace. `:::dm` is paragraph-level so it rarely appears mid-string,
// but we strip it anyway for defense-in-depth.
export function stripDmFromShippingString(s: string | undefined): string | undefined {
  if (typeof s !== "string") return s;
  if (!s.includes("%%") && !s.includes(":::dm")) return s;
  return s
    .replace(/:::dm[\s\S]*?:::/g, "")
    .replace(/%%[\s\S]*?%%/g, "")
    .replace(/[ \t]+/g, " ")
    .trim();
}
