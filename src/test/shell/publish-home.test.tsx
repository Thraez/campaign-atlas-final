// src/test/shell/publish-home.test.tsx
import { describe, it, expect } from "vitest";
import { buildRailItems } from "@/atlas/shell/railRegistry";

describe("Publish home", () => {
  it("publish is a system-group rail item, separate from save", () => {
    const items = buildRailItems({ panels: {}, counts: {} });
    const pub = items.find((i) => i.id === "publish")!;
    const save = items.find((i) => i.id === "save")!;
    expect(pub.group).toBe("system");
    expect(save.group).toBe("system");
    expect(items.indexOf(pub)).toBeGreaterThan(items.indexOf(save));
  });
});
