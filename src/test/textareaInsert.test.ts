import { describe, it, expect } from "vitest";
import { wrapInline, prefixLines, insertBlock } from "../atlas/editor/textareaInsert";

describe("wrapInline", () => {
  it("wraps a selection with before/after markers", () => {
    // "hello world" with "world" selected (6..11)
    const r = wrapInline("hello world", 6, 11, "**", "**");
    expect(r.value).toBe("hello **world**");
    expect(r.selStart).toBe(8); // after "hello **"
    expect(r.selEnd).toBe(13); // before "**"
  });

  it("inserts default placeholder when nothing is selected", () => {
    const r = wrapInline("hello ", 6, 6, "_", "_");
    expect(r.value).toBe("hello _text_");
    expect(r.selStart).toBe(7); // after "_"
    expect(r.selEnd).toBe(11); // before "_"
  });

  it("inserts custom placeholder when nothing is selected", () => {
    const r = wrapInline("", 0, 0, "[[", "]]", "Link");
    expect(r.value).toBe("[[Link]]");
    expect(r.selStart).toBe(2);
    expect(r.selEnd).toBe(6);
  });

  it("wraps entire string when fully selected", () => {
    const r = wrapInline("word", 0, 4, "`", "`");
    expect(r.value).toBe("`word`");
    expect(r.selStart).toBe(1);
    expect(r.selEnd).toBe(5);
  });

  it("handles empty value with no selection (pure placeholder)", () => {
    const r = wrapInline("", 0, 0, "**", "**");
    expect(r.value).toBe("**text**");
    expect(r.selStart).toBe(2);
    expect(r.selEnd).toBe(6);
  });
});

describe("prefixLines", () => {
  it("prefixes a single line when there is no trailing newline (lineEnd = value.length)", () => {
    // No newline after selEnd — nextNl === -1
    const r = prefixLines("hello world", 0, 5, "- ");
    expect(r.value).toBe("- hello world");
    expect(r.selStart).toBe(2); // 0 + prefix.length
    expect(r.selEnd).toBe(7); // 5 + prefix.length * 1 line
  });

  it("prefixes a single line when there is a trailing newline (lineEnd = nextNl)", () => {
    // "line1\nline2" — select only "line1" (0..5); newline at index 5 bounds the block
    const r = prefixLines("line1\nline2", 0, 5, "> ");
    expect(r.value).toBe("> line1\nline2");
    expect(r.selStart).toBe(2);
    expect(r.selEnd).toBe(7); // 5 + 2 * 1 line
  });

  it("prefixes multiple lines spanned by the selection", () => {
    // Select across two lines: "alpha\nbeta"
    const text = "alpha\nbeta\ngamma";
    // selStart=0 (in "alpha"), selEnd=9 (in "beta") — spans both first lines
    const r = prefixLines(text, 0, 9, "# ");
    expect(r.value).toBe("# alpha\n# beta\ngamma");
    expect(r.selStart).toBe(2); // 0 + prefix.length
    expect(r.selEnd).toBe(13); // 9 + 2 * 2 lines
  });

  it("expands to the start of the line when selection begins mid-line", () => {
    // "foo bar\nbaz" — selStart=4 (mid "foo bar")
    const r = prefixLines("foo bar\nbaz", 4, 7, "- ");
    // lineStart = lastIndexOf("\n", 3) + 1 = 0 → entire first line prefixed
    expect(r.value).toBe("- foo bar\nbaz");
    expect(r.selStart).toBe(6); // 4 + 2
    expect(r.selEnd).toBe(9); // 7 + 2 * 1 line
  });
});

describe("insertBlock", () => {
  it("inserts block after current line when there is a following newline", () => {
    // "line1\nline2" — cursor at 3 (inside "line1")
    // nextNl = 5 → insertAt = 5; head="line1", tail="\nline2"
    const r = insertBlock("line1\nline2", 3, "new block");
    // head="line1" (no \n) → sep="\n\n"; tail="\nline2" starts with \n → trailingNl=""
    // inserted = "\n\nnew block"; cursor lands right after inserted content, before tail's \n
    expect(r.value).toBe("line1\n\nnew block\nline2");
    const cursor = r.selStart;
    expect(cursor).toBe(r.selEnd); // collapsed
    expect(r.value.slice(0, cursor)).toBe("line1\n\nnew block");
  });

  it("appends block at end when cursor is on the last line (no trailing newline)", () => {
    // "only line" — no newline → insertAt = value.length = 9; head="only line", tail=""
    const r = insertBlock("only line", 5, "footer");
    // head doesn't end with \n → sep = "\n\n"; tail="" doesn't start with \n → trailingNl = "\n"
    expect(r.value).toBe("only line\n\nfooter\n");
    expect(r.selStart).toBe(r.value.length);
  });

  it("uses no separator when head is empty (inserting at start of empty buffer)", () => {
    // Empty buffer — head="" → sep=""
    const r = insertBlock("", 0, "first");
    // head="" → sep=""; tail="" → trailingNl="\n"
    expect(r.value).toBe("first\n");
    expect(r.selStart).toBe(6);
  });

  it("uses single newline separator when head already ends with one newline", () => {
    // "intro\n" — cursor at 5; nextNl=5 → insertAt=5; head="intro", tail="\n"
    // head "intro" doesn't end with \n → sep = "\n\n"
    // BUT: let's construct head that ends with "\n": "intro\n" with cursor at 6 → nextNl=-1 → insertAt=6
    // head="intro\n" ends with "\n" (single) → sep="\n"; tail="" → trailingNl="\n"
    const r = insertBlock("intro\n", 6, "body");
    expect(r.value).toBe("intro\n\nbody\n");
    expect(r.selStart).toBe(r.value.length);
  });

  it("uses no separator when head already ends with two newlines", () => {
    // head ends with "\n\n" → sep=""
    // "para\n\n" cursor at 6; no trailing newline → insertAt=6; head="para\n\n", tail=""
    const r = insertBlock("para\n\n", 6, "next");
    expect(r.value).toBe("para\n\nnext\n");
    expect(r.selStart).toBe(r.value.length);
  });

  it("omits trailing newline when the tail already starts with one", () => {
    // "a\n\nb" — cursor at 1; nextNl=1 → insertAt=1; head="a", tail="\n\nb"
    // head="a" → sep="\n\n"; tail starts with "\n" → trailingNl=""
    const r = insertBlock("a\n\nb", 1, "mid");
    expect(r.value).toBe("a\n\nmid\n\nb");
    // cursor lands just after "a\n\nmid"
    expect(r.value.slice(0, r.selStart)).toBe("a\n\nmid");
  });
});
