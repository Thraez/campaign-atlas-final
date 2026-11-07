import { render } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

type Handler = () => void;
const fake = {
  size: { x: 800, y: 600 },
  handlers: new Map<string, Handler>(),
  minZoom: -6,
  fitBounds: vi.fn(),
  options: { zoomSnap: 1 },
  getMinZoom() {
    return this.minZoom;
  },
  setMinZoom: vi.fn(function (this: { minZoom: number }, z: number) {
    this.minZoom = z;
  }),
  getSize() {
    return this.size;
  },
  on(ev: string, h: Handler) {
    this.handlers.set(ev, h);
  },
  off(ev: string) {
    this.handlers.delete(ev);
  },
  invalidateSize: vi.fn(),
  getContainer: () => document.createElement("div"),
};

vi.mock("react-leaflet", () => ({ useMap: () => fake }));

const { FitMapOnOpen } = await import("@/atlas/map/FitMapOnOpen");

const el = (id: string, skip = false, h = 1000, w = 2000) => (
  <FitMapOnOpen mapId={id} mapWidth={w} mapHeight={h} skip={skip} />
);

describe("FitMapOnOpen", () => {
  beforeEach(() => {
    fake.size = { x: 800, y: 600 };
    fake.handlers.clear();
    fake.fitBounds.mockClear();
    fake.setMinZoom.mockClear();
    fake.minZoom = -6;
  });

  it("fits the whole map on open", () => {
    render(el("a"));
    expect(fake.fitBounds).toHaveBeenCalledTimes(1);
    expect(fake.fitBounds).toHaveBeenCalledWith(
      [
        [0, 0],
        [1000, 2000],
      ],
      { animate: false },
    );
  });

  it("fits again on map change but not when the same map changes size", () => {
    const { rerender } = render(el("a"));
    rerender(el("a", false, 1400));
    expect(fake.fitBounds).toHaveBeenCalledTimes(1);
    rerender(el("b"));
    expect(fake.fitBounds).toHaveBeenCalledTimes(2);
  });

  it("skips the fit while a deep-link target exists", () => {
    const { rerender } = render(el("a", true));
    expect(fake.fitBounds).not.toHaveBeenCalled();
    rerender(el("a", false));
    expect(fake.fitBounds).not.toHaveBeenCalled();
    rerender(el("b", false));
    expect(fake.fitBounds).toHaveBeenCalledTimes(1);
  });

  it("waits for the container to have a size", () => {
    fake.size = { x: 0, y: 0 };
    render(el("a"));
    expect(fake.fitBounds).not.toHaveBeenCalled();
    fake.size = { x: 800, y: 600 };
    fake.handlers.get("resize")?.();
    expect(fake.fitBounds).toHaveBeenCalledTimes(1);
  });

  it("lowers the min zoom so a huge map still fits", () => {
    render(el("a", false, 1000, 400000));
    expect(fake.setMinZoom).toHaveBeenCalledWith(-9);
    expect(fake.fitBounds).toHaveBeenCalledWith(
      [
        [0, 0],
        [1000, 400000],
      ],
      { animate: false },
    );
  });

  it("never raises a lower min zoom", () => {
    fake.minZoom = -10;
    render(el("a", false, 1000, 400000));
    expect(fake.setMinZoom).not.toHaveBeenCalled();
  });

  it("lowers the min zoom but does not fit on a deep-link open", () => {
    render(el("a", true, 1000, 400000));
    expect(fake.setMinZoom).toHaveBeenCalledWith(-9);
    expect(fake.fitBounds).not.toHaveBeenCalled();
  });
});
