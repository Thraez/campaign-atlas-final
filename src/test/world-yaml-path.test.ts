/**
 * worldYamlPath pure helper (useWorldYamlBaseline).
 */
import { describe, it, expect } from "vitest";
import { worldYamlPath } from "@/atlas/save/useWorldYamlBaseline";

describe("worldYamlPath", () => {
  it("returns the correct content-relative path for a world id", () => {
    expect(worldYamlPath("astrath-deeprealm")).toBe("content/astrath-deeprealm/_atlas/world.yaml");
  });

  it("handles a single-segment world id without extra separators", () => {
    expect(worldYamlPath("w")).toBe("content/w/_atlas/world.yaml");
  });
});
