import { describe, it, expect } from "vitest";
import { summarizeImport, formatImportSummaryLine } from "../atlas/import/summarizeImport";
import type { StagingRow } from "../atlas/import/stagingState";

function makeRow(overrides: Partial<StagingRow>): StagingRow {
  return {
    id: "staging-1-row",
    filename: "note.md",
    inferredType: "lore",
    resolvedId: "note",
    targetPath: "content/world/lore/note.md",
    pathAllowed: true,
    rowKind: "create",
    included: true,
    content: "",
    rawContent: "",
    typeWasExplicit: false,
    resolvedVisibility: "dm",
    ...overrides,
  };
}

describe("summarizeImport", () => {
  it("returns all zeros for an empty array", () => {
    expect(summarizeImport([])).toEqual({
      added: 0,
      updated: 0,
      replaced: 0,
      skipped: 0,
      couldntBeRead: 0,
    });
  });

  it("counts an included create row as added", () => {
    const rows = [makeRow({ rowKind: "create", included: true })];
    expect(summarizeImport(rows)).toMatchObject({ added: 1, updated: 0, replaced: 0, skipped: 0, couldntBeRead: 0 });
  });

  it("counts an included update row as updated", () => {
    const rows = [makeRow({ rowKind: "update", included: true })];
    expect(summarizeImport(rows)).toMatchObject({ added: 0, updated: 1, replaced: 0 });
  });

  it("counts an included path-collision row as replaced", () => {
    const rows = [makeRow({ rowKind: "path-collision", included: true })];
    expect(summarizeImport(rows)).toMatchObject({ replaced: 1, added: 0, updated: 0, skipped: 0 });
  });

  it("counts excluded rows (DM unchecked / unconfirmed collision) as skipped", () => {
    const rows = [
      makeRow({ rowKind: "create", included: false }),
      makeRow({ rowKind: "path-collision", included: false }),
    ];
    expect(summarizeImport(rows)).toMatchObject({ skipped: 2, couldntBeRead: 0 });
  });

  it("counts parseError rows as couldntBeRead, not skipped", () => {
    const rows = [makeRow({ parseError: "bad YAML", included: false })];
    expect(summarizeImport(rows)).toMatchObject({ couldntBeRead: 1, skipped: 0 });
  });

  it("counts pathAllowed=false rows as couldntBeRead, not skipped", () => {
    const rows = [makeRow({ pathAllowed: false, included: false })];
    expect(summarizeImport(rows)).toMatchObject({ couldntBeRead: 1, skipped: 0 });
  });

  it("handles a fully mixed batch correctly", () => {
    const rows = [
      makeRow({ rowKind: "create", included: true }),           // added
      makeRow({ rowKind: "create", included: true }),           // added
      makeRow({ rowKind: "update", included: true }),           // updated
      makeRow({ rowKind: "path-collision", included: true }),   // replaced
      makeRow({ rowKind: "create", included: false }),          // skipped
      makeRow({ rowKind: "path-collision", included: false }),  // skipped
      makeRow({ parseError: "bad YAML", included: false }),     // couldn't be read
      makeRow({ pathAllowed: false, included: false }),         // couldn't be read
    ];
    expect(summarizeImport(rows)).toEqual({
      added: 2,
      updated: 1,
      replaced: 1,
      skipped: 2,
      couldntBeRead: 2,
    });
  });
});

describe("formatImportSummaryLine", () => {
  it("returns empty string when all buckets are zero", () => {
    expect(formatImportSummaryLine({ added: 0, updated: 0, replaced: 0, skipped: 0, couldntBeRead: 0 })).toBe("");
  });

  it("shows only non-zero buckets joined by ·", () => {
    expect(
      formatImportSummaryLine({ added: 3, updated: 1, replaced: 0, skipped: 2, couldntBeRead: 0 })
    ).toBe("3 added · 1 updated · 2 skipped");
  });

  it("shows a single bucket without separators", () => {
    expect(
      formatImportSummaryLine({ added: 5, updated: 0, replaced: 0, skipped: 0, couldntBeRead: 0 })
    ).toBe("5 added");
  });
});
