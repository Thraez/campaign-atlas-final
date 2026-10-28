/**
 * Tests for src/atlas/content/loader.ts's loadSearchIndex.
 *
 * The shipped search-index.json carries only bodyText (original case); searchText
 * (lowercased, used for matching) is derived client-side on load rather than
 * duplicated in the artifact (Q65).
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { loadSearchIndex } from "@/atlas/content/loader";

function stubFetch(jsonValue: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => jsonValue,
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("loadSearchIndex", () => {
  it("derives lowercased searchText from bodyText for each entry", async () => {
    stubFetch([
      { id: "a", title: "A", type: "npc", aliases: [], tags: [], bodyText: "Mixed CASE Body" },
    ]);
    const index = await loadSearchIndex();
    expect(index[0].bodyText).toBe("Mixed CASE Body");
    expect(index[0].searchText).toBe("mixed case body");
  });

  it("leaves searchText undefined when the entry has no bodyText", async () => {
    stubFetch([{ id: "a", title: "A", type: "npc", aliases: [], tags: [] }]);
    const index = await loadSearchIndex();
    expect(index[0].searchText).toBeUndefined();
  });
});
