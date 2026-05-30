/**
 * Unit tests for the exported `snippet()` helper from AtlasViewer.
 * Verifies that the display string (original case) is sliced using match
 * offsets found in the lowercased body — so the rendered snippet shows
 * proper-case text even though matching happens on the lowercase index.
 */
import { describe, it, expect } from "vitest";
import { snippet } from "../atlas/search/snippet";

describe("snippet()", () => {
  it("returns original-case text when a match is found", () => {
    const display = "The survivors founded the Great Cities of Thornhold long ago.";
    const lower = display.toLowerCase();
    const result = snippet(display, lower, "thornhold");
    expect(result).not.toBeNull();
    // The display slice must contain the original-case word
    expect(result).toContain("Thornhold");
    // And it must be wrapped in a <mark> element
    expect(result).toMatch(/<mark[^>]*>Thornhold<\/mark>/);
  });

  it("highlights are case-insensitive (mixed-case query still highlights)", () => {
    const display = "He found the ancient Ruins of Karath.";
    const lower = display.toLowerCase();
    const result = snippet(display, lower, "ruins of karath");
    expect(result).not.toBeNull();
    expect(result).toMatch(/<mark[^>]*>Ruins of Karath<\/mark>/);
  });

  it("returns null when no match exists", () => {
    const display = "Nothing relevant here.";
    const lower = display.toLowerCase();
    expect(snippet(display, lower, "thornhold")).toBeNull();
  });

  it("returns null when display is undefined", () => {
    expect(snippet(undefined, "some lower text", "text")).toBeNull();
  });

  it("returns null when lower is undefined", () => {
    expect(snippet("Some Text", undefined, "text")).toBeNull();
  });

  it("returns null when query is empty", () => {
    const display = "Some text here.";
    const lower = display.toLowerCase();
    expect(snippet(display, lower, "")).toBeNull();
  });

  it("falls back gracefully when display and lower are the same (old-index compat)", () => {
    // Old indexes only have body (lowercased). Caller passes bodyText ?? body
    // for display and body for lower — when bodyText is absent both args are
    // the same lowercased string. Should still return a result.
    const lower = "survivors founded the great cities of thornhold.";
    const result = snippet(lower, lower, "thornhold");
    expect(result).not.toBeNull();
    expect(result).toMatch(/<mark[^>]*>thornhold<\/mark>/);
  });
});
