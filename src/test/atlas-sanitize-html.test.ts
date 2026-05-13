/**
 * Tests for src/atlas/sanitizeHtml.ts
 *
 * Goal: prove sanitizer kills injection vectors but preserves the markdown
 * subset the atlas viewer actually needs. These run in jsdom (vitest default).
 */
import { describe, it, expect } from "vitest";
import { sanitizeAtlasHtml } from "../atlas/sanitizeHtml";

describe("sanitizeAtlasHtml — keeps useful markdown output", () => {
  it("preserves headings, paragraphs, emphasis, strong", () => {
    const out = sanitizeAtlasHtml(
      "<h2>Title</h2><p>Hello <em>there</em> <strong>friend</strong>.</p>"
    );
    expect(out).toContain("<h2>Title</h2>");
    expect(out).toContain("<em>there</em>");
    expect(out).toContain("<strong>friend</strong>");
  });

  it("preserves lists, blockquotes, code, tables", () => {
    const out = sanitizeAtlasHtml(
      "<ul><li>a</li><li>b</li></ul>" +
        "<blockquote><p>q</p></blockquote>" +
        "<pre><code>x()</code></pre>" +
        "<table><thead><tr><th>h</th></tr></thead><tbody><tr><td>v</td></tr></tbody></table>"
    );
    expect(out).toContain("<ul>");
    expect(out).toContain("<li>a</li>");
    expect(out).toContain("<blockquote>");
    expect(out).toContain("<code>x()</code>");
    expect(out).toContain("<table>");
    expect(out).toContain("<th>h</th>");
  });

  it("preserves safe links with href + title", () => {
    const out = sanitizeAtlasHtml('<a href="https://example.com" title="ex">link</a>');
    expect(out).toContain('href="https://example.com"');
    expect(out).toContain('title="ex"');
  });

  it("preserves wikilink token spans emitted by build-atlas", () => {
    // renderLinkTokens output looks like a span with data-* attributes.
    const out = sanitizeAtlasHtml(
      '<p>See <span class="atlas-link" data-link="entity-id" data-display="Display">Display</span> later.</p>'
    );
    expect(out).toContain('data-link="entity-id"');
    expect(out).toContain('data-display="Display"');
    expect(out).toContain("Display");
  });
});

describe("sanitizeAtlasHtml — removes unsafe content", () => {
  it("strips <script> tags entirely", () => {
    const out = sanitizeAtlasHtml("<p>ok</p><script>alert(1)</script>");
    expect(out).not.toMatch(/<script/i);
    expect(out).not.toMatch(/alert\(1\)/);
    expect(out).toContain("<p>ok</p>");
  });

  it("strips inline event handlers like onclick", () => {
    const out = sanitizeAtlasHtml('<a href="https://x.test" onclick="alert(1)">x</a>');
    expect(out).not.toMatch(/onclick/i);
    expect(out).not.toMatch(/alert/);
    expect(out).toContain('href="https://x.test"');
  });

  it("neutralizes javascript: URLs", () => {
    const out = sanitizeAtlasHtml('<a href="javascript:alert(1)">x</a>');
    expect(out).not.toMatch(/javascript:/i);
  });

  it("strips <iframe> embeds", () => {
    const out = sanitizeAtlasHtml('<iframe src="https://evil.test"></iframe><p>after</p>');
    expect(out).not.toMatch(/<iframe/i);
    expect(out).toContain("<p>after</p>");
  });

  it("strips inline style attributes", () => {
    const out = sanitizeAtlasHtml('<p style="background:url(javascript:alert(1))">x</p>');
    expect(out).not.toMatch(/style=/i);
    expect(out).not.toMatch(/javascript:/i);
    expect(out).toContain("<p");
    expect(out).toContain(">x</p>");
  });

  it("returns empty string for empty input", () => {
    expect(sanitizeAtlasHtml("")).toBe("");
  });

  it("is idempotent (sanitizing twice yields the same output)", () => {
    const dirty = '<p>hi <script>x</script><a href="javascript:1">l</a></p>';
    const once = sanitizeAtlasHtml(dirty);
    const twice = sanitizeAtlasHtml(once);
    expect(twice).toBe(once);
  });
});