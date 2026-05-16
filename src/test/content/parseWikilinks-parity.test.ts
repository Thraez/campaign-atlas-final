import { describe, it, expect } from "vitest";
import { tokenizeWikilinks as fromSrc, renderLinkTokens as renderSrc } from "@/atlas/content/parseWikilinks";
import { tokenizeWikilinks as fromScripts, renderLinkTokens as renderScripts } from "../../../scripts/atlas/parseWikilinks";

const BODY = `See [[Tidemarrow]] and [[Corven|the smuggler]] plus [[Unknown Place]].`;
const ctx = { resolveByName: (n: string) => (n.toLowerCase() === "tidemarrow" ? "tidemarrow" : n.toLowerCase() === "corven" ? "corven" : undefined) };

describe("parseWikilinks parity (one source of truth)", () => {
  it("tokenize: src and scripts entrypoints are identical", () => {
    expect(fromSrc(BODY, ctx)).toEqual(fromScripts(BODY, ctx));
  });
  it("render: src and scripts entrypoints are identical (hideBroken on and off)", () => {
    const a = fromSrc(BODY, ctx);
    const html = `<p>${a.tokenized}</p>`;
    expect(renderSrc(html, a.links, { hideBroken: true })).toEqual(renderScripts(html, a.links, { hideBroken: true }));
    expect(renderSrc(html, a.links, {})).toEqual(renderScripts(html, a.links, {}));
  });
});
