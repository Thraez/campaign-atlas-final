import { describe, it, expect } from "vitest";
import { markdownToHtml, renderMarkdownBodyToSafeHtml } from "@/atlas/content/markdownCore";
import { tokenizeWikilinks, renderLinkTokens } from "@/atlas/content/parseWikilinks";
import { sanitizeAtlasHtml } from "@/atlas/sanitizeHtml";

describe("markdownCore", () => {
  it("renders GFM tables and strikethrough", () => {
    const html = markdownToHtml("| a | b |\n|---|---|\n| 1 | 2 |\n\n~~gone~~");
    expect(html).toContain("<table>");
    expect(html).toContain("<del>gone</del>");
  });

  it("renderMarkdownBodyToSafeHtml strips script injection", () => {
    const html = renderMarkdownBodyToSafeHtml("ok\n\n<script>alert(1)</script>");
    expect(html).toContain("ok");
    expect(html).not.toContain("<script>");
  });

  // Phase 3 parity: Obsidian reading view (default "Strict line breaks" OFF)
  // renders a single newline inside a paragraph as a hard line break.
  it("converts a single newline to <br> (Obsidian reading-view parity)", () => {
    const html = markdownToHtml("first line\nsecond line");
    expect(html).toContain("<br>");
    expect(html).toContain("first line");
    expect(html).toContain("second line");
  });

  it("a blank line still separates paragraphs (not a <br>)", () => {
    const html = markdownToHtml("para one\n\npara two");
    expect(html).toContain("<p>para one</p>");
    expect(html).toContain("<p>para two</p>");
  });

  it("is deterministic (same input → same output, the parity guarantee)", () => {
    const md = "# Title\n\n- one\n- two";
    const first = markdownToHtml(md);
    const second = markdownToHtml(md);
    expect(first).toBe(second);
  });
});

describe("line-break parity does not regress block constructs", () => {
  it("multi-line list stays a list, not <br>-joined", () => {
    const html = markdownToHtml("- one\n- two\n- three");
    expect(html).toContain("<li>one</li>");
    expect(html).toContain("<li>two</li>");
    expect(html).toContain("<li>three</li>");
  });

  it("GFM table still parses with adjacent single newlines", () => {
    const html = markdownToHtml("| a | b |\n|---|---|\n| 1 | 2 |");
    expect(html).toContain("<table>");
    expect(html).not.toContain("<br>");
  });

  it("callout body still renders inside <details>", () => {
    const html = markdownToHtml("> [!note] Title\n> first\n> second");
    expect(html).toContain('<details class="atlas-callout');
    expect(html).toContain("first");
    expect(html).toContain("second");
  });

  it("footnote ref + def still number and link", () => {
    const html = markdownToHtml("text[^a]\n\n[^a]: the note");
    expect(html).toContain('href="#fn-a"');
    expect(html).toContain('id="fn-a"');
    expect(html).toContain("the note");
  });

  it("task list still renders class-based items", () => {
    const html = markdownToHtml("- [ ] open\n- [x] done");
    expect(html).not.toContain("<input");
    expect(html).toContain("atlas-task-item");
    expect(html).toContain("atlas-task-done");
  });
});

describe("markdownCore parity-lock", () => {
  it("the DM-pane pipeline and a direct core render agree on block structure", () => {
    const body = "## Heading\n\n> a quote\n\n- item";
    // DM-pane pipeline (no wikilinks present → tokens unchanged)
    const { tokenized, links } = tokenizeWikilinks(body, { resolveByName: () => undefined });
    const panePath = sanitizeAtlasHtml(renderLinkTokens(markdownToHtml(tokenized), links, {}));
    // Direct core render
    const corePath = renderMarkdownBodyToSafeHtml(body);
    expect(panePath).toBe(corePath);
  });
});

describe("highlight extension", () => {
  it("==text== emits <mark>", () => {
    const html = markdownToHtml("==hello==");
    expect(html).toContain("<mark>hello</mark>");
  });

  it("inline markdown inside highlight is rendered", () => {
    const html = markdownToHtml("==**bold** text==");
    expect(html).toContain("<mark>");
    expect(html).toContain("<strong>bold</strong>");
  });

  it("<mark> survives renderMarkdownBodyToSafeHtml sanitizer", () => {
    const html = renderMarkdownBodyToSafeHtml("==keep==");
    expect(html).toContain("<mark>keep</mark>");
  });

  it("unclosed == does not emit mark", () => {
    const html = markdownToHtml("==no close");
    expect(html).not.toContain("<mark>");
  });
});

describe("task-list styling", () => {
  it("- [ ] and - [x] render without <input>", () => {
    const html = markdownToHtml("- [ ] open task\n- [x] done task");
    expect(html).not.toContain("<input");
    expect(html).toContain("atlas-task-item");
    expect(html).toContain("atlas-task-done");
  });

  it("open task has atlas-task-item but not atlas-task-done", () => {
    const html = markdownToHtml("- [ ] open");
    expect(html).toContain("atlas-task-item");
    expect(html).not.toContain("atlas-task-done");
  });

  it("task list survives sanitizer (no <input>, classes kept)", () => {
    const html = renderMarkdownBodyToSafeHtml("- [ ] open\n- [x] done");
    expect(html).not.toContain("<input");
    expect(html).toContain("atlas-task-item");
    expect(html).toContain("atlas-task-done");
  });

  it("non-task list items are unaffected", () => {
    const html = markdownToHtml("- plain item\n- [ ] task");
    expect(html).toContain("<li>plain item</li>");
    expect(html).toContain("atlas-task-item");
  });
});
