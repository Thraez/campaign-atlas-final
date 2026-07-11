import { it, expect } from "vitest";
import { resolvePeekEntityId } from "@/atlas/peek/resolvePeekEntityId";

function anchor(html: string): HTMLElement {
  return new DOMParser().parseFromString(html, "text/html").body.firstElementChild as HTMLElement;
}

it("reads data-entity-id when present", () => {
  expect(resolvePeekEntityId(anchor('<a class="atlas-wikilink" data-entity-id="saltmere" href="#/entity/saltmere">x</a>'))).toBe("saltmere");
});

it("falls back to decoding the href hash", () => {
  expect(resolvePeekEntityId(anchor('<a class="atlas-wikilink" href="#/entity/old%20keep">x</a>'))).toBe("old keep");
});

it("returns null for a non-link element", () => {
  expect(resolvePeekEntityId(anchor("<span>plain</span>"))).toBeNull();
});
