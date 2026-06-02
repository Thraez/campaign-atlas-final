import { describe, it, expect } from "vitest";
import { tokenizeWikilinks, renderLinkTokens } from "@/atlas/content/parseWikilinks";

const RESOLVE_KNOWN = (name: string): string | undefined =>
  name.toLowerCase() === "corven" ? "corven" : undefined;

describe("tokenizeWikilinks", () => {
  it("empty body → no links, text unchanged", () => {
    const { tokenized, links } = tokenizeWikilinks("", { resolveByName: RESOLVE_KNOWN });
    expect(links).toHaveLength(0);
    expect(tokenized).toBe("");
  });

  it("body with no wikilinks passes through, no links recorded", () => {
    const body = "Plain text with no brackets.";
    const { tokenized, links } = tokenizeWikilinks(body, { resolveByName: RESOLVE_KNOWN });
    expect(links).toHaveLength(0);
    expect(tokenized).toBe(body);
  });

  it("resolved wikilink → resolvedId set, broken false, display equals target", () => {
    const { links } = tokenizeWikilinks("[[Corven]]", { resolveByName: RESOLVE_KNOWN });
    expect(links).toHaveLength(1);
    expect(links[0].target).toBe("Corven");
    expect(links[0].display).toBe("Corven");
    expect(links[0].resolvedId).toBe("corven");
    expect(links[0].broken).toBe(false);
  });

  it("piped alias: display and target recorded separately", () => {
    const { links } = tokenizeWikilinks("[[Corven|the smuggler]]", { resolveByName: RESOLVE_KNOWN });
    expect(links[0].target).toBe("Corven");
    expect(links[0].display).toBe("the smuggler");
    expect(links[0].resolvedId).toBe("corven");
    expect(links[0].broken).toBe(false);
  });

  it("unresolved wikilink → broken true, resolvedId undefined", () => {
    const { links } = tokenizeWikilinks("[[Ghost Town]]", { resolveByName: RESOLVE_KNOWN });
    expect(links[0].broken).toBe(true);
    expect(links[0].resolvedId).toBeUndefined();
    expect(links[0].target).toBe("Ghost Town");
    expect(links[0].display).toBe("Ghost Town");
  });

  it("wikilinks in body are replaced with placeholder tokens (not raw brackets)", () => {
    const { tokenized } = tokenizeWikilinks("See [[Corven]].", { resolveByName: RESOLVE_KNOWN });
    expect(tokenized).not.toContain("[[Corven]]");
    expect(tokenized).toContain("LINK[");
  });

  it("multiple wikilinks → multiple links collected in document order", () => {
    const { links } = tokenizeWikilinks("[[Corven]] and [[Unknown]]", {
      resolveByName: RESOLVE_KNOWN,
    });
    expect(links).toHaveLength(2);
    expect(links[0].target).toBe("Corven");
    expect(links[1].target).toBe("Unknown");
  });
});

describe("renderLinkTokens — security invariant (player builds)", () => {
  it("hideBroken: true — broken aliased link shows display text only, never leaks raw target", () => {
    const { tokenized, links } = tokenizeWikilinks("[[DM-Secret NPC|the stranger]]", {
      resolveByName: () => undefined,
    });
    const html = renderLinkTokens(`<p>${tokenized}</p>`, links, { hideBroken: true });
    expect(html).toContain("the stranger");
    expect(html).not.toContain("DM-Secret NPC");
    expect(html).not.toContain("title=");
  });

  it("hideBroken: false — broken link exposes target in title attribute (DM view)", () => {
    const { tokenized, links } = tokenizeWikilinks("[[Unknown Place]]", {
      resolveByName: () => undefined,
    });
    const html = renderLinkTokens(`<p>${tokenized}</p>`, links, { hideBroken: false });
    expect(html).toContain("Unknown Place");
    expect(html).toContain("title=");
    expect(html).toContain("Unresolved link");
  });

  it("default opts (no hideBroken) — same as hideBroken: false, title attribute present", () => {
    const { tokenized, links } = tokenizeWikilinks("[[Somewhere]]", {
      resolveByName: () => undefined,
    });
    const html = renderLinkTokens(`<p>${tokenized}</p>`, links);
    expect(html).toContain("title=");
  });

  it("resolved link → renders <a> with entity id and href, no unresolved class", () => {
    const { tokenized, links } = tokenizeWikilinks("[[Corven]]", {
      resolveByName: RESOLVE_KNOWN,
    });
    const html = renderLinkTokens(`<p>${tokenized}</p>`, links);
    expect(html).toContain('class="atlas-wikilink"');
    expect(html).toContain('data-entity-id="corven"');
    expect(html).toContain('href="#/entity/corven"');
    expect(html).toContain("Corven");
    expect(html).not.toContain("atlas-unresolved");
  });

  it("HTML-special chars in broken target are escaped in title attribute (XSS guard)", () => {
    const { tokenized, links } = tokenizeWikilinks('[[<script>"xss"</script>]]', {
      resolveByName: () => undefined,
    });
    const html = renderLinkTokens(`<p>${tokenized}</p>`, links, { hideBroken: false });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&quot;xss&quot;");
  });

  it("HTML-special chars in display text are escaped in rendered span", () => {
    const { tokenized, links } = tokenizeWikilinks('[[X|a <b> name]]', {
      resolveByName: () => undefined,
    });
    const html = renderLinkTokens(`<p>${tokenized}</p>`, links, { hideBroken: true });
    expect(html).not.toContain("<b>");
    expect(html).toContain("&lt;b&gt;");
  });

  it("resolved entity id with spaces → href is URL-encoded", () => {
    const resolver = (n: string): string | undefined =>
      n === "The Keep" ? "the keep" : undefined;
    const { tokenized, links } = tokenizeWikilinks("[[The Keep]]", {
      resolveByName: resolver,
    });
    const html = renderLinkTokens(`<p>${tokenized}</p>`, links);
    expect(html).toContain('href="#/entity/the%20keep"');
  });

  it("out-of-bounds token index renders as empty string (no crash)", () => {
    // Tokenize two links but only pass the first to renderLinkTokens.
    // The second token has no backing link entry → guard returns "".
    const { tokenized, links } = tokenizeWikilinks("[[A]][[B]]", {
      resolveByName: () => undefined,
    });
    const html = renderLinkTokens(`<p>${tokenized}</p>`, [links[0]]);
    expect(html).not.toContain("undefined");
    // Index 0 is rendered; index 1 produces "" (no crash)
    expect(html).toContain("A");
  });
});
