import { it, expect } from "vitest";
import { renderLinkTokens } from "@/atlas/content/parseWikilinks";
import type { ResolvedLink } from "@/atlas/content/schema";

it("resolved wikilink anchors advertise a dialog popup", () => {
  const links: ResolvedLink[] = [{ target: "Saltmere", display: "Saltmere", resolvedId: "saltmere", broken: false }];
  const html = renderLinkTokens("⁣LINK[0]⁣", links);
  expect(html).toContain('aria-haspopup="dialog"');
  expect(html).toContain('class="atlas-wikilink"');
});
