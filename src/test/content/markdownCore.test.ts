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

  it("does not convert bare newlines to <br> (breaks:false)", () => {
    const html = markdownToHtml("first line\nsecond line");
    expect(html).not.toContain("<br>");
  });

  it("is deterministic (same input → same output, the parity guarantee)", () => {
    const md = "# Title\n\n- one\n- two";
    const first = markdownToHtml(md);
    const second = markdownToHtml(md);
    expect(first).toBe(second);
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
