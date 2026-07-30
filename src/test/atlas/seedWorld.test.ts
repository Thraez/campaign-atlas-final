/**
 * Build-smoke test for the seed-world path (Q100): QUICK_START.md sends onboarding
 * users through `examples/seed-world`, but nothing exercised that load path — a
 * schema/loader drift here would silently break the advertised flow.
 */
import { describe, it, expect } from "vitest";
import { loadWorldConfig } from "../../../scripts/atlas/loadWorldConfig";

describe("seed-world build-smoke", () => {
  it("loads examples/seed-world via loadWorldConfig without throwing", () => {
    expect(() => loadWorldConfig("examples", "seed-world")).not.toThrow();
  });

  it("produces the mistmoor-overview map", () => {
    const config = loadWorldConfig("examples", "seed-world");
    expect(config).not.toBeNull();
    const map = config?.maps.find((m) => m.id === "mistmoor-overview");
    expect(map).toBeDefined();
    expect(map?.name).toBe("Overview");
  });

  it("yields the Calendar of the Hollow Year with its 4 months", () => {
    const config = loadWorldConfig("examples", "seed-world");
    expect(config?.calendar?.name).toBe("Calendar of the Hollow Year");
    expect(config?.calendar?.months).toEqual([
      { name: "Frostfall", days: 90 },
      { name: "Greenrise", days: 92 },
      { name: "Highsun", days: 92 },
      { name: "Emberfade", days: 91 },
    ]);
  });
});
