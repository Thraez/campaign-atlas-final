import { it, expect } from "vitest";
import { sanitizeAtlasHtml } from "@/atlas/sanitizeHtml";

it("keeps data-entity-id on a wikilink anchor", () => {
  const out = sanitizeAtlasHtml('<a class="atlas-wikilink" data-entity-id="saltmere" href="#/entity/saltmere">Saltmere</a>');
  expect(out).toContain('data-entity-id="saltmere"');
  expect(out).toContain('href="#/entity/saltmere"');
});

it("keeps aria-haspopup on a wikilink anchor", () => {
  const out = sanitizeAtlasHtml('<a class="atlas-wikilink" data-entity-id="saltmere" href="#/entity/saltmere" aria-haspopup="dialog">Saltmere</a>');
  expect(out).toContain('aria-haspopup="dialog"');
  expect(out).toContain('data-entity-id="saltmere"');
});
