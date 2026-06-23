import { describe, it, expect } from "vitest";
import { captureLeadingCommentBlock, serializeWorldYaml } from "@/atlas/yaml/worldYamlSerialize";

describe("captureLeadingCommentBlock", () => {
  it("captures a comment block followed by a blank separator", () => {
    const existing = "# top comment\n# another\n\nschemaVersion: 1\nmaps: []\n";
    const captured = captureLeadingCommentBlock(existing);
    expect(captured).toBe("# top comment\n# another\n\n");
  });

  it("returns empty string when the file starts with YAML keys directly", () => {
    const existing = "schemaVersion: 1\nmaps: []\n";
    expect(captureLeadingCommentBlock(existing)).toBe("");
  });

  it("normalises trailing blanks to exactly one separator line", () => {
    const existing = "# one\n# two\n\n\n\nschemaVersion: 1\n";
    expect(captureLeadingCommentBlock(existing)).toBe("# one\n# two\n\n");
  });

  it("handles CRLF line endings", () => {
    const existing = "# top\r\n# next\r\n\r\nschemaVersion: 1\r\n";
    expect(captureLeadingCommentBlock(existing)).toBe("# top\n# next\n\n");
  });

  it("strips a leading UTF-8 BOM before scanning the comment block", () => {
    // A BOM at byte 0 used to make the regex /^\s*#/ miss the first line, so
    // the scan returned "" and the entire 9-line astrath-deeprealm header
    // disappeared on the very next save. Same class of bug as the
    // import/frontmatter.ts fix in commit 476d67f.
    const existing = "﻿# header line 1\n# header line 2\n\nschemaVersion: 1\nmaps: []\n";
    expect(captureLeadingCommentBlock(existing)).toBe("# header line 1\n# header line 2\n\n");
  });

  it("captures an all-comment file with no YAML body (entire content is comments)", () => {
    // Edge case: file has only comment lines and no YAML keys at all.
    // captureLeadingCommentBlock should capture every comment line and normalise
    // to exactly one trailing blank separator, even though there is no YAML body
    // following it.
    const existing = "# comment one\n# comment two\n";
    expect(captureLeadingCommentBlock(existing)).toBe("# comment one\n# comment two\n\n");
  });

  it("captures leading blank lines that precede the first comment", () => {
    // A blank line at the very top of the file also satisfies the blank-or-comment
    // predicate and is included in the capture.
    const existing = "\n# after blank\n\nschemaVersion: 1\n";
    expect(captureLeadingCommentBlock(existing)).toBe("\n# after blank\n\n");
  });

  it("captures indented comment lines (leading whitespace before #)", () => {
    // /^\s*#/ matches lines whose first non-space character is #, so indented
    // comments at the top of the file are preserved alongside column-zero ones.
    const existing = "  # indented note\nschemaVersion: 1\n";
    expect(captureLeadingCommentBlock(existing)).toBe("  # indented note\n\n");
  });

  it("stops at a YAML key that has an inline comment (non-leading #)", () => {
    // A line like "key: value # note" does not start with # — the scan stops
    // immediately and returns "" because there is no leading comment block.
    const existing = "key: value # inline\nmaps: []\n";
    expect(captureLeadingCommentBlock(existing)).toBe("");
  });

  it("captures the full 9-line astrath-deeprealm header exactly", () => {
    const existing =
      "# Astrath Deeprealm — map / region / fog / route / calendar config.\n" +
      "#\n" +
      "# CANON: YAML / Markdown frontmatter is the source of truth. Generated\n" +
      "# artifacts (public/atlas/atlas.json, search-index.json) are DERIVED — never\n" +
      "# edit them by hand. Visual edits in /atlas/edit emit a YAML patch that is\n" +
      "# pasted here and committed.\n" +
      "#\n" +
      "# IMPORTANT: This file must be PURE YAML. Do NOT paste markdown code fences\n" +
      "# (```yaml) from exported patch files.\n" +
      "\n" +
      "schemaVersion: 1\n" +
      "maps:\n" +
      "  - id: astrath-deeprealm-overview\n";
    const captured = captureLeadingCommentBlock(existing);
    // 9 comment lines + one blank separator.
    expect(captured.split("\n").length).toBe(11); // 9 content lines + 1 blank + trailing "" from final \n
    expect(captured).toContain("# Astrath Deeprealm");
    expect(captured).toContain("# IMPORTANT: This file must be PURE YAML.");
    // No YAML data crept in.
    expect(captured).not.toContain("schemaVersion");
    expect(captured).not.toContain("maps:");
  });
});

describe("serializeWorldYaml", () => {
  it("round-trips the leading comment block byte-for-byte", () => {
    const existing =
      "# Header line one\n" +
      "# Header line two\n" +
      "\n" +
      "schemaVersion: 1\nmaps: []\n";
    const newBody = "schemaVersion: 1\nmaps:\n  - id: overview\n";
    const out = serializeWorldYaml(newBody, existing);
    expect(out.startsWith("# Header line one\n# Header line two\n\n")).toBe(true);
    expect(out.endsWith(newBody)).toBe(true);
  });

  it("emits the default boilerplate when no existing file is given", () => {
    const newBody = "schemaVersion: 1\nmaps: []\n";
    const out = serializeWorldYaml(newBody, null);
    expect(out).toContain("# World atlas");
    expect(out).toContain("# CANON: YAML / Markdown frontmatter is the source of truth.");
    expect(out.endsWith(newBody)).toBe(true);
  });

  it("round-trips a BOM-prefixed existing file with the blank-line separator intact", () => {
    // The Astrath Deeprealm world.yaml regression: file was saved by an editor
    // that prepended a UTF-8 BOM. Subsequent editor saves dropped the entire
    // comment block AND the blank-line separator before schemaVersion. The
    // captureLeadingCommentBlock BOM strip closes that loop.
    const existing =
      "﻿# Astrath Deeprealm — config\n" +
      "#\n" +
      "# CANON: source of truth\n" +
      "\n" +
      "schemaVersion: 1\nmaps: []\n";
    const newBody = "schemaVersion: 1\nmaps:\n  - id: overview\n";
    const out = serializeWorldYaml(newBody, existing);
    // Comments survive (without the BOM, which would be illegal mid-file).
    expect(out.startsWith("# Astrath Deeprealm — config\n#\n# CANON: source of truth\n\n")).toBe(true);
    // And the blank-line separator between comments and YAML body is still
    // there — the YAML body starts on the line AFTER a blank line.
    expect(out).toMatch(/# CANON: source of truth\n\nschemaVersion: 1/);
  });

  it("inline mid-file comments are NOT preserved (documented limitation)", () => {
    const existing =
      "# top header\n" +
      "\n" +
      "schemaVersion: 1\n" +
      "# inline comment that the editor cannot keep\n" +
      "maps: []\n";
    const newBody = "schemaVersion: 1\nmaps:\n  - id: overview\n";
    const out = serializeWorldYaml(newBody, existing);
    expect(out).toContain("# top header");
    expect(out).not.toContain("# inline comment");
  });

  it("all-comment existing file: comment block is preserved and new body follows (documented gap)", () => {
    // The documented edge case: existing world.yaml contains only header comments
    // and no YAML keys. captureLeadingCommentBlock captures the entire file as the
    // comment block; serializeWorldYaml prepends it to the new body correctly.
    const existing = "# Config header\n#\n# Doc line\n";
    const newBody = "schemaVersion: 1\nmaps: []\n";
    const out = serializeWorldYaml(newBody, existing);
    expect(out).toBe("# Config header\n#\n# Doc line\n\nschemaVersion: 1\nmaps: []\n");
  });

  it("single comment line with no trailing newline still gets the blank-line separator", () => {
    // A comment-only existing file that has no trailing newline should still
    // produce exactly one blank line separating the comment from the YAML body.
    const existing = "# single";
    const newBody = "schemaVersion: 1\n";
    const out = serializeWorldYaml(newBody, existing);
    expect(out).toBe("# single\n\nschemaVersion: 1\n");
  });
});
