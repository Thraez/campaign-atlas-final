/**
 * Tests for the handout HTML builder used by single-entity printing
 * (player viewer) and the multi-entity bundle (DM editor).
 */
import { describe, it, expect } from "vitest";
import { buildHandoutHtml } from "../atlas/printHandout";
import type { Entity } from "../atlas/content/schema";

function entity(over: Partial<Entity> & { id: string; title: string }): Entity {
  return {
    id: over.id,
    title: over.title,
    type: over.type ?? "npc",
    visibility: over.visibility ?? "player",
    aliases: over.aliases ?? [],
    tags: over.tags ?? [],
    images: over.images ?? [],
    body: over.body ?? "",
    bodyHtml: over.bodyHtml ?? "",
    frontmatter: over.frontmatter ?? {},
    sourcePath: over.sourcePath ?? "",
    links: over.links ?? [],
    backlinks: over.backlinks ?? [],
    summary: over.summary,
  };
}

describe("buildHandoutHtml", () => {
  it("produces one section for a single entity, no page break", () => {
    const html = buildHandoutHtml([
      entity({ id: "alice", title: "Alice the Bold", bodyHtml: "<p>Hero</p>" }),
    ]);
    const sections = html.match(/<article class="handout(?: page-break)?">/g) ?? [];
    expect(sections).toHaveLength(1);
    expect(html).not.toContain('class="handout page-break"');
    expect(html).toContain("Alice the Bold");
  });

  it("produces N sections with N-1 page breaks between them", () => {
    const html = buildHandoutHtml([
      entity({ id: "a", title: "Alpha" }),
      entity({ id: "b", title: "Beta" }),
      entity({ id: "c", title: "Gamma" }),
    ]);
    const sections = html.match(/<article class="handout(?: page-break)?">/g) ?? [];
    expect(sections).toHaveLength(3);
    const breaks = html.match(/class="handout page-break"/g) ?? [];
    expect(breaks).toHaveLength(2);
    expect(html).toContain("Alpha");
    expect(html).toContain("Beta");
    expect(html).toContain("Gamma");
  });

  it("escapes HTML in entity title, type, aliases, and summary", () => {
    const html = buildHandoutHtml([
      entity({
        id: "x",
        title: "<script>alert(1)</script>",
        type: "<b>npc</b>",
        aliases: ["<i>nick</i>"],
        summary: "<img onerror=x>",
      }),
    ]);
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).not.toContain("<b>npc</b>");
    expect(html).not.toContain("<i>nick</i>");
    expect(html).not.toContain("<img onerror=x>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("renders bodyHtml as-is (already sanitized at build time)", () => {
    const html = buildHandoutHtml([
      entity({
        id: "x",
        title: "X",
        bodyHtml: '<p>See <a class="atlas-wikilink" href="#y">Yvette</a>.</p>',
      }),
    ]);
    expect(html).toContain('<a class="atlas-wikilink"');
  });

  it("uses entity title as doc title for single, count label for bundle", () => {
    const single = buildHandoutHtml([entity({ id: "a", title: "Alpha" })]);
    expect(single).toMatch(/<title>Alpha[^<]*<\/title>/);

    const bundle = buildHandoutHtml([
      entity({ id: "a", title: "Alpha" }),
      entity({ id: "b", title: "Beta" }),
    ]);
    expect(bundle).toMatch(/<title>2 entities[^<]*<\/title>/);
  });

  it("returns a graceful empty-state doc for an empty bundle", () => {
    const html = buildHandoutHtml([]);
    expect(html).toContain("<!doctype html>");
    expect(html).toMatch(/no entities/i);
    expect(html).not.toContain('class="handout page-break"');
  });

  it("emits absolute-base asset URLs for hero images", () => {
    const html = buildHandoutHtml([
      entity({ id: "a", title: "A", images: ["atlas/assets/img.jpg"] }),
    ]);
    expect(html).toContain('class="hero"');
    expect(html).toMatch(/src="[^"]*atlas\/assets\/img\.jpg"/);
  });
});
