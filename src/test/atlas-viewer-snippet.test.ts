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

  it("prepends a leading ellipsis when the match is deep in a long body", () => {
    // idx=70 → start = max(0, 70-50) = 20 > 0, so "…" should appear at front
    const prefix = "A".repeat(70);
    const display = prefix + "deep match here" + "B".repeat(20);
    const lower = display.toLowerCase();
    const result = snippet(display, lower, "deep match");
    expect(result).not.toBeNull();
    expect(result!.startsWith("…")).toBe(true);
  });

  it("appends a trailing ellipsis when the body extends far past the match", () => {
    // match at idx=0, tail=200 → end = 0 + "quick match".length + 90 = 101 < 216
    const display = "quick match here" + "Z".repeat(200);
    const lower = display.toLowerCase();
    const result = snippet(display, lower, "quick match");
    expect(result).not.toBeNull();
    expect(result!.endsWith("…")).toBe(true);
  });

  it("HTML-escapes & < > characters in the surrounding display text", () => {
    const display = "Armor & Weapons are < 10 gp or > 5 gp each.";
    const lower = display.toLowerCase();
    const result = snippet(display, lower, "weapons");
    expect(result).not.toBeNull();
    expect(result).toContain("&amp;");
    expect(result).toContain("&lt;");
    expect(result).toContain("&gt;");
    expect(result).toMatch(/<mark[^>]*>Weapons<\/mark>/);
  });
});
