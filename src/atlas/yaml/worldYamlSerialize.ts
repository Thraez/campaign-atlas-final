/**
 * Serialize a full `world.yaml` body for the unified Save endpoint, while
 * preserving the leading-comment block of the existing file byte-for-byte.
 *
 * Why: `js-yaml` discards comments on round-trip. The current
 * `content/<world>/_atlas/world.yaml` opens with a 9-line block that explains
 * the canon/source-of-truth rules and warns against pasting markdown fences.
 * If the editor silently dropped that block on every save, those warnings
 * would evaporate the first time a DM clicked Save.
 *
 * Contract:
 *   - If `existing` is present, capture its **leading** block: every line
 *     from the start that is either blank or starts with `#`, up to (and
 *     including) the trailing blank line that separates the comment block
 *     from the first YAML key. Re-prepend that exact byte sequence to the
 *     serialized output.
 *   - If `existing` is null (new world), prepend the default boilerplate
 *     header so first-time saves still carry the canon warning.
 *   - Inline comments BETWEEN YAML keys are not preserved — this is a
 *     documented Phase 1 limitation (no inline comments exist in the
 *     repo today).
 */

const DEFAULT_HEADER = `# World atlas — map / region / fog / route / calendar config.
#
# Generated and maintained by the atlas editor. Hand-edits to comments at
# the top of this file are preserved across saves; inline comments between
# keys may be lost on the next save.
#
# CANON: YAML / Markdown frontmatter is the source of truth. Generated
# artifacts (public/atlas/atlas.json, search-index.json) are DERIVED — never
# edit them by hand.
#
# IMPORTANT: This file must be PURE YAML. Do NOT paste markdown code fences
# (\`\`\`yaml) from exported patch files.

`;

/**
 * Capture the leading-comment block of `existing`.
 *
 * Returns a string of zero or more lines (always ending in `\n`) representing
 * lines that are blank or `#`-prefixed, from the top of the file, up through
 * the trailing blank that separates the block from the first YAML key.
 */
export function captureLeadingCommentBlock(existing: string): string {
  // Strip a leading UTF-8 BOM before scanning. A BOM (U+FEFF) at byte 0 makes
  // the first character non-comment/non-blank, so the scan returns "" and
  // the entire leading-comment block silently disappears on the next save.
  // See the matching fix in import/frontmatter.ts:38 — same class of bug.
  // Use an escape (not the literal char) so the source file is BOM-free.
  const stripped = existing.charCodeAt(0) === 0xFEFF ? existing.slice(1) : existing;
  // Normalise to `\n` line endings while capturing so we can re-emit with the
  // same convention.
  const lines = stripped.split(/\r?\n/);
  const out: string[] = [];
  let i = 0;
  for (; i < lines.length; i++) {
    const line = lines[i];
    if (line === "" || /^\s*#/.test(line)) {
      out.push(line);
    } else {
      break;
    }
  }
  if (out.length === 0) return "";
  // Always ensure exactly one trailing blank line separates the block from
  // the YAML body. Trim any trailing blanks first.
  while (out.length > 0 && out[out.length - 1] === "") out.pop();
  out.push("");
  out.push("");
  return out.join("\n");
}

/**
 * Produce the final string to write to disk for `world.yaml`.
 *
 * @param yamlBody The result of dumping the canonical world object to YAML.
 *                 Should already be well-formed (caller's responsibility).
 * @param existing The current on-disk contents of the file, or `null` if the
 *                 file does not yet exist (fresh world).
 */
export function serializeWorldYaml(yamlBody: string, existing: string | null): string {
  const header = existing !== null ? captureLeadingCommentBlock(existing) : DEFAULT_HEADER;
  // js-yaml's dump output typically ends with a single trailing newline. Don't
  // double-prefix; concatenation is enough.
  return header + yamlBody;
}
