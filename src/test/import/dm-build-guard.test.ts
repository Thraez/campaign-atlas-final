import { describe, it, expect } from "vitest";
import {
  DmBuildRequiredError,
  assertDmBuildLoaded,
} from "@/atlas/import/useMdImportFlow";

describe("assertDmBuildLoaded (Task 2.4 DM-build precondition guard)", () => {
  it("throws DmBuildRequiredError when existingById is empty", () => {
    expect(() => assertDmBuildLoaded(new Map())).toThrow(DmBuildRequiredError);
    expect(() => assertDmBuildLoaded(new Map())).toThrow(
      "Rebuild in DM mode first",
    );
  });

  it("does not throw when existingById has at least one entry", () => {
    const existingById = new Map([["corven", "content/w/npcs/corven.md"]]);
    expect(() => assertDmBuildLoaded(existingById)).not.toThrow();
  });

  it("DmBuildRequiredError has the expected name", () => {
    try {
      assertDmBuildLoaded(new Map());
    } catch (e) {
      expect(e).toBeInstanceOf(DmBuildRequiredError);
      expect((e as DmBuildRequiredError).name).toBe("DmBuildRequiredError");
    }
  });
});
