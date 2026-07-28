import { describe, it, expect } from "vitest";
import { renderEntityMarkdown, resolveImageEmbeds } from "@/atlas/content/renderEntityMarkdown";
import { stripDmBlocks } from "@/atlas/content/stripDmBlocks";

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
  it("renders a non-image ![[Note]] embed as the inert placeholder (survives sanitization)", () => {
    const html = renderEntityMarkdown("![[Some Note]]", { showDmNotes: false });
    expect(html).toContain('<span class="atlas-embed-missing">embedded note not shown</span>');
    expect(html).not.toContain("<img");
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

describe("resolveImageEmbeds", () => {
  it("converts ![[image.png]] to standard markdown img with default path", () => {
    const out = resolveImageEmbeds("Before\n\n![[Portrait.png]]\n\nAfter");
    expect(out).toBe("Before\n\n![Portrait.png](/atlas/assets/images/Portrait.png)\n\nAfter");
  });
  it("uses provided resolveAsset when given", () => {
    const out = resolveImageEmbeds("![[face.jpg]]", (n) => `/custom/${n}`);
    expect(out).toContain("/custom/face.jpg");
  });
  it("leaves text without embeds unchanged", () => {
    const plain = "No embeds here. [[wikilink]] stays.";
    expect(resolveImageEmbeds(plain)).toBe(plain);
  });
  it("converts multiple embeds in one pass", () => {
    const out = resolveImageEmbeds("![[a.png]] and ![[b.jpg]]");
    expect(out).toContain("![a.png](/atlas/assets/images/a.png)");
    expect(out).toContain("![b.jpg](/atlas/assets/images/b.jpg)");
  });
  it("secrecy: embed inside %%-stripped body produces no img (mirrors player path)", () => {
    // stripDmBlocks runs BEFORE resolveImageEmbeds in both projectEntityForPlayer and build-atlas.
    // This test proves the ordering guarantee: the embed inside %% is already gone.
    const rawBody = "%%\n![[secret.png]]\n%%\n\nPublic text.";
    const { text: stripped } = stripDmBlocks(rawBody);
    const resolved = resolveImageEmbeds(stripped);
    expect(resolved).not.toContain("secret.png");
    expect(resolved).not.toContain("![[");
    expect(resolved).toContain("Public text.");
  });
  it("secrecy: a non-image note embed inside %% never surfaces (name or placeholder)", () => {
    // Same ordering guarantee as above, for the new non-image placeholder branch:
    // a %%-wrapped ![[Secret Note]] must never leak the note's name into player output.
    const rawBody = "%%\n![[Secret Note]]\n%%\n\nPublic text.";
    const { text: stripped } = stripDmBlocks(rawBody);
    const resolved = resolveImageEmbeds(stripped);
    expect(resolved).not.toContain("Secret Note");
    expect(resolved).not.toContain("![[");
    expect(resolved).not.toContain("atlas-embed-missing");
    expect(resolved).toContain("Public text.");
  });
  it("![[image.png|Alt text]] uses alias as alt and filename as src", () => {
    const out = resolveImageEmbeds("![[Portrait.png|Lord Corven]]");
    expect(out).toBe("![Lord Corven](/atlas/assets/images/Portrait.png)");
  });
  it("![[image.png]] without alias uses filename as alt text (unchanged behavior)", () => {
    const out = resolveImageEmbeds("![[Portrait.png]]");
    expect(out).toBe("![Portrait.png](/atlas/assets/images/Portrait.png)");
  });
  it("![[Some Note]] (no extension) renders an inert placeholder, not a broken img", () => {
    const out = resolveImageEmbeds("![[Some Note]]");
    expect(out).toBe('<span class="atlas-embed-missing">embedded note not shown</span>');
    expect(out).not.toContain("<img");
    expect(out).not.toContain("![");
  });
  it("![[doc.pdf]] (non-image extension) renders an inert placeholder", () => {
    const out = resolveImageEmbeds("![[doc.pdf]]");
    expect(out).toBe('<span class="atlas-embed-missing">embedded note not shown</span>');
  });
  it("![[Some Note|alias]] (non-image, pipe-alias) still renders the placeholder", () => {
    const out = resolveImageEmbeds("![[Some Note|shown as]]");
    expect(out).toBe('<span class="atlas-embed-missing">embedded note not shown</span>');
  });
  it("image extensions stay case-insensitive (uppercase .PNG still resolves as an image)", () => {
    const out = resolveImageEmbeds("![[Portrait.PNG]]");
    expect(out).toBe("![Portrait.PNG](/atlas/assets/images/Portrait.PNG)");
  });

  it("![[image.png|300]] sets width instead of using '300' as alt text (N112)", () => {
    const out = resolveImageEmbeds("![[Portrait.png|300]]");
    expect(out).toBe('<img src="/atlas/assets/images/Portrait.png" width="300" alt="">');
  });

  it("![[image.png|300x200]] sets both width and height (N112)", () => {
    const out = resolveImageEmbeds("![[Portrait.png|300x200]]");
    expect(out).toBe(
      '<img src="/atlas/assets/images/Portrait.png" width="300" height="200" alt="">'
    );
  });

  it("![[image.png|Lord Corven]] (non-numeric pipe) still becomes alt text, not dimensions (N112)", () => {
    const out = resolveImageEmbeds("![[Portrait.png|Lord Corven]]");
    expect(out).toBe("![Lord Corven](/atlas/assets/images/Portrait.png)");
  });

  it("resolved <img width> survives sanitization in renderEntityMarkdown (N112)", () => {
    const html = renderEntityMarkdown("![[Portrait.png|300]]", { showDmNotes: false });
    expect(html).toContain('width="300"');
  });

  it("an embed inside an inline code span is not resolved (N108)", () => {
    const body = "Shown as `![[Portrait.png]]` in docs.";
    expect(resolveImageEmbeds(body)).toBe(body);
  });

  it("an embed inside a fenced code block is not resolved (N108)", () => {
    const body = "```\n![[Portrait.png]]\n```";
    expect(resolveImageEmbeds(body)).toBe(body);
  });

  it("a real embed outside code still resolves even when code appears nearby (N108)", () => {
    const out = resolveImageEmbeds("`![[Portrait.png]]` is the syntax. ![[Portrait.png]]");
    expect(out).toContain("`![[Portrait.png]]`");
    expect(out).toContain("![Portrait.png](/atlas/assets/images/Portrait.png)");
  });
});

describe("renderEntityMarkdown edge cases", () => {
  it("empty body produces empty html", () => {
    const html = renderEntityMarkdown("", { showDmNotes: false });
    expect(html).toBe("");
  });

  it("body that is only a %% block produces empty html (whole body stripped)", () => {
    const html = renderEntityMarkdown("%%\nDM secret\n%%", { showDmNotes: false });
    expect(html).toBe("");
  });

  it("resolveImageEmbeds: resolveAsset returning empty string yields empty src (![alt]())", () => {
    const out = resolveImageEmbeds("![[img.png]]", () => "");
    expect(out).toBe("![img.png]()");
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
