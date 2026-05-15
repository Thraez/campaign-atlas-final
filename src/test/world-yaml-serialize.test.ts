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
});
