/**
 * Tests for the handout HTML builder used by single-entity printing
 * (player viewer) and the multi-entity bundle (DM editor).
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { toast } from "sonner";
import { buildHandoutHtml, printEntityHandout, printEntityBundle } from "../atlas/printHandout";
import type { Entity } from "../atlas/content/schema";
import type { EntityRelationship } from "../atlas/profiles/profileTypes";

vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

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
    relationships: over.relationships,
  };
}

function rel(over: Partial<EntityRelationship> & { entity: string; type: string }): EntityRelationship {
  return {
    entity: over.entity,
    type: over.type,
    label: over.label,
    description: over.description,
    visibility: over.visibility ?? "player",
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

  it("omits Connections block when entity has no relationships", () => {
    const html = buildHandoutHtml([entity({ id: "a", title: "Alice" })]);
    expect(html).not.toContain("Connections");
    expect(html).not.toContain('class="connections"');
  });

  it("renders Connections block with resolved target title", () => {
    const bob = entity({ id: "bob", title: "Bob the Merchant" });
    const entitiesById = new Map([["bob", bob]]);
    const html = buildHandoutHtml(
      [entity({ id: "alice", title: "Alice", relationships: [rel({ entity: "bob", type: "ally" })] })],
      entitiesById,
    );
    expect(html).toContain("Connections");
    expect(html).toContain("Bob the Merchant");
    expect(html).toContain("ally");
  });

  it("uses r.label over r.type in Connections when label is present", () => {
    const entitiesById = new Map([["bob", entity({ id: "bob", title: "Bob" })]]);
    const html = buildHandoutHtml(
      [
        entity({
          id: "alice",
          title: "Alice",
          relationships: [rel({ entity: "bob", type: "ally", label: "Trade partner" })],
        }),
      ],
      entitiesById,
    );
    expect(html).toContain("Trade partner");
    expect(html).not.toContain(">ally<");
  });

  it("falls back to raw entity id when target is not in entitiesById", () => {
    const html = buildHandoutHtml(
      [
        entity({
          id: "alice",
          title: "Alice",
          relationships: [rel({ entity: "unknown-id", type: "rival" })],
        }),
      ],
      new Map(),
    );
    expect(html).toContain("unknown-id");
    expect(html).toContain("rival");
  });

  it("escapes HTML in relationship label and target title", () => {
    const evil = entity({ id: "evil", title: "<script>evil()</script>" });
    const entitiesById = new Map([["evil", evil]]);
    const html = buildHandoutHtml(
      [
        entity({
          id: "alice",
          title: "Alice",
          relationships: [rel({ entity: "evil", type: "rival", label: "<b>enemy</b>" })],
        }),
      ],
      entitiesById,
    );
    expect(html).not.toContain("<script>evil()</script>");
    expect(html).not.toContain("<b>enemy</b>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&lt;b&gt;");
  });
});

describe("Q16: pop-up guard — toast instead of alert", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.mocked(toast.error).mockClear();
  });

  function mockPopupBlocked() {
    vi.spyOn(window, "open").mockReturnValue(null);
  }

  function mockPopupAllowed() {
    const fakeDoc = { open: vi.fn(), write: vi.fn(), close: vi.fn() };
    const fakeWin = { document: fakeDoc } as unknown as Window;
    vi.spyOn(window, "open").mockReturnValue(fakeWin);
    return fakeDoc;
  }

  it("calls toast.error and returns false when the pop-up is blocked", () => {
    mockPopupBlocked();
    const e = entity({ id: "a", title: "Alpha" });
    const result = printEntityHandout(e);
    expect(result).toBe(false);
    expect(vi.mocked(toast.error)).toHaveBeenCalledOnce();
    expect(vi.mocked(toast.error).mock.calls[0][0]).toMatch(/pop-up/i);
  });

  it("does not call toast.error and returns true when the pop-up opens", () => {
    const fakeDoc = mockPopupAllowed();
    const e = entity({ id: "a", title: "Alpha" });
    const result = printEntityHandout(e);
    expect(result).toBe(true);
    expect(vi.mocked(toast.error)).not.toHaveBeenCalled();
    expect(fakeDoc.write).toHaveBeenCalledOnce();
  });

  it("printEntityBundle returns false and toasts when blocked", () => {
    mockPopupBlocked();
    const result = printEntityBundle([entity({ id: "a", title: "Alpha" })]);
    expect(result).toBe(false);
    expect(vi.mocked(toast.error)).toHaveBeenCalledOnce();
  });

  it("printEntityBundle returns true and writes HTML when allowed", () => {
    const fakeDoc = mockPopupAllowed();
    const result = printEntityBundle([entity({ id: "a", title: "Alpha" })]);
    expect(result).toBe(true);
    expect(fakeDoc.write).toHaveBeenCalledOnce();
  });
});
