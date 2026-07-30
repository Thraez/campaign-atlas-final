import { describe, it, expect } from "vitest";
import { formatPublishSummary, shortCommit } from "./publishSummary";

describe("shortCommit", () => {
  it("truncates to 7 chars", () => {
    expect(shortCommit("a1b2c3d4e5f6")).toBe("a1b2c3d");
  });

  it("leaves a shorter sha untouched", () => {
    expect(shortCommit("a1b")).toBe("a1b");
  });
});

describe("formatPublishSummary", () => {
  it("describes entities and pins with a short commit", () => {
    expect(formatPublishSummary({ entities: 5, placements: 3 }, "a1b2c3d4e5")).toBe(
      "Published 5 entities and 3 pins (commit a1b2c3d).",
    );
  });

  it("singularizes a count of one", () => {
    expect(formatPublishSummary({ entities: 1, placements: 1 }, "abc1234")).toBe(
      "Published 1 entity and 1 pin (commit abc1234).",
    );
  });

  it("omits a zero count from the list", () => {
    expect(formatPublishSummary({ entities: 5, placements: 0 }, "abc1234")).toBe(
      "Published 5 entities (commit abc1234).",
    );
    expect(formatPublishSummary({ entities: 0, placements: 3 }, "abc1234")).toBe(
      "Published 3 pins (commit abc1234).",
    );
  });

  it("degrades to a bare 'Published' when all counts are zero", () => {
    expect(formatPublishSummary({ entities: 0, placements: 0 }, "abc1234")).toBe(
      "Published (commit abc1234).",
    );
  });

  it("drops the commit parenthetical when no commit is known", () => {
    expect(formatPublishSummary({ entities: 2, placements: 0 })).toBe("Published 2 entities.");
  });
});
