import { describe, it, expect } from "vitest";
import { markdownToHtml, renderMarkdownBodyToSafeHtml } from "@/atlas/content/markdownCore";

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

  it("is deterministic (same input → same output, the parity guarantee)", () => {
    const md = "# Title\n\n- one\n- two";
    expect(markdownToHtml(md)).toBe(markdownToHtml(md));
  });
});
