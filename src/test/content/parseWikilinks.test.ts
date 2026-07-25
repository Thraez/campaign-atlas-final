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
    expect(html).toContain("atlas-planned-link-player");
    expect(html).not.toContain("atlas-planned-link\"");
  });

  it("hideBroken: false — broken link exposes target in title attribute (DM view)", () => {
    const { tokenized, links } = tokenizeWikilinks("[[Unknown Place]]", {
      resolveByName: () => undefined,
    });
    const html = renderLinkTokens(`<p>${tokenized}</p>`, links, { hideBroken: false });
    expect(html).toContain("Unknown Place");
    expect(html).toContain("title=");
    expect(html).toContain("Planned link");
    expect(html).toContain("atlas-planned-link\"");
    expect(html).not.toContain("atlas-planned-link-player");
  });

  it("default opts (no hideBroken) — same as hideBroken: false, title attribute present", () => {
    const { tokenized, links } = tokenizeWikilinks("[[Somewhere]]", {
      resolveByName: () => undefined,
    });
    const html = renderLinkTokens(`<p>${tokenized}</p>`, links);
    expect(html).toContain("title=");
    expect(html).toContain("atlas-planned-link\"");
  });

  it("resolved link → renders <a> with entity id and href, no planned-link class", () => {
    const { tokenized, links } = tokenizeWikilinks("[[Corven]]", {
      resolveByName: RESOLVE_KNOWN,
    });
    const html = renderLinkTokens(`<p>${tokenized}</p>`, links);
    expect(html).toContain('class="atlas-wikilink"');
    expect(html).toContain('data-entity-id="corven"');
    expect(html).toContain('href="#/entity/corven"');
    expect(html).toContain("Corven");
    expect(html).not.toContain("atlas-unresolved");
    expect(html).not.toContain("atlas-planned-link");
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

describe("tokenizeWikilinks — heading-anchor wikilinks (Q48)", () => {
  it("[[Note#Heading]] resolves via the file part only, display falls back to the file part", () => {
    const { links } = tokenizeWikilinks("[[Corven#Backstory]]", { resolveByName: RESOLVE_KNOWN });
    expect(links[0].target).toBe("Corven#Backstory");
    expect(links[0].display).toBe("Corven");
    expect(links[0].resolvedId).toBe("corven");
    expect(links[0].broken).toBe(false);
  });

  it("[[Note#Heading|Alias]] keeps the explicit alias as display", () => {
    const { links } = tokenizeWikilinks("[[Corven#Backstory|his past]]", { resolveByName: RESOLVE_KNOWN });
    expect(links[0].target).toBe("Corven#Backstory");
    expect(links[0].display).toBe("his past");
    expect(links[0].resolvedId).toBe("corven");
  });

  it("[[UnknownNote#Heading]] with an unresolvable file part is broken (not an anchor)", () => {
    const { links } = tokenizeWikilinks("[[Ghost Town#History]]", { resolveByName: RESOLVE_KNOWN });
    expect(links[0].target).toBe("Ghost Town#History");
    expect(links[0].resolvedId).toBeUndefined();
    expect(links[0].broken).toBe(true);
  });

  it("[[#Heading]] (empty file part) is a same-note anchor: never resolved, never broken", () => {
    const { links } = tokenizeWikilinks("[[#Backstory]]", { resolveByName: RESOLVE_KNOWN });
    expect(links[0].target).toBe("#Backstory");
    expect(links[0].resolvedId).toBeUndefined();
    expect(links[0].broken).toBe(false);
    expect(links[0].display).toBe("Backstory");
  });

  it("[[Note#^blockid]] resolves the note only — block ref is never used for resolution", () => {
    const { links } = tokenizeWikilinks("[[Corven#^abc123]]", { resolveByName: RESOLVE_KNOWN });
    expect(links[0].target).toBe("Corven#^abc123");
    expect(links[0].resolvedId).toBe("corven");
    expect(links[0].display).toBe("Corven");
  });

  it("renderLinkTokens: [[Note#Heading]] renders a navigable link to Note", () => {
    const { tokenized, links } = tokenizeWikilinks("[[Corven#Backstory]]", { resolveByName: RESOLVE_KNOWN });
    const html = renderLinkTokens(`<p>${tokenized}</p>`, links);
    expect(html).toContain('class="atlas-wikilink"');
    expect(html).toContain('data-entity-id="corven"');
    expect(html).toContain("Corven");
    expect(html).not.toContain("atlas-wikilink-anchor");
  });

  it("renderLinkTokens: [[#Heading]] renders an inert atlas-wikilink-anchor span, not a broken/planned link", () => {
    const { tokenized, links } = tokenizeWikilinks("[[#Backstory]]", { resolveByName: RESOLVE_KNOWN });
    const html = renderLinkTokens(`<p>${tokenized}</p>`, links);
    expect(html).toContain('class="atlas-wikilink-anchor"');
    expect(html).toContain("Backstory");
    expect(html).not.toContain("atlas-planned-link");
    expect(html).not.toContain("<a ");
  });
});

describe("tokenizeWikilinks — folder-path wikilinks resolve by basename (Q49)", () => {
  const RESOLVE_BY_BASENAME_UNIQUE = (n: string): string | undefined =>
    n.toLowerCase() === "tidemarrow" ? "tidemarrow" : undefined;

  it("[[Folder/Note]] with an unresolved full string rescues via resolveByBasename", () => {
    const { links } = tokenizeWikilinks("[[02_Regions/Tidemarrow]]", {
      resolveByName: RESOLVE_KNOWN,
      resolveByBasename: RESOLVE_BY_BASENAME_UNIQUE,
    });
    expect(links[0].target).toBe("02_Regions/Tidemarrow");
    expect(links[0].display).toBe("02_Regions/Tidemarrow");
    expect(links[0].resolvedId).toBe("tidemarrow");
    expect(links[0].broken).toBe(false);
  });

  it("no resolveByBasename provided → folder-path link stays broken (backward compatible)", () => {
    const { links } = tokenizeWikilinks("[[02_Regions/Tidemarrow]]", { resolveByName: RESOLVE_KNOWN });
    expect(links[0].resolvedId).toBeUndefined();
    expect(links[0].broken).toBe(true);
  });

  it("resolveByBasename returning undefined (ambiguous basename) leaves the link broken — no wrong-note resolution", () => {
    const { links } = tokenizeWikilinks("[[02_Regions/Tidemarrow]]", {
      resolveByName: RESOLVE_KNOWN,
      resolveByBasename: () => undefined,
    });
    expect(links[0].resolvedId).toBeUndefined();
    expect(links[0].broken).toBe(true);
    expect(links[0].target).toBe("02_Regions/Tidemarrow");
  });

  it("already-resolving full-string target is unaffected by resolveByBasename (never called)", () => {
    let basenameCalls = 0;
    const { links } = tokenizeWikilinks("[[Corven]]", {
      resolveByName: RESOLVE_KNOWN,
      resolveByBasename: () => {
        basenameCalls += 1;
        return undefined;
      },
    });
    expect(links[0].resolvedId).toBe("corven");
    expect(basenameCalls).toBe(0);
  });

  it("a target with no '/' never triggers the basename fallback, even when unresolved", () => {
    let basenameCalls = 0;
    const { links } = tokenizeWikilinks("[[Ghost Town]]", {
      resolveByName: RESOLVE_KNOWN,
      resolveByBasename: () => {
        basenameCalls += 1;
        return "should-not-be-used";
      },
    });
    expect(links[0].resolvedId).toBeUndefined();
    expect(links[0].broken).toBe(true);
    expect(basenameCalls).toBe(0);
  });

  it("[[Folder/Note|Alias]] keeps the explicit alias as display when rescued via basename", () => {
    const { links } = tokenizeWikilinks("[[02_Regions/Tidemarrow|the coastal city]]", {
      resolveByName: RESOLVE_KNOWN,
      resolveByBasename: RESOLVE_BY_BASENAME_UNIQUE,
    });
    expect(links[0].display).toBe("the coastal city");
    expect(links[0].resolvedId).toBe("tidemarrow");
  });

  it("nested folder path resolves via the trailing segment only", () => {
    const { links } = tokenizeWikilinks("[[World/02_Regions/Tidemarrow]]", {
      resolveByName: RESOLVE_KNOWN,
      resolveByBasename: RESOLVE_BY_BASENAME_UNIQUE,
    });
    expect(links[0].resolvedId).toBe("tidemarrow");
  });

  it("target is a bare trailing slash ([[Folder/]]) never calls resolveByBasename with an empty string", () => {
    let seenArg: string | undefined;
    const { links } = tokenizeWikilinks("[[Folder/]]", {
      resolveByName: RESOLVE_KNOWN,
      resolveByBasename: (n) => {
        seenArg = n;
        return undefined;
      },
    });
    expect(seenArg).toBeUndefined();
    expect(links[0].broken).toBe(true);
  });
});

describe("renderLinkTokens — planned-link cross-surface (N26)", () => {
  const RESOLVE = (n: string) => (n === "Corven" ? "corven" : undefined);

  it("DM surface (hideBroken: false): broken link → atlas-planned-link with title containing target", () => {
    const { tokenized, links } = tokenizeWikilinks("[[Ghost Town]]", { resolveByName: RESOLVE });
    const html = renderLinkTokens(`<p>${tokenized}</p>`, links, { hideBroken: false });
    expect(html).toContain('class="atlas-planned-link"');
    expect(html).toContain('title="Planned link: Ghost Town"');
    expect(html).toContain("Ghost Town");
    expect(html).not.toContain("atlas-planned-link-player");
    expect(html).not.toContain("atlas-unresolved");
  });

  it("player surface (hideBroken: true): broken link → atlas-planned-link-player, no title, no raw target", () => {
    const { tokenized, links } = tokenizeWikilinks("[[Secret Place|the place]]", { resolveByName: RESOLVE });
    const html = renderLinkTokens(`<p>${tokenized}</p>`, links, { hideBroken: true });
    expect(html).toContain('class="atlas-planned-link-player"');
    expect(html).toContain("the place");
    expect(html).not.toContain("Secret Place");
    expect(html).not.toContain("title=");
    expect(html).not.toContain("atlas-planned-link\"");
    expect(html).not.toContain("atlas-unresolved");
  });

  it("both surfaces: resolved link → atlas-wikilink <a>, unaffected by planned-link change", () => {
    const { tokenized, links } = tokenizeWikilinks("[[Corven]]", { resolveByName: RESOLVE });
    const htmlDm = renderLinkTokens(`<p>${tokenized}</p>`, links, { hideBroken: false });
    const htmlPlayer = renderLinkTokens(`<p>${tokenized}</p>`, links, { hideBroken: true });
    for (const html of [htmlDm, htmlPlayer]) {
      expect(html).toContain('class="atlas-wikilink"');
      expect(html).not.toContain("atlas-planned-link");
      expect(html).not.toContain("atlas-unresolved");
    }
  });
});
