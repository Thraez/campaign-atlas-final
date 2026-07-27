import { describe, it, expect } from "vitest";
import { findCodeRanges, isInsideCodeRange, replaceOutsideCode } from "@/atlas/content/codeRegions";

describe("findCodeRanges", () => {
  it("no code in plain text -> no ranges", () => {
    expect(findCodeRanges("plain text, nothing special")).toHaveLength(0);
  });

  it("finds a single inline code span", () => {
    const text = "before `code` after";
    const ranges = findCodeRanges(text);
    expect(ranges).toHaveLength(1);
    expect(text.slice(ranges[0].start, ranges[0].end)).toBe("`code`");
  });

  it("finds a fenced code block spanning multiple lines", () => {
    const text = "before\n```\n[[Link]]\n```\nafter";
    const ranges = findCodeRanges(text);
    expect(ranges).toHaveLength(1);
    expect(text.slice(ranges[0].start, ranges[0].end)).toBe("```\n[[Link]]\n```");
  });

  it("handles a tilde-fenced block", () => {
    const text = "~~~\n![[embed.png]]\n~~~";
    const ranges = findCodeRanges(text);
    expect(ranges).toHaveLength(1);
    expect(text.slice(ranges[0].start, ranges[0].end)).toBe(text);
  });

  it("an unclosed fence treats the remainder of the document as code", () => {
    const text = "before\n```\n[[Link]]\nno closing fence";
    const ranges = findCodeRanges(text);
    expect(ranges).toHaveLength(1);
    expect(ranges[0].end).toBe(text.length);
  });

  it("multiple independent inline spans are each found", () => {
    const text = "`a` and `b`";
    const ranges = findCodeRanges(text);
    expect(ranges).toHaveLength(2);
  });

  it("a double-backtick span containing a single backtick is one range", () => {
    const text = "before `` `nested` `` after";
    const ranges = findCodeRanges(text);
    expect(ranges).toHaveLength(1);
    expect(text.slice(ranges[0].start, ranges[0].end)).toBe("`` `nested` ``");
  });
});

describe("isInsideCodeRange", () => {
  it("returns true for an index within a range, false outside", () => {
    const ranges = [{ start: 5, end: 10 }];
    expect(isInsideCodeRange(5, ranges)).toBe(true);
    expect(isInsideCodeRange(9, ranges)).toBe(true);
    expect(isInsideCodeRange(10, ranges)).toBe(false);
    expect(isInsideCodeRange(4, ranges)).toBe(false);
  });
});

describe("replaceOutsideCode", () => {
  const UPPER = /[a-z]+/g;

  it("applies the replacer outside code regions", () => {
    const out = replaceOutsideCode("abc `def` ghi", UPPER, (...args) => (args[0] as string).toUpperCase());
    expect(out).toBe("ABC `def` GHI");
  });

  it("leaves matches inside an inline code span untouched", () => {
    const out = replaceOutsideCode("`abc`", UPPER, (...args) => (args[0] as string).toUpperCase());
    expect(out).toBe("`abc`");
  });

  it("leaves matches inside a fenced code block untouched", () => {
    const text = "before\n```\nabc\n```\nafter";
    const out = replaceOutsideCode(text, UPPER, (...args) => (args[0] as string).toUpperCase());
    expect(out).toBe("BEFORE\n```\nabc\n```\nAFTER");
  });

  it("no code ranges -> behaves exactly like text.replace", () => {
    const out = replaceOutsideCode("plain text", UPPER, (...args) => (args[0] as string).toUpperCase());
    expect(out).toBe("PLAIN TEXT");
  });
});
