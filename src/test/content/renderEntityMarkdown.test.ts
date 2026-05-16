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
