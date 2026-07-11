import { describe, it, expect } from "vitest";
import { resolvePinClickIntent } from "@/atlas/editor/pinClickIntent";

describe("resolvePinClickIntent", () => {
  it("returns place-anchor when pending is true", () => {
    const result = resolvePinClickIntent({ pending: true, entityId: "ent-1" });
    expect(result).toEqual({ kind: "place-anchor" });
  });

  it("returns open-entity with entityId when pending is false", () => {
    const result = resolvePinClickIntent({ pending: false, entityId: "ent-2" });
    expect(result).toEqual({ kind: "open-entity", entityId: "ent-2" });
  });
});
