/** R-36: the ocean cannot zoom out far past the fit-all zoom (playtest reached -5.7). */
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Handler = () => void;
const fake = {
  size: { x: 800, y: 600 },
  zoom: 0,
  options: { minZoom: -6 },
  handlers: new Map<string, Set<Handler>>(),
  setMinZoom: vi.fn(),
  setZoom: vi.fn(),
  fire: vi.fn(),
  getSize() {
    return this.size;
  },
  getZoom() {
    return this.zoom;
  },
  on(ev: string, h: Handler) {
    if (!this.handlers.has(ev)) this.handlers.set(ev, new Set());
    this.handlers.get(ev)!.add(h);
  },
  off(ev: string, h: Handler) {
    this.handlers.get(ev)?.delete(h);
  },
  emit(ev: string) {
    for (const h of [...(this.handlers.get(ev) ?? [])]) h();
  },
  invalidateSize: vi.fn(),
  getContainer: () => document.createElement("div"),
};
vi.mock("react-leaflet", () => ({ useMap: () => fake }));

const { OceanZoomLimit, oceanMinZoom, CANVAS_MIN_ZOOM } =
  await import("@/atlas/canvas/OceanZoomLimit");

beforeEach(() => {
  fake.size = { x: 800, y: 600 };
  fake.zoom = 0;
  fake.options.minZoom = CANVAS_MIN_ZOOM;
  fake.handlers.clear();
});
afterEach(() => {
  cleanup();
  for (const f of [fake.setMinZoom, fake.setZoom, fake.fire]) f.mockClear();
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
  it("raises the floor on the ocean without Leaflet's animated setMinZoom", () => {
    render(<OceanZoomLimit ocean fitWidth={3200} fitHeight={2400} viewKey="ocean" />);
    expect(fake.options.minZoom).toBe(-3);
    expect(fake.fire).toHaveBeenCalledWith("zoomlevelschange");
    expect(fake.setMinZoom).not.toHaveBeenCalled();
    expect(fake.setZoom).not.toHaveBeenCalled(); // zoom 0 is above the floor
  });
  it("moves a zoom already below the new floor to it, with no animation", () => {
    fake.zoom = -5;
    render(<OceanZoomLimit ocean fitWidth={3200} fitHeight={2400} viewKey="ocean" />);
    expect(fake.setZoom).toHaveBeenCalledWith(-3, { animate: false });
  });
  it("gives other views the canvas floor", () => {
    fake.options.minZoom = -3;
    render(<OceanZoomLimit ocean={false} fitWidth={600} fitHeight={400} viewKey="map:isle" />);
    expect(fake.options.minZoom).toBe(CANVAS_MIN_ZOOM);
    expect(fake.setMinZoom).not.toHaveBeenCalled();
  });
  it("waits for a size, then sets the floor", () => {
    fake.size = { x: 0, y: 0 };
    render(<OceanZoomLimit ocean fitWidth={3200} fitHeight={2400} viewKey="ocean" />);
    expect(fake.options.minZoom).toBe(CANVAS_MIN_ZOOM);
    fake.size = { x: 800, y: 600 };
    fake.emit("resize");
    expect(fake.options.minZoom).toBe(-3);
  });
  it("recomputes the floor on resize and stops listening on unmount", () => {
    const { unmount } = render(
      <OceanZoomLimit ocean fitWidth={3200} fitHeight={2400} viewKey="ocean" />,
    );
    fake.size = { x: 375, y: 700 }; // fit zoom log2(375/3200) = -3.09; floor -4.09
    fake.emit("resize");
    expect(fake.options.minZoom).toBeCloseTo(Math.log2(375 / 3200) - 1, 6);
    unmount();
    expect(fake.handlers.get("resize")?.size ?? 0).toBe(0);
  });
});
