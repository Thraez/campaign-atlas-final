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
let slowPans = false;
let dragMoving = false;
let panning: { from: LL; to: LL } | null = null;
/**
 * Leaflet's `map._stop()` (every wheel batch, a pinch start, a drag start,
 * setView and flyTo): a running pan stops halfway, with a moveend there.
 */
const stop = () => {
  const p = panning;
  if (!p) return;
  panning = null;
  fake.center = { lat: (p.from.lat + p.to.lat) / 2, lng: (p.from.lng + p.to.lng) / 2 };
  fake.fire("moveend");
};
const stopPan = () => act(stop);
const finishPan = () =>
  act(() => {
    const p = panning!;
    panning = null;
    fake.center = p.to;
    fake.fire("moveend");
  });
/** Let `ms` pass on the (fake) clock. */
const wait = (ms: number) =>
  act(() => {
    vi.advanceTimersByTime(ms);
  });
/** The idle settle's quiet period, and a little more. */
const idle = () => wait(SETTLE_IDLE_MS + 10);
/** An animated zoom, in two steps: `zoomStarts` (Leaflet's next frame), `zoomEnds` later. */
const zoomStarts = () => act(() => fake.fire("zoomstart"));
const zoomEnds = (center: number[], zoom: number) =>
  act(() => {
    fake.center = at(center);
    fake.zoom = Math.max(zoom, fake.options.minZoom);
    fake.fire("zoomend");
    fake.fire("moveend");
  });
const input = (type: string) => fake.container.dispatchEvent(new Event(type));
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
    stop();
    fake.moveTo({ lat: c[0], lng: c[1] }, Math.max(z, fake.options.minZoom));
  }),
  /**
   * Leaflet's panTo: a pan, so only moveend when it lands. At once, unless
   * `slowPans` is set: then an animated pan waits for `finishPan()` and can be
   * cut short by `stopPan()` (Leaflet's `_stop()`: moveend where it stands).
   */
  panTo: vi.fn((c: [number, number], opts?: { animate?: boolean; duration?: number }) => {
    if (slowPans && opts?.animate) {
      const from = fake.center;
      panning = { from, to: { lat: c[0], lng: c[1] } };
      return;
    }
    fake.center = { lat: c[0], lng: c[1] };
    fake.fire("moveend");
  }),
  dragging: { moving: () => dragMoving },
  flyTo: vi.fn((c: [number, number], z: number) => {
    stop();
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
const { oceanMinZoom, SETTLE_IDLE_MS } = await import("@/atlas/canvas/OceanZoomLimit");
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
function userZoom(center: number[], zoom: number, type = "wheel") {
  input(type);
  act(() => fake.moveTo(at(center), Math.max(zoom, fake.options.minZoom)));
}

let now = 1000;
let clock: { mockRestore: () => void } | null = null;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  now = 1000;
  clock = vi.spyOn(performance, "now").mockImplementation(() => now);
  reduceMotion = false;
  landing = null;
  slowPans = false;
  dragMoving = false;
  panning = null;
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
  vi.useRealTimers();
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
      wait(SETTLE_IDLE_MS - 20);
      expect(fake.panTo).not.toHaveBeenCalled(); // not before the map is left alone
      idle();
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
    idle();
    expect(fake.panTo).not.toHaveBeenCalled();
    expect(shown().center).toEqual([400, 450]);
  });

  it("calm mode: the slide to the fit is a jump", () => {
    reduceMotion = true;
    const m = mount(OCEAN, "fit");
    const f = oceanFit();
    m.update(OCEAN, { center: [400, 450], zoom: f.zoom + 1 });
    userZoom([400, 450], f.zoom - 1);
    idle();
    expect(fake.panTo).toHaveBeenCalledTimes(1);
    expect(fake.panTo.mock.calls[0][1]).toMatchObject({ animate: false });
    expectOnFit();
  });

  it("a hand-back clamped to the floor (a camera below it) ends on the fit", () => {
    const m = mount(ISLE, { center: [300, 200], zoom: 0 });
    // What the canvas hands the caller after a zoom out of the isle, off-centre.
    m.update(OCEAN, { center: [350, 420], zoom: oceanFit().zoom - 1.5 });
    idle();
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
    // Raised to the floor, so on the fit; a resize never animates.
    expectOnFit();
    for (const call of fake.panTo.mock.calls) expect(call[1]).toMatchObject({ animate: false });
  });

  it("a resize at the floor re-fits even after a drag there (at the floor the camera is the fit)", () => {
    mount(OCEAN, "fit");
    act(() => fake.moveTo(at([700, 600]), fake.zoom)); // a drag: moveend only
    expect(shown().center).toEqual([700, 600]);
    fake.size = { x: 1440, y: 839 }; // the side panel closes
    act(() => fake.fire("resize"));
    expectOnFit();
    expect(fake.panTo).not.toHaveBeenCalled();
  });

  /** Zoomed in off to one side, wheeled out to the floor, the slide to the fit running. */
  function sliding() {
    slowPans = true;
    const m = mount(OCEAN, "fit");
    const f = oceanFit();
    m.update(OCEAN, { center: [400, 450], zoom: f.zoom + 1 });
    now += 1000;
    userZoom([380, 440], f.zoom - 2);
    idle();
    expect(fake.panTo).toHaveBeenCalledTimes(1);
    expect(panning).not.toBeNull();
    return { m, f };
  }

  it("a wheel-in during the slide wins: no pan after it, the camera stays where the user zoomed", () => {
    const { m, f } = sliding();
    // Leaflet: the wheel event, the batch 40 ms later stops the pan, the zoom
    // animation starts a frame after that and ends 250 ms later.
    input("wheel");
    wait(40);
    stopPan();
    wait(16);
    zoomStarts();
    wait(250);
    zoomEnds([520, 610], f.zoom + 0.8);
    wait(1000);
    expect(fake.panTo).toHaveBeenCalledTimes(1);
    expect(shown()).toEqual({ center: [520, 610], zoom: f.zoom + 0.8 });
    expect(m.onViewChange).not.toHaveBeenCalled();
  });

  it("a pinch starting during the slide wins", () => {
    const { f } = sliding();
    input("touchstart");
    stopPan(); // TouchZoom stops the map
    wait(30);
    zoomStarts(); // the first touchmove
    wait(400);
    zoomEnds([500, 600], f.zoom + 1.2);
    wait(1000);
    expect(fake.panTo).toHaveBeenCalledTimes(1);
    expect(shown()).toEqual({ center: [500, 600], zoom: f.zoom + 1.2 });
  });

  it("a drag ends the slide, and a drag before it starts stops it", () => {
    sliding();
    input("pointerdown");
    act(() => fake.fire("dragstart"));
    stopPan();
    dragMoving = true;
    wait(1000);
    dragMoving = false;
    act(() => fake.fire("moveend")); // the drag ends off-centre at the floor
    wait(1000);
    expect(fake.panTo).toHaveBeenCalledTimes(1);

    // Zoom out again, then press before the quiet period is over.
    fake.panTo.mockClear();
    panning = null;
    const f = oceanFit();
    act(() => fake.moveTo(at([400, 450]), f.zoom + 1));
    userZoom([380, 440], f.zoom - 1);
    wait(50);
    input("pointerdown");
    act(() => fake.fire("dragstart"));
    wait(1000);
    expect(fake.panTo).not.toHaveBeenCalled();
  });

  it.each([
    ["Reset", "fit" as Camera],
    ["a crumb or search glide", { center: [700, 650], zoom: 0 } as Camera],
  ])("%s pressed during the slide completes its glide", (_name, target) => {
    const { m, f } = sliding();
    const camera: Camera = target === "fit" ? "fit" : { ...target, zoom: f.zoom + 1 };
    m.glideTo(OCEAN, camera);
    expect(fake.flyTo).toHaveBeenCalledTimes(1);
    wait(1000); // nothing re-starts the slide under the glide
    expect(fake.panTo).toHaveBeenCalledTimes(1);
    land();
    wait(1000);
    expect(fake.panTo).toHaveBeenCalledTimes(1);
    if (camera === "fit") expectOnFit();
    else expect(shown()).toEqual({ center: [700, 650], zoom: f.zoom + 1 });
    expect(m.onViewChange).not.toHaveBeenCalled();
  });

  it("a trackpad inertia burst at the floor still ends on the fit", () => {
    const { m } = sliding();
    // 20 wheel-out batches at the floor: each stops the pan (delta 0, no zoom).
    for (let i = 0; i < 20; i++) {
      input("wheel");
      wait(40);
      stopPan();
      wait(10);
    }
    expect(fake.panTo).toHaveBeenCalledTimes(1); // nothing while the input goes on
    idle();
    expect(fake.panTo).toHaveBeenCalledTimes(2);
    expect(fake.panTo.mock.calls[1][1]).toMatchObject({ animate: true, duration: 0.4 });
    finishPan();
    wait(1000);
    expectOnFit();
    expect(fake.panTo).toHaveBeenCalledTimes(2);
    expect(m.onViewChange).not.toHaveBeenCalled();
  });

  it("a wheel-out at the floor after a drag there slides back to the fit", () => {
    mount(OCEAN, "fit");
    act(() => fake.moveTo(at([700, 600]), fake.zoom)); // dragged at the floor
    input("wheel"); // delta 0: no zoom
    idle();
    expectOnFit();
  });

  it("calm mode: a slide cut short by inertia jumps to the fit", () => {
    reduceMotion = true;
    const m = mount(OCEAN, "fit");
    const f = oceanFit();
    m.update(OCEAN, { center: [400, 450], zoom: f.zoom + 1 });
    userZoom([380, 440], f.zoom - 2);
    input("wheel");
    wait(100);
    input("wheel");
    idle();
    expect(fake.panTo).toHaveBeenCalledTimes(1);
    expect(fake.panTo.mock.calls[0][1]).toMatchObject({ animate: false });
    expectOnFit();
  });

  it("arrow-key pans at the floor stay where they go", () => {
    mount(OCEAN, "fit");
    fake.container.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft" }));
    act(() => fake.moveTo(at([700, 600]), fake.zoom));
    idle();
    expect(fake.panTo).not.toHaveBeenCalled();
    fake.container.dispatchEvent(new KeyboardEvent("keydown", { key: "-" })); // at the floor: no zoom
    idle();
    expectOnFit();
  });

  it("Reset from a dragged camera at the floor glides to the fit, with nothing after", () => {
    const m = mount(OCEAN, "fit");
    act(() => fake.moveTo(at([700, 600]), fake.zoom)); // dragged at the floor
    m.update(OCEAN, { center: [700, 600], zoom: fake.zoom });
    m.glideTo(OCEAN, "fit");
    land();
    expectOnFit();
    expect(fake.panTo).not.toHaveBeenCalled();
    expect(m.onViewChange).not.toHaveBeenCalled();
  });

  it("a glide that lands on the floor off-centre ends on the fit", () => {
    const m = mount(OCEAN, "fit");
    const f = oceanFit();
    m.update(OCEAN, { center: [600, 500], zoom: f.zoom + 1 });
    m.glideTo(OCEAN, { center: [700, 600], zoom: f.zoom });
    land();
    idle();
    expectOnFit();
    expect(m.onViewChange).not.toHaveBeenCalled();
  });

  it("a map hidden at mount sets the floor once when it is first shown", () => {
    const size = fake.size;
    fake.size = { x: 0, y: 0 };
    mount(OCEAN, "fit");
    const set = vi.spyOn(fake, "fire");
    fake.size = size;
    act(() => fake.fire("resize"));
    const levels = set.mock.calls.filter(([ev]) => ev === "zoomlevelschange").length;
    set.mockRestore();
    expect(levels).toBe(1);
    expectOnFit();
  });

  it("a map view has no ocean floor and never slides", () => {
    mount(ISLE, "fit");
    expect(fake.options.minZoom).toBe(-6);
    userZoom([100, 100], -3);
    idle();
    expect(fake.panTo).not.toHaveBeenCalled();
  });
});
