import { it, expect } from "vitest";
import { computePeekPosition } from "@/atlas/peek/computePeekPosition";

const vp = { width: 1000, height: 800 };
const card = { width: 240, height: 120 };

it("places below when there's room", () => {
  const r = { top: 100, bottom: 120, left: 400, right: 460, width: 60, height: 20 };
  const pos = computePeekPosition(r, vp, card, 8);
  expect(pos.placement).toBe("below");
  expect(pos.top).toBe(128);
});

it("flips above when the trigger is near the bottom", () => {
  const r = { top: 760, bottom: 780, left: 400, right: 460, width: 60, height: 20 };
  const pos = computePeekPosition(r, vp, card, 8);
  expect(pos.placement).toBe("above");
  expect(pos.top).toBe(760 - 8 - 120);
});

it("clamps left into the viewport", () => {
  const r = { top: 100, bottom: 120, left: 980, right: 995, width: 15, height: 20 };
  const pos = computePeekPosition(r, vp, card, 8);
  expect(pos.left).toBe(1000 - 240 - 8);
});
