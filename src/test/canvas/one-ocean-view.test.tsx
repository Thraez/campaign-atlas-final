/**
 * Q-01 "One ocean view": first load, Reset, a crumb up to the ocean (a "fit"
 * camera with the glide bumped, as the viewer's Ocean crumb sends) and the
 * zoom-out floor (wheel, keyboard, a hand-back clamped to it) all end on the
 * same camera, the ocean fit (`oceanFitBox`). A window or side-panel resize
 * keeps the fit a fit. None of it hands off.
 *
 * The fake map does Leaflet's CRS.Simple arithmetic (screen px = view px *
 * 2^zoom, `fitBounds` centres the box at the largest zoom that fits it,
 * `setView` clamps the zoom to `minZoom`). Its flyTo fires zoomstart at once
 * and leaves the landing to `land()`.
 */
import type React from "react";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AtlasProject } from "@/atlas/content/schema";

type LL = { lat: number; lng: number };
type Handler = () => void;
type Bounds = [[number, number], [number, number]];

let landing: (() => void) | null = null;
const fitOf = (b: Bounds) => {
  const w = b[1][1] - b[0][1];
  const h = b[1][0] - b[0][0];
  const zoom = Math.log2(Math.min(fake.size.x / w, fake.size.y / h));
  return {
    center: { lat: (b[0][0] + b[1][0]) / 2, lng: (b[0][1] + b[1][1]) / 2 },
    zoom: Math.max(zoom, fake.options.minZoom),
  };
};
const fake = {
  size: { x: 800, y: 600 },
  center: { lat: 0, lng: 0 } as LL,
  zoom: 0,
  options: { zoomSnap: 0, minZoom: -6 },
  _animatingZoom: false,
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
    return this.options.minZoom;
  },
  getMaxZoom() {
    return 4;
  },
  moveTo(center: LL, zoom: number) {
    const zoomed = zoom !== this.zoom;
    if (zoomed) this.fire("zoomstart");
    this.center = center;
    this.zoom = zoom;
    if (zoomed) this.fire("zoomend");
    this.fire("moveend");
  },
  setMinZoom: vi.fn((z: number) => {
    fake.options.minZoom = z;
  }),
  setZoom: vi.fn((z: number) => {
    fake.moveTo(fake.center, Math.max(z, fake.options.minZoom));
  }),
  invalidateSize: vi.fn(),
  container: document.createElement("div"),
  getContainer() {
    return this.container;
  },
  getPane(): HTMLElement | undefined {
    return undefined;
  },
  fitBounds: vi.fn((b: Bounds) => {
    const f = fitOf(b);
    fake.moveTo(f.center, f.zoom);
  }),
  setView: vi.fn((c: [number, number], z: number) => {
    fake.moveTo({ lat: c[0], lng: c[1] }, Math.max(z, fake.options.minZoom));
  }),
  /** Leaflet's panTo: a pan, so only moveend (when it lands; at once here). */
  panTo: vi.fn((c: [number, number], _opts?: { animate?: boolean; duration?: number }) => {
    fake.center = { lat: c[0], lng: c[1] };
    fake.fire("moveend");
  }),
  flyTo: vi.fn((c: [number, number], z: number) => {
    fake.fire("zoomstart");
    landing = () => {
      fake.center = { lat: c[0], lng: c[1] };
      fake.zoom = Math.max(z, fake.options.minZoom);
      fake.fire("zoomend");
      fake.fire("moveend");
    };
  }),
  flyToBounds: vi.fn((b: Bounds) => {
    const f = fitOf(b);
    fake.flyTo([f.center.lat, f.center.lng], f.zoom);
  }),
};
const land = () =>
  act(() => {
    const l = landing;
    landing = null;
    l?.();
  });

vi.mock("react-leaflet", async () => {
  const { makeReactLeafletModule } = await import("../helpers/reactLeafletMock");
  const SVGOverlay = ({ children }: { children?: React.ReactNode }) => <svg>{children}</svg>;
  return { ...makeReactLeafletModule(), SVGOverlay, useMap: () => fake };
});

let reduceMotion = false;
vi.mock("@/hooks/use-reduce-motion", () => ({ useReduceMotion: () => reduceMotion }));

const { buildMapTree } = await import("@/atlas/ocean/mapTree");
const { AtlasCanvas } = await import("@/atlas/canvas/AtlasCanvas");
const { oceanFitBox } = await import("@/atlas/canvas/canvasGeometry");
const { oceanMinZoom } = await import("@/atlas/canvas/OceanZoomLimit");
type Camera = import("@/atlas/canvas/AtlasCanvas").CanvasCamera;
type View = import("@/atlas/canvas/AtlasCanvas").CanvasView;

// ocean 3000x2000; isle 600x400 at (200,300) scale 1, a second isle 300x200
// at (1400,900): the fit box spans both plus the 8 % margin.
const tree = buildMapTree({
  schemaVersion: 2,
  maps: [
    { id: "isle", name: "Isle", width: 600, height: 400, layers: [] },
    { id: "skerry", name: "Skerry", width: 300, height: 200, layers: [] },
  ],
  ocean: {
    width: 3000,
    height: 2000,
    sea: "default",
    onOcean: [
      { map: "isle", x: 200, y: 300, scale: 1, rotation: 0 },
      { map: "skerry", x: 1400, y: 900, scale: 1, rotation: 0 },
    ],
  },
} as unknown as AtlasProject);
const OCEAN: View = { kind: "ocean" };
const ISLE: View = { kind: "map", mapId: "isle" };
const OCEAN_H = 2000;

/** The ocean fit at the fake's current size, in ocean pixels. */
function oceanFit() {
  const b = oceanFitBox(tree)!;
  const zoom = oceanMinZoom(fake.size, b.maxX - b.minX, b.maxY - b.minY)!;
  return { center: [(b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2], zoom };
}
/** The camera on screen, in ocean pixels. */
const shown = () => ({ center: [fake.center.lng, OCEAN_H - fake.center.lat], zoom: fake.zoom });
const at = (c: number[]): LL => ({ lat: OCEAN_H - c[1], lng: c[0] });

function expectOnFit() {
  const f = oceanFit();
  const s = shown();
  expect(s.zoom).toBeCloseTo(f.zoom, 9);
  expect(s.center[0]).toBeCloseTo(f.center[0], 6);
  expect(s.center[1]).toBeCloseTo(f.center[1], 6);
}

function mount(view: View, camera: Camera) {
  const onCameraChange = vi.fn();
  const onViewChange = vi.fn();
  const el = (v: View, c: Camera, g: number) => (
    <AtlasCanvas
      tree={tree}
      view={v}
      camera={c}
      glide={g}
      onCameraChange={onCameraChange}
      onViewChange={onViewChange}
    />
  );
  let glide = 0;
  const r = render(el(view, camera, glide));
  return {
    onCameraChange,
    onViewChange,
    update: (v: View, c: Camera) =>
      act(() => {
        r.rerender(el(v, c, glide));
      }),
    glideTo: (v: View, c: Camera) =>
      act(() => {
        glide += 1;
        r.rerender(el(v, c, glide));
      }),
  };
}

/** A user zoom (wheel by default) that settles at `zoom` about `center`, clamped as Leaflet does. */
function userZoom(center: number[], zoom: number, input = "wheel") {
  fake.container.dispatchEvent(new Event(input));
  act(() => fake.moveTo(at(center), Math.max(zoom, fake.options.minZoom)));
}

let now = 1000;
let clock: { mockRestore: () => void } | null = null;
beforeEach(() => {
  now = 1000;
  clock = vi.spyOn(performance, "now").mockImplementation(() => now);
  reduceMotion = false;
  landing = null;
  fake.size = { x: 1040, y: 839 };
  fake.center = { lat: 0, lng: 0 };
  fake.zoom = 0;
  fake.options.minZoom = -6;
  fake.handlers.clear();
  fake.container = document.createElement("div");
  for (const f of [
    fake.fitBounds,
    fake.setView,
    fake.flyTo,
    fake.flyToBounds,
    fake.panTo,
    fake.setZoom,
  ])
    f.mockClear();
});
afterEach(() => {
  cleanup();
  clock?.mockRestore();
});

describe("one ocean view (Q-01)", () => {
  it("first load fits the ocean, and the floor is that fit's zoom", () => {
    mount(OCEAN, "fit");
    expectOnFit();
    expect(fake.options.minZoom).toBeCloseTo(oceanFit().zoom, 9);
  });

  it("Reset on the ocean glides back to the same camera", () => {
    const m = mount(OCEAN, "fit");
    const first = shown();
    m.update(OCEAN, { center: [600, 500], zoom: first.zoom + 1.3 });
    m.glideTo(OCEAN, "fit");
    expect(fake.flyToBounds).toHaveBeenCalledTimes(1);
    land();
    expectOnFit();
    expect(fake.panTo).not.toHaveBeenCalled(); // landed on the fit: nothing to slide
    expect(m.onViewChange).not.toHaveBeenCalled();
  });

  it("the Ocean crumb (a fit, glided) from a map lands on the same camera, without a handoff", () => {
    const m = mount(ISLE, { center: [300, 200], zoom: 0.5 });
    fake.container.dispatchEvent(new Event("wheel")); // stray input before the click
    m.glideTo(OCEAN, "fit");
    land();
    expectOnFit();
    expect(m.onViewChange).not.toHaveBeenCalled();
  });

  it("calm mode: Reset and the crumb jump straight to the same camera", () => {
    reduceMotion = true;
    const m = mount(ISLE, { center: [300, 200], zoom: 0.5 });
    m.glideTo(OCEAN, "fit");
    expect(fake.flyToBounds).not.toHaveBeenCalled();
    expectOnFit();
  });

  it.each(["wheel", "keydown", "touchstart"])(
    "a %s zoom-out past the floor ends on the fit, without a handoff",
    (input) => {
      const m = mount(OCEAN, "fit");
      const f = oceanFit();
      // Zoomed in, panned off to one side.
      m.update(OCEAN, { center: [400, 450], zoom: f.zoom + 1 });
      now += 1000;
      userZoom([380, 440], f.zoom - 2, input);
      expect(fake.zoom).toBeCloseTo(f.zoom, 9); // the floor holds (R-36)
      expect(fake.panTo).toHaveBeenCalledTimes(1);
      expect(fake.panTo.mock.calls[0][1]).toMatchObject({ animate: true, duration: 0.4 });
      expectOnFit();
      expect(m.onViewChange).not.toHaveBeenCalled();
      // The caller hears the fitted camera.
      const last = m.onCameraChange.mock.calls.at(-1)![0] as { center: number[]; zoom: number };
      expect(last.center[0]).toBeCloseTo(f.center[0], 6);
      expect(last.zoom).toBeCloseTo(f.zoom, 9);
    },
  );

  it("a zoom-out that stops above the floor stays where the user put it", () => {
    const m = mount(OCEAN, "fit");
    const f = oceanFit();
    m.update(OCEAN, { center: [400, 450], zoom: f.zoom + 2 });
    now += 1000;
    userZoom([400, 450], f.zoom + 1);
    expect(fake.panTo).not.toHaveBeenCalled();
    expect(shown().center).toEqual([400, 450]);
  });

  it("calm mode: the slide to the fit is a jump", () => {
    reduceMotion = true;
    const m = mount(OCEAN, "fit");
    const f = oceanFit();
    m.update(OCEAN, { center: [400, 450], zoom: f.zoom + 1 });
    userZoom([400, 450], f.zoom - 1);
    expect(fake.panTo.mock.calls[0][1]).toMatchObject({ animate: false });
    expectOnFit();
  });

  it("a hand-back clamped to the floor (a camera below it) ends on the fit", () => {
    const m = mount(ISLE, { center: [300, 200], zoom: 0 });
    // What the canvas hands the caller after a zoom out of the isle, off-centre.
    m.update(OCEAN, { center: [350, 420], zoom: oceanFit().zoom - 1.5 });
    expectOnFit();
    expect(m.onViewChange).not.toHaveBeenCalled();
  });

  it("a resize while on the fit re-fits (window, side panel)", () => {
    mount(OCEAN, "fit");
    for (const size of [
      { x: 1440, y: 839 }, // side panel closed
      { x: 343, y: 690 }, // phone
      { x: 1040, y: 839 }, // back
    ]) {
      fake.size = size;
      act(() => fake.fire("resize"));
      expectOnFit();
      expect(fake.options.minZoom).toBeCloseTo(oceanFit().zoom, 9);
    }
  });

  it("a resize away from the floor keeps the user's camera, raising the zoom only to a floor above it", () => {
    const m = mount(OCEAN, "fit");
    const f = oceanFit();
    m.update(OCEAN, { center: [400, 450], zoom: f.zoom + 0.5 });
    fake.size = { x: 1440, y: 900 };
    act(() => fake.fire("resize"));
    expect(shown()).toEqual({ center: [400, 450], zoom: f.zoom + 0.5 });
    fake.size = { x: 4000, y: 3000 }; // a much bigger canvas: the floor rises above the zoom
    act(() => fake.fire("resize"));
    expect(fake.zoom).toBeCloseTo(oceanFit().zoom, 9);
  });

  it("a map view has no ocean floor and never slides", () => {
    mount(ISLE, "fit");
    expect(fake.options.minZoom).toBe(-6);
    userZoom([100, 100], -3);
    expect(fake.panTo).not.toHaveBeenCalled();
  });
});
