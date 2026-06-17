import { describe, it, expect } from "vitest";
import { summarizeImport, formatImportSummaryLine } from "@/atlas/import/summarizeImport";
import type { StagingRow } from "@/atlas/import/stagingState";

function row(overrides: Partial<StagingRow>): StagingRow {
  return {
    id: "r1",
    filename: "a.md",
    inferredType: "npc",
    resolvedId: "a",
    targetPath: "content/w/npcs/a.md",
    pathAllowed: true,
    rowKind: "create",
    included: true,
    content: "",
    rawContent: "",
    typeWasExplicit: false,
    typeWasGuessed: false,
    resolvedVisibility: "dm",
    ...overrides,
  };
}

describe("summarizeImport", () => {
  it("counts create/update/replace/skipped correctly", () => {
    const rows = [
      row({ rowKind: "create", included: true }),
      row({ rowKind: "update", included: true }),
      row({ rowKind: "path-collision", included: true }),
      row({ rowKind: "create", included: false }),
    ];
    const s = summarizeImport(rows);
    expect(s.added).toBe(1);
    expect(s.updated).toBe(1);
    expect(s.replaced).toBe(1);
    expect(s.skipped).toBe(1);
    expect(s.needsReview).toBe(0);
  });

  it("counts needsReview rows distinctly (not as skipped)", () => {
    const rows = [
      row({ rowKind: "update", included: false, needsReview: { reason: "secrecy-increase" } }),
      row({ rowKind: "update", included: false, needsReview: { reason: "type-conflict" } }),
      row({ rowKind: "create", included: false }), // plain skipped
    ];
    const s = summarizeImport(rows);
    expect(s.needsReview).toBe(2);
    expect(s.skipped).toBe(1);
    expect(s.added).toBe(0);
  });

  it("couldntBeRead rows are never counted as needsReview or skipped", () => {
    const rows = [
      row({ parseError: "bad yaml", included: false, needsReview: { reason: "secrecy-increase" } }),
    ];
    const s = summarizeImport(rows);
    expect(s.couldntBeRead).toBe(1);
    expect(s.needsReview).toBe(0);
    expect(s.skipped).toBe(0);
  });
});

describe("formatImportSummaryLine", () => {
  it("shows needsReview when non-zero", () => {
    const line = formatImportSummaryLine({ added: 0, updated: 2, replaced: 0, skipped: 0, couldntBeRead: 0, needsReview: 3 });
    expect(line).toContain("2 updated");
    expect(line).toContain("3 need review");
  });

  it("omits needsReview when zero", () => {
    const line = formatImportSummaryLine({ added: 1, updated: 0, replaced: 0, skipped: 0, couldntBeRead: 0, needsReview: 0 });
    expect(line).toBe("1 added");
    expect(line).not.toContain("need review");
  });
});
