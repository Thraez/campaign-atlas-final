import { describe, it, expect } from "vitest";
import { resolveEntityCloseIntent } from "@/atlas/editor/entityCloseIntent";

describe("resolveEntityCloseIntent", () => {
  it("closes immediately when not dirty", () => {
    expect(resolveEntityCloseIntent({ dirty: false })).toEqual({ kind: "close" });
  });
  it("asks to confirm discard when dirty", () => {
    expect(resolveEntityCloseIntent({ dirty: true })).toEqual({ kind: "confirm-discard" });
  });
});
