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

it("clamps left into the viewport (right-edge)", () => {
  const r = { top: 100, bottom: 120, left: 980, right: 995, width: 15, height: 20 };
  const pos = computePeekPosition(r, vp, card, 8);
  expect(pos.left).toBe(1000 - 240 - 8);
});

it("clamps left into the viewport (left-edge)", () => {
  // anchor at x=2, gap=8 → rawLeft(2) < gap(8) → clamp to gap
  const r = { top: 100, bottom: 120, left: 2, right: 20, width: 18, height: 20 };
  const pos = computePeekPosition(r, vp, card, 8);
  expect(pos.left).toBe(8);
});

it("does not clamp when anchor is comfortably mid-viewport", () => {
  const r = { top: 100, bottom: 120, left: 400, right: 460, width: 60, height: 20 };
  const pos = computePeekPosition(r, vp, card, 8);
  expect(pos.left).toBe(400);
});

it("places below when roomBelow exactly equals card.height + gap (boundary)", () => {
  // roomBelow = viewport.height - anchor.bottom = 800 - 672 = 128 = 120 + 8
  const r = { top: 640, bottom: 672, left: 400, right: 460, width: 60, height: 20 };
  const pos = computePeekPosition(r, vp, card, 8);
  expect(pos.placement).toBe("below");
});

it("flips above when roomBelow is one pixel short of fitting (boundary)", () => {
  // roomBelow = 800 - 673 = 127 < 128
  const r = { top: 640, bottom: 673, left: 400, right: 460, width: 60, height: 20 };
  const pos = computePeekPosition(r, vp, card, 8);
  expect(pos.placement).toBe("above");
});
