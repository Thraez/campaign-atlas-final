import { describe, it, expect } from "vitest";
import {
  stripDmBlocks,
  stripDmFromShippingString,
} from "@/atlas/content/stripDmBlocks";

// ------------------------------------------------------------
// stripDmBlocks
// ------------------------------------------------------------

describe("stripDmBlocks — %% handling", () => {
  it("returns unbalanced:false and count:0 for input with no markers", () => {
    const result = stripDmBlocks("Just plain text.\nNo secrets here.");
    expect(result.count).toBe(0);
    expect(result.unbalanced).toBe(false);
    expect(result.text).toContain("Just plain text.");
  });

  it("strips a single %% block and returns count:1, unbalanced:false", () => {
    const input = "Visible.\n\n%%\nSECRET\n%%\n\nAlso visible.";
    const result = stripDmBlocks(input);
    expect(result.count).toBe(1);
    expect(result.unbalanced).toBe(false);
    expect(result.text).not.toContain("SECRET");
    expect(result.text).toContain("Visible.");
    expect(result.text).toContain("Also visible.");
  });

  it("strips multiple %% blocks and counts each one", () => {
    const input = "A\n%%secret1%%\nB\n%%secret2%%\nC";
    const result = stripDmBlocks(input);
    expect(result.count).toBe(2);
    expect(result.unbalanced).toBe(false);
    expect(result.text).not.toContain("secret1");
    expect(result.text).not.toContain("secret2");
  });

  it("detects unbalanced %% (odd occurrence count) as build error", () => {
    const input = "Visible.\n%%\nUnclosed DM block — no closing delimiter.";
    const result = stripDmBlocks(input);
    expect(result.unbalanced).toBe(true);
  });

  it("does NOT flag %% inside a fenced code block as unbalanced", () => {
    // The fence stripping guard applies only to the unbalanced-detection step.
    // The stripping regex itself matches inside fenced blocks (known limitation).
    const input = "Some prose.\n\n```\n%% literal example %%\n```\n\nMore prose.";
    const result = stripDmBlocks(input);
    expect(result.unbalanced).toBe(false);
  });

  it("collapses runs of 3+ blank lines left behind by stripping", () => {
    const input = "A\n\n%%secret%%\n\n\n\nB";
    const result = stripDmBlocks(input);
    // After stripping, excess blank lines should collapse to at most \n\n
    expect(result.text).not.toMatch(/\n{3,}/);
  });
});

describe("stripDmBlocks — :::dm handling", () => {
  it("strips a :::dm...:::  block and returns count:1, unbalanced:false", () => {
    const input = "Intro.\n\n:::dm\nDM secret callout\n:::\n\nOutro.";
    const result = stripDmBlocks(input);
    expect(result.count).toBe(1);
    expect(result.unbalanced).toBe(false);
    expect(result.text).not.toContain("DM secret callout");
    expect(result.text).toContain("Intro.");
    expect(result.text).toContain("Outro.");
  });

  it("detects unclosed :::dm (opens > closes) as build error", () => {
    const input = "Before.\n\n:::dm\nUnclosed callout — never closed.\n\nAfter.";
    const result = stripDmBlocks(input);
    expect(result.unbalanced).toBe(true);
  });

  it("does NOT flag balanced :::dm / ::: pair as unbalanced", () => {
    const input = "Start.\n:::dm\nsecret\n:::\nEnd.";
    const result = stripDmBlocks(input);
    expect(result.unbalanced).toBe(false);
  });

  it("does NOT flag :::dm inside a fenced code block as unbalanced", () => {
    // The fence stripping guard applies only to the unbalanced-detection step.
    const input = "```\n:::dm\nexample fence\n:::\n```\n\nPlain text.";
    const result = stripDmBlocks(input);
    expect(result.unbalanced).toBe(false);
  });
});

describe("stripDmBlocks — combined", () => {
  it("strips both %% and :::dm in one pass and sums counts", () => {
    const input = [
      "Public A.",
      "",
      "%%",
      "dm comment",
      "%%",
      "",
      "Public B.",
      "",
      ":::dm",
      "dm callout",
      ":::",
      "",
      "Public C.",
    ].join("\n");
    const result = stripDmBlocks(input);
    expect(result.count).toBe(2);
    expect(result.unbalanced).toBe(false);
    expect(result.text).not.toContain("dm comment");
    expect(result.text).not.toContain("dm callout");
    expect(result.text).toContain("Public A.");
    expect(result.text).toContain("Public B.");
    expect(result.text).toContain("Public C.");
  });
});

// ------------------------------------------------------------
// stripDmFromShippingString
// ------------------------------------------------------------

describe("stripDmFromShippingString — non-string passthrough", () => {
  it("returns undefined unchanged (type guard)", () => {
    expect(stripDmFromShippingString(undefined)).toBeUndefined();
  });
});

describe("stripDmFromShippingString — fast path", () => {
  it("returns string unchanged when it contains no %% or :::dm", () => {
    const s = "Just a plain label";
    const result = stripDmFromShippingString(s);
    expect(result).toBe(s);
  });
});

describe("stripDmFromShippingString — %% stripping", () => {
  it("strips inline %% block and trims whitespace", () => {
    const result = stripDmFromShippingString("King%%DM note%%'s road");
    expect(result).not.toContain("DM note");
    expect(result).toBe("King's road");
  });

  it("collapses internal whitespace left by stripping", () => {
    const result = stripDmFromShippingString("Before  %%secret%%  After");
    // Extra spaces collapse to single space after strip
    expect(result).toBe("Before After");
  });
});

describe("stripDmFromShippingString — :::dm stripping", () => {
  it("strips :::dm...:::  block from a shipping string", () => {
    const result = stripDmFromShippingString("Label :::dm hidden ::: visible");
    expect(result).not.toContain("hidden");
    expect(result).toContain("visible");
  });
});
