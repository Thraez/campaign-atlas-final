import { describe, it, expect } from "vitest";
import { applyToolbarAction } from "@/atlas/editor/toolbarActions";

describe("applyToolbarAction — secret actions", () => {
  it("inserts a {{secret:id}} marker at the cursor for character type", () => {
    const r = applyToolbarAction("secret:character", "Before after", 6, 6);
    expect(r.value).toMatch(/\{\{secret:[a-z0-9-]+\}\}/);
  });

  it("inserts a {{secret:id}} marker at the cursor for password type", () => {
    const r = applyToolbarAction("secret:password", "Before after", 6, 6);
    expect(r.value).toMatch(/\{\{secret:[a-z0-9-]+\}\}/);
  });

  it("produces unique ids on every call", () => {
    const a = applyToolbarAction("secret:character", "", 0, 0);
    const b = applyToolbarAction("secret:character", "", 0, 0);
    const idA = a.value.match(/\{\{secret:([^}]+)\}\}/)?.[1];
    const idB = b.value.match(/\{\{secret:([^}]+)\}\}/)?.[1];
    expect(idA).toBeTruthy();
    expect(idB).toBeTruthy();
    expect(idA).not.toBe(idB);
  });
});
