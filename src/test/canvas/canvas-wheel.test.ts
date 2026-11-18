/**
 * P-06 review: the canvas's wheel handler on a real Leaflet map. Leaflet
 * divides pixel-mode deltas by its platform factor but not line- or
 * page-mode ones; the canvas's handler scales those, so a 3-line notch adds
 * the same wheel delta as a 100 px notch.
 */
import L from "leaflet";
import { afterEach, describe, expect, it } from "vitest";
import { CanvasScrollWheelZoom } from "@/atlas/canvas/canvasWheel";

let map: L.Map | null = null;
afterEach(() => {
  map?.remove();
  map = null;
});

/** The wheel delta one event adds to the handler's batch. */
function deltaOf(init: WheelEventInit): number {
  const el = document.createElement("div");
  document.body.appendChild(el);
  map = L.map(el, { crs: L.CRS.Simple, center: [0, 0], zoom: 0, scrollWheelZoom: false });
  const handler = new CanvasScrollWheelZoom(map) as unknown as L.Handler & { _delta: number };
  handler.enable();
  el.dispatchEvent(new WheelEvent("wheel", { bubbles: true, cancelable: true, ...init }));
  const d = handler._delta;
  handler.disable();
  map.remove();
  map = null;
  el.remove();
  return d;
}

describe("canvas wheel handler (P-06)", () => {
  it("a 3-line notch adds what a 100 px notch adds", () => {
    const px = deltaOf({ deltaY: 100, deltaMode: 0 });
    expect(px).toBeLessThan(0);
    expect(deltaOf({ deltaY: 3, deltaMode: 1 })).toBeCloseTo(px, 9);
  });

  it("a page counts as a notch", () => {
    expect(deltaOf({ deltaY: 1, deltaMode: 2 })).toBeCloseTo(deltaOf({ deltaY: 100 }), 9);
  });
});
