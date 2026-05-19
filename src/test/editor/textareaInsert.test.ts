import { describe, it, expect } from "vitest";
import { wrapInline, prefixLines, insertBlock } from "@/atlas/editor/textareaInsert";

// ---------------------------------------------------------------------------
// wrapInline
// ---------------------------------------------------------------------------

describe("wrapInline", () => {
  it("wraps selected text between markers", () => {
    const r = wrapInline("hello world", 6, 11, "**", "**");
    expect(r.value).toBe("hello **world**");
    expect(r.selStart).toBe(8);  // "w" in world
    expect(r.selEnd).toBe(13);   // after "d", before closing **
  });

  it("selection is preserved inside markers (not the markers themselves)", () => {
    const r = wrapInline("abc", 0, 3, "*", "*");
    expect(r.value).toBe("*abc*");
    expect(r.selStart).toBe(1);
    expect(r.selEnd).toBe(4);
  });

  it("inserts default placeholder and selects it when no selection", () => {
    const r = wrapInline("hello ", 6, 6, "**", "**");
    expect(r.value).toBe("hello **text**");
    expect(r.selStart).toBe(8);
    expect(r.selEnd).toBe(12); // "text" selected
  });

  it("inserts custom placeholder when no selection", () => {
    const r = wrapInline("", 0, 0, "==", "==", "highlight");
    expect(r.value).toBe("==highlight==");
    expect(r.selStart).toBe(2);
    expect(r.selEnd).toBe(11);
  });

  it("handles asymmetric markers", () => {
    const r = wrapInline("link text", 0, 9, "[[", "]]");
    expect(r.value).toBe("[[link text]]");
    expect(r.selStart).toBe(2);
    expect(r.selEnd).toBe(11);
  });

  it("works at start of string", () => {
    const r = wrapInline("bold rest", 0, 4, "**", "**");
    expect(r.value).toBe("**bold** rest");
    expect(r.selStart).toBe(2);
    expect(r.selEnd).toBe(6);
  });

  it("works at end of string", () => {
    const r = wrapInline("hello world", 6, 11, "_", "_");
    expect(r.value).toBe("hello _world_");
    expect(r.selStart).toBe(7);
    expect(r.selEnd).toBe(12);
  });

  it("does not mutate input", () => {
    const original = "abc";
    wrapInline(original, 1, 2, "**", "**");
    expect(original).toBe("abc");
  });
});

// ---------------------------------------------------------------------------
// prefixLines
// ---------------------------------------------------------------------------

describe("prefixLines", () => {
  it("prefixes a single line when cursor is mid-line", () => {
    const r = prefixLines("hello world", 3, 3, "# ");
    expect(r.value).toBe("# hello world");
    expect(r.selStart).toBe(5); // 3 + prefix.length(2)
    expect(r.selEnd).toBe(5);
  });

  it("prefixes a single line with full selection", () => {
    const r = prefixLines("hello", 0, 5, "- ");
    expect(r.value).toBe("- hello");
    expect(r.selStart).toBe(2); // 0 + 2
    expect(r.selEnd).toBe(7);   // 5 + 2*1
  });

  it("prefixes all lines in a multi-line selection", () => {
    const r = prefixLines("line1\nline2\nline3", 0, 17, "- ");
    expect(r.value).toBe("- line1\n- line2\n- line3");
    expect(r.selStart).toBe(2);  // 0 + 2
    expect(r.selEnd).toBe(23);   // 17 + 2*3
  });

  it("only prefixes the line containing the cursor (not neighbours)", () => {
    const r = prefixLines("line1\nline2\nline3", 6, 6, "> ");
    expect(r.value).toBe("line1\n> line2\nline3");
    expect(r.selStart).toBe(8); // 6 + 2
    expect(r.selEnd).toBe(8);
  });

  it("prefixes lines spanning a partial selection", () => {
    // selStart mid line1, selEnd mid line2
    const r = prefixLines("line1\nline2", 3, 8, "- ");
    expect(r.value).toBe("- line1\n- line2");
    expect(r.selStart).toBe(5);  // 3 + 2
    expect(r.selEnd).toBe(12);   // 8 + 2*2
  });

  it("handles empty prefix (no-op)", () => {
    const r = prefixLines("abc", 0, 3, "");
    expect(r.value).toBe("abc");
    expect(r.selStart).toBe(0);
    expect(r.selEnd).toBe(3);
  });

  it("handles last line without trailing newline", () => {
    const r = prefixLines("a\nb\nc", 2, 5, "> ");
    expect(r.value).toBe("a\n> b\n> c");
  });
});

// ---------------------------------------------------------------------------
// insertBlock
// ---------------------------------------------------------------------------

describe("insertBlock", () => {
  it("appends block with blank-line separator when body has content", () => {
    const r = insertBlock("existing", 0, "## Section");
    expect(r.value).toBe("existing\n\n## Section\n");
  });

  it("inserts block after current line, not after end of all text", () => {
    const r = insertBlock("first\nsecond", 2, "## Block");
    // cursor mid "first" → block goes after "first" line
    expect(r.value).toBe("first\n\n## Block\nsecond");
  });

  it("inserts into empty body with no separator", () => {
    const r = insertBlock("", 0, "- item 1\n- item 2");
    expect(r.value).toBe("- item 1\n- item 2\n");
    expect(r.selStart).toBe(r.selEnd); // cursor after block
  });

  it("does not double blank lines when body already ends with blank line", () => {
    const r = insertBlock("content\n\n", 9, "## New");
    expect(r.value).toBe("content\n\n## New\n");
  });

  it("adds only one newline when body ends with single newline", () => {
    const r = insertBlock("content\n", 8, "## New");
    expect(r.value).toBe("content\n\n## New\n");
  });

  it("places cursor immediately after the inserted block", () => {
    const r = insertBlock("", 0, "abc");
    expect(r.selStart).toBe(r.value.length);
    expect(r.selEnd).toBe(r.value.length);
  });

  it("preserves content after insertion point", () => {
    const r = insertBlock("first\nrest", 3, "## X");
    expect(r.value).toContain("rest");
    expect(r.value.indexOf("rest")).toBeGreaterThan(r.value.indexOf("## X"));
  });
});
