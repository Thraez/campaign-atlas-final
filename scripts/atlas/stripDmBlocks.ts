// Strip Obsidian comment blocks: %% ... %% (single or multi-line).
// Returns cleaned text, the number of blocks removed, and whether the input
// had an unbalanced %% delimiter outside fenced code (likely an unclosed DM
// block — a hard build error, since an unclosed block can leak everything
// after it).
export function stripDmBlocks(input: string): {
  text: string;
  count: number;
  unbalanced: boolean;
} {
  let count = 0;
  const text = input.replace(/%%[\s\S]*?%%/g, () => {
    count += 1;
    return "";
  });
  // Detect unclosed %% by counting %% occurrences in the input with fenced
  // code blocks stripped (so a literal %% inside ``` ... ``` is excluded).
  // Inline code spans are NOT excluded — a DM who literally writes `%%` in
  // single backticks will get a false positive, which is rare enough in
  // fantasy prose to be acceptable.
  const withoutFences = input.replace(/```[\s\S]*?```/g, "");
  const occurrences = withoutFences.match(/%%/g) ?? [];
  const unbalanced = occurrences.length % 2 !== 0;
  // Collapse runs of >2 blank lines left behind
  return {
    text: text.replace(/\n{3,}/g, "\n\n"),
    count,
    unbalanced,
  };
}

// Strip %% ... %% from a single shipping string (summary, alias, tag, label,
// region/route name, profile freeform value). Whitespace is collapsed because
// removing a mid-string `%%...%%` block typically leaves two spaces.
export function stripDmFromShippingString(s: string | undefined): string | undefined {
  if (typeof s !== "string") return s;
  if (!s.includes("%%")) return s;
  return s
    .replace(/%%[\s\S]*?%%/g, "")
    .replace(/[ \t]+/g, " ")
    .trim();
}
