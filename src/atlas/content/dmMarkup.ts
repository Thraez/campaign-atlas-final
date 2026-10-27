/**
 * DM markup: the one owner of every syntax that hides text from players
 * (eval-2026-10/02). The build strips with these functions and the safety
 * scans detect with `findDmMarkup`, so a syntax the build strips is always
 * one the scans look for.
 *
 *   %% ... %%            DM block: Obsidian comment, inline or multi-line
 *   :::dm ... :::        DM block: the project's own callout, paragraph-level
 *   {{secret:id}}        secret marker; players get a sealed box or nothing
 *
 * `:::dm` matches in any case (`:::DM` too): an author who typed it meant it.
 */

// Patterns. Keep each one here; callers use the functions below.
const OBSIDIAN_COMMENT_G = /%%[\s\S]*?%%/g;
const PCT_DELIMITER = /%%/;
const PCT_DELIMITER_G = /%%/g;
/** A `:::dm` callout as authored in a body: fence lines on their own. */
const DM_CALLOUT_BLOCK_G = /^[ \t]*:::dm[ \t]*\r?\n[\s\S]*?^[ \t]*:::[ \t]*$\r?\n?/gim;
/** A `:::dm` callout squeezed into a single shipping string. */
const DM_CALLOUT_INLINE_G = /:::dm[\s\S]*?:::/gi;
const DM_CALLOUT_OPEN = /:::dm/i;
const DM_CALLOUT_OPEN_LINE_G = /^[ \t]*:::dm[ \t]*$/gim;
const CALLOUT_CLOSE_LINE_G = /^[ \t]*:::[ \t]*$/gm;
const FENCED_CODE_G = /```[\s\S]*?```/g;
const SECRET_MARKER = /\{\{secret:([^}]+)\}\}/;
const SECRET_MARKER_G = new RegExp(SECRET_MARKER.source, "g");

export type DmSyntax = "%%" | ":::dm" | "{{secret:";

/**
 * The first DM syntax left in `s`, or null when none is. Any `%%` counts,
 * paired or not: a lone one means the rest of a note may have leaked.
 */
export function findDmMarkup(s: string): DmSyntax | null {
  if (PCT_DELIMITER.test(s)) return "%%";
  if (DM_CALLOUT_OPEN.test(s)) return ":::dm";
  if (SECRET_MARKER.test(s)) return "{{secret:";
  return null;
}

/** True when `s` holds at least one {{secret:id}} marker. */
export function hasSecretMarker(s: string): boolean {
  return SECRET_MARKER.test(s);
}

/** Removes {{secret:id}} markers from body text before it ships to players. */
export function stripSecretMarkers(s: string): string {
  return s.replace(SECRET_MARKER_G, "");
}

/** Replaces each {{secret:id}} marker with `fn(id)` (the raw id, untrimmed). */
export function replaceSecretMarkers(s: string, fn: (id: string) => string): string {
  return s.replace(SECRET_MARKER_G, (_m, id: string) => fn(id));
}

/** The raw ids of every {{secret:id}} marker in `s`, in order. */
export function secretMarkerIds(s: string): string[] {
  return [...s.matchAll(SECRET_MARKER_G)].map((m) => m[1]);
}

// Strip both DM block syntaxes from a body.
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
  const countIt = () => {
    count += 1;
    return "";
  };

  // Callouts first, so a `%%` inside one goes with it.
  let text = input.replace(DM_CALLOUT_BLOCK_G, countIt);
  text = text.replace(OBSIDIAN_COMMENT_G, countIt);

  // Count delimiters with fenced code removed, so a literal %% inside
  // ``` ... ``` is excluded. Inline code spans are NOT excluded — a DM who
  // writes `%%` in single backticks gets a false positive, rare enough in
  // fantasy prose to be acceptable.
  const withoutFences = input.replace(FENCED_CODE_G, "");
  const pctUnbalanced = (withoutFences.match(PCT_DELIMITER_G) ?? []).length % 2 !== 0;

  // An open :::dm line needs a closing ::: line somewhere after it (parity,
  // not pairing).
  const opens = (withoutFences.match(DM_CALLOUT_OPEN_LINE_G) ?? []).length;
  const closes = (withoutFences.match(CALLOUT_CLOSE_LINE_G) ?? []).length;
  const calloutUnbalanced = opens > closes;

  // Collapse runs of >2 blank lines left behind by stripping.
  return {
    text: text.replace(/\n{3,}/g, "\n\n"),
    count,
    unbalanced: pctUnbalanced || calloutUnbalanced,
  };
}

// Strip both DM block syntaxes from a single shipping string (summary, alias,
// tag, label, region/route name, profile freeform value). Whitespace is
// collapsed because removing an inline block leaves extra spaces. A lone `%%`
// is left in place for the shape scan to catch.
export function stripDmFromShippingString(s: string | undefined): string | undefined {
  if (typeof s !== "string") return s;
  if (!PCT_DELIMITER.test(s) && !DM_CALLOUT_OPEN.test(s)) return s;
  return s
    .replace(DM_CALLOUT_INLINE_G, "")
    .replace(OBSIDIAN_COMMENT_G, "")
    .replace(/[ \t]+/g, " ")
    .trim();
}
