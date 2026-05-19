// src/test/content/markdownCore-footnote.test.ts
import { describe, it, expect } from "vitest";
import {
  markdownToHtml,
  renderMarkdownBodyToSafeHtml,
  dropOrphanFootnoteRefs,
} from "@/atlas/content/markdownCore";
import { renderEntityMarkdown } from "@/atlas/content/renderEntityMarkdown";
import { sanitizeAtlasHtml } from "@/atlas/sanitizeHtml";

describe("sanitizer allows footnote markup", () => {
  it("keeps <section class='footnotes'> and its contents", () => {
    const raw = `<section class="footnotes"><ol><li id="fn-1"><p>note <a href="#fnref-1" class="footnote-backref">↩</a></p></li></ol></section>`;
    const out = sanitizeAtlasHtml(raw);
    expect(out).toContain("<section");
    expect(out).toContain('id="fn-1"');
    expect(out).toContain("footnote-backref");
  });

  it("keeps <sup> and anchor attrs used by footnote refs", () => {
    const raw = `<sup><a id="fnref-1" href="#fn-1" class="footnote-ref">[1]</a></sup>`;
    const out = sanitizeAtlasHtml(raw);
    expect(out).toContain("<sup>");
    expect(out).toContain('id="fnref-1"');
    expect(out).toContain('href="#fn-1"');
  });
});

describe("footnote extension", () => {
  it("[^1] ref + [^1]: def → superscript link + footnote section", () => {
    const html = markdownToHtml("Text[^1].\n\n[^1]: The note.");
    expect(html).toContain("<sup>");
    expect(html).toContain('href="#fn-1"');
    expect(html).toContain("footnote-ref");
    expect(html).toContain('id="fn-1"');
    expect(html).toContain("The note.");
    expect(html).toContain("footnotes");
  });

  it("refs numbered in document order regardless of def position", () => {
    const html = markdownToHtml("A[^a] then B[^b].\n\n[^b]: Second.\n\n[^a]: First.");
    // [^a] appears first in text → [1], [^b] → [2]
    const pos1 = html.indexOf("[1]");
    const pos2 = html.indexOf("[2]");
    expect(pos1).toBeGreaterThan(-1);
    expect(pos2).toBeGreaterThan(pos1);
  });

  it("backref link points from footnote section back to ref anchor", () => {
    const html = markdownToHtml("Note[^x].\n\n[^x]: Content.");
    expect(html).toContain('id="fnref-x"');
    expect(html).toContain('href="#fnref-x"');
    expect(html).toContain('id="fn-x"');
    expect(html).toContain('href="#fn-x"');
  });

  it("def with inline markdown renders correctly", () => {
    const html = markdownToHtml("See[^n].\n\n[^n]: **Bold** note.");
    expect(html).toContain("<strong>Bold</strong>");
  });

  it("footnotes survive renderMarkdownBodyToSafeHtml sanitizer", () => {
    const html = renderMarkdownBodyToSafeHtml("See[^1].\n\n[^1]: Important.");
    expect(html).toContain("<sup>");
    expect(html).toContain("Important.");
    expect(html).toContain("footnotes");
  });

  it("def without a matching ref is still emitted in footnote section", () => {
    const html = markdownToHtml("[^unused]: Orphan def.\n\nNo ref here.");
    expect(html).toContain("Orphan def.");
    expect(html).toContain("footnotes");
  });
});

describe("dropOrphanFootnoteRefs", () => {
  it("no-op when all refs have definitions", () => {
    const md = "Text[^a].\n\n[^a]: Def.";
    expect(dropOrphanFootnoteRefs(md)).toBe(md);
  });

  it("removes ref when definition is absent", () => {
    const result = dropOrphanFootnoteRefs("Text[^a]. More text.");
    expect(result).not.toContain("[^a]");
    expect(result).toContain("Text");
    expect(result).toContain("More text.");
  });

  it("removes only orphaned refs, keeps defined ones", () => {
    const md = "A[^a] and B[^b].\n\n[^a]: Def for a.";
    const result = dropOrphanFootnoteRefs(md);
    expect(result).toContain("[^a]");
    expect(result).not.toContain("[^b]");
  });

  it("leaves definition markers intact", () => {
    const md = "Text.\n\n[^a]: Def.";
    expect(dropOrphanFootnoteRefs(md)).toContain("[^a]: Def.");
  });

  it("when no defs exist all refs are removed", () => {
    const result = dropOrphanFootnoteRefs("See[^x] and[^y].");
    expect(result).not.toContain("[^x]");
    expect(result).not.toContain("[^y]");
  });
});

describe("footnote orphan secrecy", () => {
  const body = [
    "Public text[^secret].",
    "",
    "%%",
    "[^secret]: This is DM-only info.",
    "%%",
    "",
    "Public outro.",
  ].join("\n");

  it("player render contains no dangling footnote marker or DM content", () => {
    const html = renderEntityMarkdown(body, { showDmNotes: false });
    expect(html).toContain("Public text");
    expect(html).toContain("Public outro.");
    expect(html).not.toContain("fnref");
    expect(html).not.toContain("[^secret]");
    expect(html).not.toContain("DM-only");
  });

  it("DM render keeps the footnote and its definition", () => {
    const html = renderEntityMarkdown(body, { showDmNotes: true });
    expect(html).toContain("fnref");
    expect(html).toContain("DM-only");
  });
});
