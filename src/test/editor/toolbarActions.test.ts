import { describe, it, expect } from "vitest";
import { applyToolbarAction } from "@/atlas/editor/toolbarActions";

// All actions are pure (value, selStart, selEnd) -> InsertResult, built on
// the textareaInsert primitives. These lock the exact emitted markdown.

describe("inline wrap actions", () => {
  it("bold wraps the selection in **", () => {
    const r = applyToolbarAction("bold", "make bold", 5, 9);
    expect(r.value).toBe("make **bold**");
    expect(r.value.slice(r.selStart, r.selEnd)).toBe("bold");
  });

  it("italic wraps the selection in *", () => {
    const r = applyToolbarAction("italic", "make it", 5, 7);
    expect(r.value).toBe("make *it*");
  });

  it("highlight wraps the selection in ==", () => {
    const r = applyToolbarAction("highlight", "warn here", 0, 4);
    expect(r.value).toBe("==warn== here");
  });

  it("wikilink wraps the selection in [[ ]]", () => {
    const r = applyToolbarAction("wikilink", "see Corven", 4, 10);
    expect(r.value).toBe("see [[Corven]]");
  });

  it("bold with no selection inserts a selected placeholder", () => {
    const r = applyToolbarAction("bold", "", 0, 0);
    expect(r.value).toBe("**text**");
    expect(r.value.slice(r.selStart, r.selEnd)).toBe("text");
  });

  it("footnote inserts a [^1] reference with the id selected", () => {
    const r = applyToolbarAction("footnote", "a claim", 7, 7);
    expect(r.value).toBe("a claim[^1]");
    expect(r.value.slice(r.selStart, r.selEnd)).toBe("1");
  });

  it("codeblock fences the selection", () => {
    const r = applyToolbarAction("codeblock", "x = 1", 0, 5);
    expect(r.value).toBe("```\nx = 1\n```");
  });
});

describe("line-prefix actions", () => {
  it("heading prefixes the line with ## ", () => {
    const r = applyToolbarAction("heading", "Overview", 0, 8);
    expect(r.value).toBe("## Overview");
  });

  it("list prefixes the line with - ", () => {
    const r = applyToolbarAction("list", "one\ntwo", 0, 7);
    expect(r.value).toBe("- one\n- two");
  });

  it("quote prefixes the line with > ", () => {
    const r = applyToolbarAction("quote", "a warning", 3, 3);
    expect(r.value).toBe("> a warning");
  });

  it("task prefixes the line with - [ ] ", () => {
    const r = applyToolbarAction("task", "do it", 0, 5);
    expect(r.value).toBe("- [ ] do it");
  });
});

describe("block insert actions", () => {
  it("callout inserts a note callout block by default", () => {
    const r = applyToolbarAction("callout", "body", 4, 4);
    expect(r.value).toBe("body\n\n> [!note] Title\n> text\n");
  });

  it("callout honors a specific type", () => {
    const r = applyToolbarAction("callout", "body", 4, 4, "warning");
    expect(r.value).toBe("body\n\n> [!warning] Title\n> text\n");
  });

  it("table inserts a GFM skeleton block", () => {
    const r = applyToolbarAction("table", "intro", 5, 5);
    expect(r.value).toBe(
      "intro\n\n| Column | Column |\n| --- | --- |\n| Cell | Cell |\n",
    );
  });

  it("does not mutate the input string", () => {
    const original = "abc";
    applyToolbarAction("bold", original, 0, 3);
    expect(original).toBe("abc");
  });
});
