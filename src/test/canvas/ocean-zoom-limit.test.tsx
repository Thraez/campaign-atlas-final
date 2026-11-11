/** R-36: the ocean cannot zoom out far past the fit-all zoom (playtest reached -5.7). */
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const fake = {
  size: { x: 800, y: 600 },
  setMinZoom: vi.fn(),
  getSize() {
    return this.size;
  },
  on: vi.fn(),
  off: vi.fn(),
  invalidateSize: vi.fn(),
  getContainer: () => document.createElement("div"),
};
vi.mock("react-leaflet", () => ({ useMap: () => fake }));

const { OceanZoomLimit, oceanMinZoom, CANVAS_MIN_ZOOM } =
  await import("@/atlas/canvas/OceanZoomLimit");

afterEach(() => {
  cleanup();
  fake.setMinZoom.mockClear();
});

describe("oceanMinZoom", () => {
  it("sits one level below the fit zoom", () => {
    // 800x600 into 3200x2400: fit zoom is log2(0.25) = -2.
    expect(oceanMinZoom({ x: 800, y: 600 }, 3200, 2400)).toBe(-3);
  });
  it("never goes below the canvas floor, and rejects empty boxes", () => {
    expect(oceanMinZoom({ x: 800, y: 600 }, 1e9, 1e9)).toBe(CANVAS_MIN_ZOOM);
    expect(oceanMinZoom({ x: 800, y: 600 }, 0, 0)).toBeNull();
  });
});

describe("OceanZoomLimit", () => {
  it("raises the floor on the ocean", () => {
    render(<OceanZoomLimit ocean fitWidth={3200} fitHeight={2400} viewKey="ocean" />);
    expect(fake.setMinZoom).toHaveBeenLastCalledWith(-3);
  });
  it("gives other views the canvas floor", () => {
    render(<OceanZoomLimit ocean={false} fitWidth={600} fitHeight={400} viewKey="map:isle" />);
    expect(fake.setMinZoom).toHaveBeenLastCalledWith(CANVAS_MIN_ZOOM);
  });
});
