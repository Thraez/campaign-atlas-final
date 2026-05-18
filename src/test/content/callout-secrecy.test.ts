// src/test/content/callout-secrecy.test.ts
import { describe, it, expect } from "vitest";
import { renderEntityMarkdown } from "@/atlas/content/renderEntityMarkdown";

describe("callout secrecy", () => {
  const body = [
    "Public intro.",
    "",
    "%%",
    "> [!danger] The lich's phylactery",
    "> is in the well.",
    "%%",
    "",
    "Public outro.",
  ].join("\n");

  it("player render (showDmNotes:false) contains no callout and no secret text", () => {
    const html = renderEntityMarkdown(body, { showDmNotes: false });
    expect(html).toContain("Public intro.");
    expect(html).toContain("Public outro.");
    expect(html).not.toContain("phylactery");
    expect(html).not.toContain("data-callout");
  });

  it("DM render (showDmNotes:true) keeps the callout", () => {
    const html = renderEntityMarkdown(body, { showDmNotes: true });
    expect(html).toContain('data-callout="danger"');
    expect(html).toContain("phylactery");
  });
});
