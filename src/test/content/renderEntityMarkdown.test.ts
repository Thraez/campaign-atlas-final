import { describe, it, expect } from "vitest";
import { renderEntityMarkdown } from "@/atlas/content/renderEntityMarkdown";

describe("renderEntityMarkdown", () => {
  const body = `# Corven

%%
secret DM truth
%%

![[Corven.png]]

A [[Tidemarrow|home]] city.
`;
  it("hides %% by default and renders markdown to sanitized html", () => {
    const html = renderEntityMarkdown(body, { showDmNotes: false });
    expect(html).toContain("<h1");
    expect(html).not.toContain("secret DM truth");
  });
  it("reveals %% when showDmNotes is true", () => {
    const html = renderEntityMarkdown(body, { showDmNotes: true });
    expect(html).toContain("secret DM truth");
  });
  it("resolves ![[image]] embeds to an <img>", () => {
    const html = renderEntityMarkdown(body, {
      showDmNotes: false,
      resolveAsset: (name) => `/atlas/assets/images/${name.toLowerCase()}`,
    });
    expect(html).toContain('<img');
    expect(html).toContain("corven.png");
  });
  it("renders [[wikilink|alias]] as a styled reference (alias text)", () => {
    const html = renderEntityMarkdown(body, { showDmNotes: false });
    expect(html).toContain("home");
    expect(html).not.toContain("[[Tidemarrow|home]]");
  });
});

describe("renderEntityMarkdown anchor-wikilinks", () => {
  it("[[Target#Section]] uses entity name as data-link, full text as label", () => {
    const html = renderEntityMarkdown("[[Tidemarrow#History]]", { showDmNotes: false });
    expect(html).toContain('data-link="Tidemarrow"');
    expect(html).toContain("Tidemarrow#History");
    expect(html).not.toContain('data-link="Tidemarrow#History"');
  });

  it("[[Target#Section|alias]] uses entity name as data-link, alias as label", () => {
    const html = renderEntityMarkdown("[[Tidemarrow#History|the old port]]", { showDmNotes: false });
    expect(html).toContain('data-link="Tidemarrow"');
    expect(html).toContain("the old port");
    expect(html).not.toContain('data-link="Tidemarrow#History"');
  });

  it("[[Target]] without anchor unchanged: data-link is the full target", () => {
    const html = renderEntityMarkdown("[[Tidemarrow]]", { showDmNotes: false });
    expect(html).toContain('data-link="Tidemarrow"');
    expect(html).toContain("Tidemarrow");
  });
});

describe("renderEntityMarkdown highlight secrecy", () => {
  const bodyWithSecret = [
    "Public text.",
    "",
    "%%",
    "==secret highlight==",
    "%%",
    "",
    "==visible highlight==",
  ].join("\n");

  it("player render strips highlight inside %% block", () => {
    const html = renderEntityMarkdown(bodyWithSecret, { showDmNotes: false });
    expect(html).toContain("Public text.");
    expect(html).not.toContain("secret highlight");
    expect(html).not.toContain('<mark>secret highlight</mark>');
    expect(html).toContain("<mark>visible highlight</mark>");
  });

  it("DM render keeps highlight inside %% block", () => {
    const html = renderEntityMarkdown(bodyWithSecret, { showDmNotes: true });
    expect(html).toContain("secret highlight");
  });
});
