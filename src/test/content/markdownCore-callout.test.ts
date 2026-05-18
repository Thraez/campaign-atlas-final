// src/test/content/markdownCore-callout.test.ts
import { describe, it, expect } from "vitest";
import { sanitizeAtlasHtml } from "@/atlas/sanitizeHtml";

describe("sanitizer allows callout markup", () => {
  it("keeps details/summary/open/data-callout", () => {
    const html = `<details class="atlas-callout atlas-callout-note" data-callout="note" open><summary>Note</summary><p>body</p></details>`;
    const out = sanitizeAtlasHtml(html);
    expect(out).toContain("<details");
    expect(out).toContain('data-callout="note"');
    expect(out).toContain("open");
    expect(out).toContain("<summary>Note</summary>");
  });
});

import { markdownToHtml } from "@/atlas/content/markdownCore";

describe("callout extension", () => {
  it("renders a basic callout with default title", () => {
    const h = markdownToHtml("> [!note]\n> hello");
    expect(h).toContain('data-callout="note"');
    expect(h).toContain("<summary>Note</summary>");
    expect(h).toContain("hello");
    expect(h).toContain("<details");
    expect(h).toContain("open"); // no suffix = expanded
  });

  it("uses a custom title and renders nested markdown", () => {
    const h = markdownToHtml("> [!warning] Be careful\n> with **bolds**");
    expect(h).toContain('data-callout="warning"');
    expect(h).toContain("<summary>Be careful</summary>");
    expect(h).toContain("<strong>bolds</strong>");
  });

  it("collapsed with '-' omits the open attribute", () => {
    const h = markdownToHtml("> [!tip]- Hidden\n> secret tip");
    expect(h).toContain('data-callout="tip"');
    expect(h).not.toMatch(/<details[^>]*\sopen/);
  });

  it("does not swallow a plain blockquote", () => {
    const h = markdownToHtml("> just a quote");
    expect(h).toContain("<blockquote>");
    expect(h).not.toContain("data-callout");
  });
});
