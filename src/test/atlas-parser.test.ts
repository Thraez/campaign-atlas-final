import { describe, it, expect } from "vitest";
import { parseFrontmatter } from "../../scripts/atlas/parseFrontmatter";
import { stripDmBlocks } from "../../scripts/atlas/stripDmBlocks";
import { tokenizeWikilinks, renderLinkTokens } from "../../scripts/atlas/parseWikilinks";

describe("parseFrontmatter visibility safety", () => {
  it("invalid visibility falls back to dm, not player", () => {
    const raw = `---\natlas:\n  visibility: private\n---\nbody`;
    const p = parseFrontmatter(raw, "x.md");
    // Critical spoiler-protection invariant: invalid values MUST be dm.
    expect(p.atlas.visibility).toBe("dm");
    expect(p.warnings.join(" ")).toMatch(/invalid atlas.visibility/);
  });

  it("valid visibility passes through", () => {
    const raw = `---\natlas:\n  visibility: rumor\n---\n`;
    expect(parseFrontmatter(raw, "x.md").atlas.visibility).toBe("rumor");
  });

  it("missing visibility stays undefined (caller decides default)", () => {
    const p = parseFrontmatter(`---\natlas: {}\n---\n`, "x.md");
    expect(p.atlas.visibility).toBeUndefined();
  });
});

describe("stripDmBlocks", () => {
  it("removes single-line %% block %%", () => {
    const r = stripDmBlocks("hello %% secret %% world");
    expect(r.text).not.toMatch(/secret/);
    expect(r.count).toBe(1);
  });

  it("removes multi-line blocks and counts them", () => {
    const r = stripDmBlocks("a %% line1\nline2 %% b %% c %%");
    expect(r.text).not.toMatch(/line1|line2|c/);
    expect(r.count).toBe(2);
  });

  it("preserves non-DM content", () => {
    const r = stripDmBlocks("plain text only");
    expect(r.text).toContain("plain text only");
    expect(r.count).toBe(0);
  });
});

describe("tokenizeWikilinks", () => {
  const resolveByName = (n: string) => (n.toLowerCase() === "thornhold" ? "thornhold" : undefined);

  it("resolves known wikilinks", () => {
    const out = tokenizeWikilinks("see [[Thornhold]] now", { resolveByName });
    expect(out.links).toHaveLength(1);
    expect(out.links[0].resolvedId).toBe("thornhold");
    expect(out.links[0].broken).toBe(false);
  });

  it("flags unresolved wikilinks but does not throw", () => {
    const out = tokenizeWikilinks("see [[Atlantis]]", { resolveByName });
    // Unresolved = "note not yet created" — allowed, just flagged.
    expect(out.links[0].broken).toBe(true);
  });

  it("supports display alias [[Target|Display]]", () => {
    const out = tokenizeWikilinks("[[Thornhold|the keep]]", { resolveByName });
    expect(out.links[0].display).toBe("the keep");
  });
});

describe("renderLinkTokens — player safety", () => {
  const links = [{ target: "Secret Vault", display: "the vault", resolvedId: undefined, broken: true }];
  const html = `before \u2063LINK[0]\u2063 after`;

  it("player build does NOT leak the raw target name in title=", () => {
    const out = renderLinkTokens(html, links, { hideBroken: true });
    expect(out).not.toMatch(/Secret Vault/);
    expect(out).toMatch(/the vault/);
    expect(out).toMatch(/atlas-unresolved/);
  });

  it("DM build still shows target in tooltip for authoring help", () => {
    const out = renderLinkTokens(html, links, { hideBroken: false });
    expect(out).toMatch(/Secret Vault/);
  });
});

