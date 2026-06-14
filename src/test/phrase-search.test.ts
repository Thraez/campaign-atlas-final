import { describe, it, expect } from "vitest";
import { parseSearchQuery, matchesPhrases } from "../atlas/search/parseSearchQuery";
import type { SearchIndexEntry } from "../atlas/content/loader";

function entry(overrides: Partial<SearchIndexEntry> = {}): SearchIndexEntry {
  return {
    id: "test",
    title: "Iron Tower",
    type: "location",
    aliases: [],
    tags: [],
    body: "the iron tower stands tall near the ancient guard post",
    bodyText: "The Iron Tower stands tall near the ancient guard post",
    ...overrides,
  };
}

describe("parseSearchQuery", () => {
  it("splits a quoted phrase and unquoted rest", () => {
    expect(parseSearchQuery('"iron tower" guard')).toEqual({
      phrases: ["iron tower"],
      rest: "guard",
    });
  });

  it("handles multiple quoted phrases", () => {
    expect(parseSearchQuery('"iron tower" "ancient guard"')).toEqual({
      phrases: ["iron tower", "ancient guard"],
      rest: "",
    });
  });

  it("handles a phrase-only query (no unquoted remainder)", () => {
    expect(parseSearchQuery('"iron tower"')).toEqual({
      phrases: ["iron tower"],
      rest: "",
    });
  });

  it("treats an unbalanced trailing quote as literal rest — never throws", () => {
    const result = parseSearchQuery('"iron tower');
    expect(result.phrases).toEqual([]);
    expect(result.rest).toContain('"');
  });

  it("drops empty quoted spans", () => {
    expect(parseSearchQuery('"" foo')).toEqual({ phrases: [], rest: "foo" });
  });

  it("lowercases extracted phrases", () => {
    expect(parseSearchQuery('"Iron Tower"')).toEqual({
      phrases: ["iron tower"],
      rest: "",
    });
  });

  it("returns empty phrases and trimmed rest for a plain unquoted query", () => {
    expect(parseSearchQuery("guard post")).toEqual({ phrases: [], rest: "guard post" });
  });
});

describe("matchesPhrases", () => {
  it("matches when the exact contiguous phrase appears in body", () => {
    expect(matchesPhrases(entry(), ["iron tower"])).toBe(true);
  });

  it("does NOT match when the words appear non-contiguously", () => {
    expect(
      matchesPhrases(
        entry({ title: "Dungeon", aliases: [], summary: "", body: "iron and tower" }),
        ["iron tower"]
      )
    ).toBe(false);
  });

  it("requires ALL phrases (AND logic) — fails if any phrase is absent", () => {
    expect(matchesPhrases(entry(), ["iron tower", "dragon lair"])).toBe(false);
  });

  it("passes when all phrases are present in body", () => {
    expect(
      matchesPhrases(entry({ body: "iron tower stands near the ancient guard post" }), [
        "iron tower",
        "ancient guard",
      ])
    ).toBe(true);
  });

  it("matches against title (lowercased)", () => {
    expect(matchesPhrases(entry({ title: "Iron Tower", body: "" }), ["iron tower"])).toBe(true);
  });

  it("matches against aliases (lowercased)", () => {
    expect(matchesPhrases(entry({ aliases: ["The Iron Spire"], body: "" }), ["iron spire"])).toBe(true);
  });

  it("matches against summary (lowercased)", () => {
    expect(matchesPhrases(entry({ summary: "A tall iron tower", body: "" }), ["tall iron tower"])).toBe(true);
  });

  it("returns true for an empty phrase list (vacuously all match)", () => {
    expect(matchesPhrases(entry(), [])).toBe(true);
  });
});
