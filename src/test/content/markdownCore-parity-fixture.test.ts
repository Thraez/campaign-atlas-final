import { describe, it, expect } from "vitest";
import { markdownToHtml, renderMarkdownBodyToSafeHtml } from "@/atlas/content/markdownCore";
import { tokenizeWikilinks, renderLinkTokens } from "@/atlas/content/parseWikilinks";
import { sanitizeAtlasHtml } from "@/atlas/sanitizeHtml";

/**
 * Phase 3 residual-parity lock. One representative DM note that exercises
 * every in-scope Obsidian-core construct at once. This is the executable
 * counterpart to docs/MARKDOWN_PARITY.md: if the structural assertions
 * below hold, "no difference for the in-scope set" is true and locked
 * against regression. Out-of-scope constructs (embeds, math, mermaid,
 * tags, community plugins) are deliberately absent — see the doc.
 */
const NOTE = `# The Sunken Vault

## Overview

A flooded dwarven vault beneath the city.
The water rises a foot each night.

It hides a **relic** and a *curse*, and the air tastes ==wrong==.

## Approaches

- Sewer grate (loud)
- Collapsed stair
- Diver's tunnel

1. Bribe the harbormaster
2. Steal the tide-key

## Prep checklist

- [ ] Stat the drowned guardian
- [x] Map the lower level

## Loot table

| Item | Value |
|---|---|
| Tide-key | priceless |
| Wet ledger | 5 gp |

> A warning is carved by the door.

> [!warning]- Trap (DM)
> Pressure plate floods the room in 3 rounds.

The ledger names a traitor[^t].

\`\`\`
secret = "do not read aloud"
\`\`\`

~~The bridge is safe.~~

[^t]: Councilman Brann, in the player's pay.
`;

describe("Phase 3 parity fixture — representative DM note", () => {
  const html = markdownToHtml(NOTE);

  it("renders headings", () => {
    expect(html).toContain("<h1>The Sunken Vault</h1>");
    expect(html).toContain("<h2>Overview</h2>");
  });

  it("renders a single newline inside a paragraph as <br> (Obsidian parity)", () => {
    expect(html).toMatch(/A flooded dwarven vault beneath the city\.<br>\s*The water rises a foot each night\./);
  });

  it("keeps a blank line as a separate paragraph, not a <br>-join", () => {
    expect(html).toContain("<p>A flooded dwarven vault");
    // The "It hides a relic..." sentence is after a blank line → its own <p>.
    expect(html).toMatch(/<p>It hides a <strong>relic<\/strong>/);
  });

  it("renders inline emphasis and highlight", () => {
    expect(html).toContain("<strong>relic</strong>");
    expect(html).toContain("<em>curse</em>");
    expect(html).toContain("<mark>wrong</mark>");
  });

  it("renders bullet and ordered lists", () => {
    expect(html).toContain("<li>Sewer grate (loud)</li>");
    expect(html).toContain("<ol>");
    expect(html).toContain("Bribe the harbormaster");
  });

  it("renders a class-based task list (no <input>)", () => {
    expect(html).not.toContain("<input");
    expect(html).toContain("atlas-task-item");
    expect(html).toContain("atlas-task-done");
  });

  it("renders a GFM table", () => {
    expect(html).toContain("<table>");
    expect(html).toContain("Tide-key");
  });

  it("renders a blockquote and a foldable callout", () => {
    expect(html).toContain("<blockquote>");
    expect(html).toContain('<details class="atlas-callout atlas-callout-warning"');
    // `[!warning]-` is collapsed → no `open` attr; `>` follows data-callout directly.
    expect(html).toContain('data-callout="warning">');
    expect(html).toContain("Pressure plate floods");
  });

  it("renders a numbered footnote with backref", () => {
    expect(html).toContain('href="#fn-t"');
    expect(html).toContain('id="fn-t"');
    expect(html).toContain("Councilman Brann");
    expect(html).toContain("footnotes");
  });

  it("renders a fenced code block and strikethrough", () => {
    expect(html).toContain("<pre>");
    expect(html).toContain("do not read aloud");
    expect(html).toContain("<del>The bridge is safe.</del>");
  });

  it("is deterministic (same input → same output)", () => {
    expect(markdownToHtml(NOTE)).toBe(markdownToHtml(NOTE));
  });

  it("survives the sanitizer with every construct intact", () => {
    const safe = renderMarkdownBodyToSafeHtml(NOTE);
    expect(safe).toContain("<mark>wrong</mark>");
    expect(safe).toContain("atlas-callout-warning");
    expect(safe).toContain("atlas-task-done");
    expect(safe).toContain('id="fn-t"');
    expect(safe).toContain("<br>");
    expect(safe).not.toContain("<script");
  });

  it("DM-pane path and direct core render agree on structure (cross-surface parity)", () => {
    const { tokenized, links } = tokenizeWikilinks(NOTE, { resolveByName: () => undefined });
    const panePath = sanitizeAtlasHtml(renderLinkTokens(markdownToHtml(tokenized), links, {}));
    const corePath = renderMarkdownBodyToSafeHtml(NOTE);
    expect(panePath).toBe(corePath);
  });
});
