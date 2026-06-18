import { it, expect } from "vitest";
import { pinDiscoveryClass } from "@/atlas/wander/pinDiscoveryClass";

it("marks discovered vs undiscovered pins", () => {
  const visited = new Set(["a"]);
  expect(pinDiscoveryClass("a", visited)).toBe("atlas-pin--discovered");
  expect(pinDiscoveryClass("b", visited)).toBe("atlas-pin--undiscovered");
});
