// src/test/editor/pin-open-parity.test.tsx
import { describe, it, expect } from "vitest";
import { resolvePinClickIntent } from "@/atlas/editor/pinClickIntent";

describe("pin click intent (player parity)", () => {
  it("while placing: returns place-anchor, never opens", () => {
    expect(resolvePinClickIntent({ pending: true, entityId: "corven" }))
      .toEqual({ kind: "place-anchor" });
  });
  it("not placing: opens the entity (matches player site)", () => {
    expect(resolvePinClickIntent({ pending: false, entityId: "corven" }))
      .toEqual({ kind: "open-entity", entityId: "corven" });
  });
});
