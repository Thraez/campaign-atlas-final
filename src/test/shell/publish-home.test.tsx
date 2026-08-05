// src/test/shell/publish-home.test.tsx
import { describe, it, expect } from "vitest";
import { buildRailItems } from "@/atlas/shell/railRegistry";

describe("Publish home", () => {
  it("publish is a system-group rail item, after every content and map item", () => {
    const items = buildRailItems({ panels: {}, counts: {} });
    const pub = items.find((i) => i.id === "publish")!;
    expect(pub.group).toBe("system");
    // Publish is a destination, not a per-section tool: it must sort below the
    // world's contents and the map tools. (Save is deliberately absent from the
    // rail — the toolbar's SaveStatus is the single Save control.)
    const lastNonSystem = items.reduce((last, it, i) => (it.group === "system" ? last : i), -1);
    expect(items.indexOf(pub)).toBeGreaterThan(lastNonSystem);
  });
});
