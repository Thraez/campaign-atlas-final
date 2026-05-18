// src/test/content/markdownCore-callout.test.ts
import { describe, it, expect } from "vitest";
import { sanitizeAtlasHtml } from "@/atlas/sanitizeHtml";

describe("sanitizer allows callout markup", () => {
  it("keeps details/summary/open/data-callout", () => {
    const html = `<details class="atlas-callout atlas-callout-note" data-callout="note" open><summary>Note</summary><p>body</p></details>`;
    const out = sanitizeAtlasHtml(html);
    expect(out).toContain("<details");
    expect(out).toContain('data-callout="note"');
    expect(out).toContain("open");
    expect(out).toContain("<summary>Note</summary>");
  });
});
