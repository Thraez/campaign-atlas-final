import { describe, it, expect } from "vitest";
import {
  getAutocompleteContext,
  filterEntities,
  filterImages,
  applyCompletion,
} from "@/atlas/editor/wikilinkAutocomplete";

// ---------------------------------------------------------------------------
// getAutocompleteContext
// ---------------------------------------------------------------------------

describe("getAutocompleteContext", () => {
  it("returns null when no trigger present", () => {
    expect(getAutocompleteContext("hello world", 11)).toBeNull();
    expect(getAutocompleteContext("", 0)).toBeNull();
  });

  it("returns entity context for [[", () => {
    const ctx = getAutocompleteContext("See [[Ald", 9);
    expect(ctx).toEqual({ type: "entity", query: "Ald", triggerStart: 4 });
  });

  it("returns entity context with empty query immediately after [[", () => {
    const ctx = getAutocompleteContext("foo [[", 6);
    expect(ctx).toEqual({ type: "entity", query: "", triggerStart: 4 });
  });

  it("returns image context for ![[", () => {
    const ctx = getAutocompleteContext("![[portrait", 11);
    expect(ctx).toEqual({ type: "image", query: "portrait", triggerStart: 0 });
  });

  it("returns image context with empty query immediately after ![[", () => {
    const ctx = getAutocompleteContext("embed ![[", 9);
    expect(ctx).toEqual({ type: "image", query: "", triggerStart: 6 });
  });

  it("returns null when [[ is already closed with ]]", () => {
    expect(getAutocompleteContext("[[done]]", 8)).toBeNull();
  });

  it("returns null when ![[ is already closed with ]]", () => {
    expect(getAutocompleteContext("![[img.png]]", 12)).toBeNull();
  });

  it("picks the LAST open trigger, not an earlier closed one", () => {
    const ctx = getAutocompleteContext("[[done]] [[open", 15);
    expect(ctx).toEqual({ type: "entity", query: "open", triggerStart: 9 });
  });

  it("does NOT match [[ that is preceded by !", () => {
    // ![[img — must be image, not entity
    const ctx = getAutocompleteContext("![[img", 6);
    expect(ctx?.type).toBe("image");
    expect(ctx?.query).toBe("img");
  });

  it("returns null when trigger crosses a newline", () => {
    // [[foo\nbar — the newline breaks the trigger
    expect(getAutocompleteContext("[[foo\nbar", 9)).toBeNull();
  });

  it("includes triggerStart pointing to start of trigger token", () => {
    const ctx = getAutocompleteContext("prefix [[entity-name", 20);
    expect(ctx?.triggerStart).toBe(7); // position of '['
  });

  it("image triggerStart includes the ! character", () => {
    const ctx = getAutocompleteContext("prefix ![[img", 13);
    expect(ctx?.triggerStart).toBe(7); // position of '!'
  });
});

// ---------------------------------------------------------------------------
// filterEntities
// ---------------------------------------------------------------------------

const ENTITIES = [
  { id: "aldoria", title: "Aldoria", type: "settlement", aliases: ["City of Sails"] },
  { id: "brynn-vale", title: "Brynn Vale", type: "region", aliases: [] },
  { id: "commander-aldric", title: "Commander Aldric", type: "npc", aliases: ["Aldric"] },
  { id: "iron-brotherhood", title: "Iron Brotherhood", type: "faction", aliases: ["the Brotherhood"] },
];

describe("filterEntities", () => {
  it("returns up to limit results sorted by title when query is empty", () => {
    const results = filterEntities(ENTITIES, "", 3);
    expect(results).toHaveLength(3);
    expect(results[0].title).toBe("Aldoria");
    expect(results[1].title).toBe("Brynn Vale");
  });

  it("matches by title substring (case-insensitive)", () => {
    const r = filterEntities(ENTITIES, "ald");
    expect(r.map((e) => e.id)).toContain("aldoria");
    expect(r.map((e) => e.id)).toContain("commander-aldric");
  });

  it("matches by id", () => {
    const r = filterEntities(ENTITIES, "brynn-vale");
    expect(r).toHaveLength(1);
    expect(r[0].id).toBe("brynn-vale");
  });

  it("matches by alias", () => {
    const r = filterEntities(ENTITIES, "City of Sails");
    expect(r).toHaveLength(1);
    expect(r[0].id).toBe("aldoria");
  });

  it("respects custom limit", () => {
    expect(filterEntities(ENTITIES, "", 2)).toHaveLength(2);
  });

  it("returns empty array when no match", () => {
    expect(filterEntities(ENTITIES, "zzznomatch")).toHaveLength(0);
  });

  it("returns id, title, type in each suggestion", () => {
    const [first] = filterEntities(ENTITIES, "aldoria");
    expect(first).toMatchObject({ id: "aldoria", title: "Aldoria", type: "settlement" });
  });
});

// ---------------------------------------------------------------------------
// filterImages
// ---------------------------------------------------------------------------

const IMAGES = ["portrait-aldric.png", "aldoria-map.webp", "item-sword.png", "region-brynn.jpg"];

describe("filterImages", () => {
  it("returns all images (up to limit) for empty query", () => {
    expect(filterImages(IMAGES, "")).toHaveLength(4);
  });

  it("filters by filename substring (case-insensitive)", () => {
    const r = filterImages(IMAGES, "ald");
    expect(r).toEqual(["portrait-aldric.png", "aldoria-map.webp"]);
  });

  it("respects limit", () => {
    expect(filterImages(IMAGES, "", 2)).toHaveLength(2);
  });

  it("returns empty when no match", () => {
    expect(filterImages(IMAGES, "zzznomatch")).toHaveLength(0);
  });

  it("case-insensitive match", () => {
    expect(filterImages(IMAGES, "ALDORIA")).toEqual(["aldoria-map.webp"]);
  });
});

// ---------------------------------------------------------------------------
// applyCompletion
// ---------------------------------------------------------------------------

describe("applyCompletion", () => {
  it("replaces entity trigger+query with [[id]]", () => {
    // "See [[Ald" → select aldoria
    const ctx = { type: "entity" as const, query: "Ald", triggerStart: 4 };
    const r = applyCompletion("See [[Ald", ctx, 9, "aldoria");
    expect(r.value).toBe("See [[aldoria]]");
    expect(r.selStart).toBe(15);
    expect(r.selEnd).toBe(15);
  });

  it("replaces image trigger+query with ![[filename]]", () => {
    const ctx = { type: "image" as const, query: "port", triggerStart: 0 };
    const r = applyCompletion("![[port", ctx, 7, "portrait.png");
    expect(r.value).toBe("![[portrait.png]]");
    expect(r.selStart).toBe(17);
  });

  it("handles empty query (cursor right after [[ )", () => {
    const ctx = { type: "entity" as const, query: "", triggerStart: 0 };
    const r = applyCompletion("[[", ctx, 2, "aldoria");
    expect(r.value).toBe("[[aldoria]]");
  });

  it("preserves text after cursor", () => {
    const ctx = { type: "entity" as const, query: "Ald", triggerStart: 4 };
    const r = applyCompletion("See [[Ald and more", ctx, 9, "aldoria");
    expect(r.value).toBe("See [[aldoria]] and more");
  });

  it("cursor lands immediately after ]]", () => {
    const ctx = { type: "image" as const, query: "", triggerStart: 0 };
    const r = applyCompletion("![[", ctx, 3, "map.png");
    expect(r.value).toBe("![[map.png]]");
    expect(r.selStart).toBe(12);
    expect(r.selEnd).toBe(12);
  });
});
