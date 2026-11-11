/**
 * R-31: the shared canvas's camera on a mock map that, like Leaflet with
 * `animate: false`, fires `moveend` synchronously from `fitBounds` and
 * `setView`. Pins that the caller hears the fitted camera (on first mount and
 * on a view change), that an explicit camera is applied, that a camera echoed
 * back is ignored, that reduced motion never animates, and that turning the
 * camera back to "fit" re-fits.
 */
import type React from "react";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AtlasProject } from "@/atlas/content/schema";

type LL = { lat: number; lng: number };
type Handler = () => void;

const fake = {
  size: { x: 800, y: 600 },
  center: { lat: 0, lng: 0 } as LL,
  zoom: 0,
  minZoom: -6,
  options: { zoomSnap: 1 },
  handlers: new Map<string, Set<Handler>>(),
  on(ev: string, h: Handler) {
    if (!this.handlers.has(ev)) this.handlers.set(ev, new Set());
    this.handlers.get(ev)!.add(h);
  },
  off(ev: string, h?: Handler) {
    if (h) this.handlers.get(ev)?.delete(h);
    else this.handlers.delete(ev);
  },
  fire(ev: string) {
    for (const h of [...(this.handlers.get(ev) ?? [])]) h();
  },
  getSize() {
    return this.size;
  },
  getCenter() {
    return this.center;
  },
  getZoom() {
    return this.zoom;
  },
  getMinZoom() {
    return this.minZoom;
  },
  setMinZoom: vi.fn(),
  invalidateSize: vi.fn(),
  getContainer: () => document.createElement("div"),
  fitBounds: vi.fn((b: [[number, number], [number, number]]) => {
    fake.center = { lat: (b[0][0] + b[1][0]) / 2, lng: (b[0][1] + b[1][1]) / 2 };
    fake.zoom = -1;
    fake.fire("moveend");
  }),
  setView: vi.fn((c: [number, number], z: number) => {
    fake.center = { lat: c[0], lng: c[1] };
    fake.zoom = z;
    fake.fire("moveend");
  }),
};

vi.mock("react-leaflet", async () => {
  const { makeReactLeafletModule } = await import("../helpers/reactLeafletMock");
  // SVGOverlay's children are SVG elements: give them an <svg> to sit in.
  const SVGOverlay = ({ children }: { children?: React.ReactNode }) => <svg>{children}</svg>;
  return { ...makeReactLeafletModule(), SVGOverlay, useMap: () => fake };
});

let reduceMotion = false;
vi.mock("@/hooks/use-reduce-motion", () => ({ useReduceMotion: () => reduceMotion }));

const { buildMapTree } = await import("@/atlas/ocean/mapTree");
const { AtlasCanvas } = await import("@/atlas/canvas/AtlasCanvas");
type Camera = import("@/atlas/canvas/AtlasCanvas").CanvasCamera;
type View = import("@/atlas/canvas/AtlasCanvas").CanvasView;

// A tiny v2 world: a 3000x2000 ocean with one 600x400 map at (200,300), scale 1.
const PROJECT = {
  schemaVersion: 2,
  maps: [{ id: "isle", name: "Isle", width: 600, height: 400, layers: [] }],
  ocean: {
    width: 3000,
    height: 2000,
    sea: "default",
    onOcean: [{ map: "isle", x: 200, y: 300, scale: 1, rotation: 0 }],
  },
} as unknown as AtlasProject;
const tree = buildMapTree(PROJECT);
const OCEAN: View = { kind: "ocean" };
const ISLE: View = { kind: "map", mapId: "isle" };

function mount(view: View, camera: Camera) {
  const onCameraChange = vi.fn();
  const el = (v: View, c: Camera) => (
    <AtlasCanvas tree={tree} view={v} camera={c} onCameraChange={onCameraChange} />
  );
  const r = render(el(view, camera));
  return {
    onCameraChange,
    update: (v: View, c: Camera) =>
      act(() => {
        r.rerender(el(v, c));
      }),
  };
}

beforeEach(() => {
  reduceMotion = false;
  fake.size = { x: 800, y: 600 };
  fake.center = { lat: 0, lng: 0 };
  fake.zoom = 0;
  fake.handlers.clear();
  fake.fitBounds.mockClear();
  fake.setView.mockClear();
});
afterEach(cleanup);

describe("AtlasCanvas camera", () => {
  it("reports the fitted camera on first mount, in the view's own pixels", () => {
    const m = mount(OCEAN, "fit");
    expect(fake.fitBounds).toHaveBeenCalledTimes(1);
    // the fit box is the placed map: (200,300)-(800,700), centre (500,500)
    expect(m.onCameraChange).toHaveBeenLastCalledWith({ center: [500, 500], zoom: -1 });
  });

  it("reports the fitted camera after a view change", () => {
    const m = mount(OCEAN, "fit");
    m.onCameraChange.mockClear();
    m.update(ISLE, "fit");
    expect(fake.fitBounds).toHaveBeenCalledTimes(2);
    // the whole 600x400 map, in the map's own pixels
    expect(m.onCameraChange).toHaveBeenLastCalledWith({ center: [300, 200], zoom: -1 });
  });

  it("applies an explicit camera with setView, animated", () => {
    const m = mount(ISLE, "fit");
    m.update(ISLE, { center: [100, 50], zoom: 1 });
    expect(fake.setView).toHaveBeenCalledTimes(1);
    // lat = viewHeight - y
    expect(fake.setView).toHaveBeenCalledWith([350, 100], 1, { animate: true });
    expect(m.onCameraChange).toHaveBeenLastCalledWith({ center: [100, 50], zoom: 1 });
  });

  it("ignores a camera echoed back from onCameraChange", () => {
    const m = mount(ISLE, "fit");
    const reported = m.onCameraChange.mock.calls.at(-1)![0] as Camera;
    m.update(ISLE, reported);
    expect(fake.setView).not.toHaveBeenCalled();
  });

  it("never animates under reduced motion", () => {
    reduceMotion = true;
    const m = mount(ISLE, "fit");
    m.update(ISLE, { center: [100, 50], zoom: 1 });
    expect(fake.setView).toHaveBeenCalledWith([350, 100], 1, { animate: false });
  });

  it("does not animate an explicit camera that arrives with a new view", () => {
    const m = mount(OCEAN, "fit");
    m.update(ISLE, { center: [100, 50], zoom: 1 });
    expect(fake.setView).toHaveBeenCalledWith([350, 100], 1, { animate: false });
  });

  it("re-fits when the camera turns back to fit", () => {
    const m = mount(ISLE, "fit");
    m.update(ISLE, { center: [100, 50], zoom: 1 });
    expect(fake.fitBounds).toHaveBeenCalledTimes(1);
    m.onCameraChange.mockClear();
    m.update(ISLE, "fit");
    expect(fake.fitBounds).toHaveBeenCalledTimes(2);
    expect(m.onCameraChange).toHaveBeenLastCalledWith({ center: [300, 200], zoom: -1 });
  });
});
