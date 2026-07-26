import { describe, it, expect } from "vitest";
import { zipsToPrune, parseKeepFlag } from "./backup";

describe("zipsToPrune", () => {
  const zips = [
    "2026-01-01T00-00-00-000Z.zip",
    "2026-01-02T00-00-00-000Z.zip",
    "2026-01-03T00-00-00-000Z.zip",
    "2026-01-04T00-00-00-000Z.zip",
  ];

  it("keep=0 prunes every zip", () => {
    expect(zipsToPrune(zips, 0)).toEqual([
      "2026-01-01T00-00-00-000Z.zip",
      "2026-01-02T00-00-00-000Z.zip",
      "2026-01-03T00-00-00-000Z.zip",
      "2026-01-04T00-00-00-000Z.zip",
    ]);
  });

  it("keep >= count prunes nothing", () => {
    expect(zipsToPrune(zips, 4)).toEqual([]);
    expect(zipsToPrune(zips, 10)).toEqual([]);
  });

  it("keeps the newest N, prunes the oldest (chronological = lexicographic)", () => {
    expect(zipsToPrune(zips, 1)).toEqual([
      "2026-01-01T00-00-00-000Z.zip",
      "2026-01-02T00-00-00-000Z.zip",
      "2026-01-03T00-00-00-000Z.zip",
    ]);
    expect(zipsToPrune(zips, 2)).toEqual([
      "2026-01-01T00-00-00-000Z.zip",
      "2026-01-02T00-00-00-000Z.zip",
    ]);
  });

  it("ignores non-.zip files entirely", () => {
    const mixed = [...zips, "MANIFEST.md", ".DS_Store", "notes.txt"];
    expect(zipsToPrune(mixed, 1)).toEqual([
      "2026-01-01T00-00-00-000Z.zip",
      "2026-01-02T00-00-00-000Z.zip",
      "2026-01-03T00-00-00-000Z.zip",
    ]);
  });

  it("handles an unsorted input list", () => {
    const shuffled = [zips[2], zips[0], zips[3], zips[1]];
    expect(zipsToPrune(shuffled, 2)).toEqual([zips[0], zips[1]]);
  });
});

describe("parseKeepFlag", () => {
  it("returns undefined when --keep is absent", () => {
    expect(parseKeepFlag([])).toBeUndefined();
    expect(parseKeepFlag(["--other", "1"])).toBeUndefined();
  });

  it("parses a valid integer value", () => {
    expect(parseKeepFlag(["--keep", "5"])).toBe(5);
    expect(parseKeepFlag(["--keep", "0"])).toBe(0);
  });

  it("returns undefined for a non-integer or missing value", () => {
    expect(parseKeepFlag(["--keep"])).toBeUndefined();
    expect(parseKeepFlag(["--keep", "abc"])).toBeUndefined();
    expect(parseKeepFlag(["--keep", "-1"])).toBeUndefined();
    expect(parseKeepFlag(["--keep", "1.5"])).toBeUndefined();
  });
});
