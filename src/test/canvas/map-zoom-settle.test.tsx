/**
 * Q-02: the handoff lands on the map. A wheel zooms about the pointer, so a
 * zoom in at a map's edge (or an entry at a frame's edge) grew the map away
 * into a corner and left the screen mostly sea. Once a zoom in on a map (or a
 * handoff into one) is left alone for SETTLE_IDLE_MS, the camera slides the
 * shortest way that shows no sea the map could fill (`settledCentre`).
 *
 * Also: vectors redraw on every non-animated zoom frame (a glide, a pinch),
 * so a glide out from deep zoom shows no clipped frame or route
 * (`RedrawVectorsWhileMoving`).
 *
 * A mock map like canvas-camera.test.tsx's: moves fire their events
 * synchronously; the settle timer runs on fake timers. With `slowPans`, an
 * animated pan and a glide wait to be finished or stopped, as in
 * one-ocean-view.test.tsx.
 */
import type React from "react";
import L from "leaflet";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AtlasProject } from "@/atlas/content/schema";

type LL = { lat: number; lng: number };
type Handler = () => void;

let slowPans = false;
let dragMoving = false;
let panning: { from: LL; to: LL } | null = null;
let landing: (() => void) | null = null;
/** Leaflet's `map._stop()`: a running pan stops halfway, with a moveend there. */
const stop = () => {
  const p = panning;
  if (!p) return;
  panning = null;
  fake.center = { lat: (p.from.lat + p.to.lat) / 2, lng: (p.from.lng + p.to.lng) / 2 };
  fake.fire("moveend");
};
const stopPan = () => act(stop);
const land = () =>
  act(() => {
    const l = landing;
    landing = null;
    l?.();
  });

const fake = {
  size: { x: 800, y: 600 },
  center: { lat: 0, lng: 0 } as LL,
  zoom: 0,
  options: { zoomSnap: 0, minZoom: -6, maxZoom: 4 },
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
    return this.options.maxZoom;
  },
  moveTo(center: LL, zoom: number) {
    const zoomed = zoom !== this.zoom;
    if (zoomed) this.fire("zoomstart");
    this.center = center;
    this.zoom = zoom;
    if (zoomed) this.fire("zoomend");
    this.fire("moveend");
  },
  /** Leaflet's containerPointToLatLng on a flat CRS (lat grows up). */
  containerPointToLatLng(p: [number, number]): LL {
    const k = 2 ** this.zoom;
    return {
      lat: this.center.lat - (p[1] - this.size.y / 2) / k,
      lng: this.center.lng + (p[0] - this.size.x / 2) / k,
    };
  },
  layers: [] as unknown[],
  eachLayer(fn: (l: unknown) => void) {
    for (const l of this.layers) fn(l);
  },
  setMinZoom: vi.fn(),
  setZoom: vi.fn(),
  invalidateSize: vi.fn(),
  container: document.createElement("div"),
  getContainer() {
    return this.container;
  },
  getPane(): HTMLElement | undefined {
    return undefined;
  },
  fitBounds: vi.fn((b: [[number, number], [number, number]]) => {
    fake.moveTo({ lat: (b[0][0] + b[1][0]) / 2, lng: (b[0][1] + b[1][1]) / 2 }, -1);
  }),
  setView: vi.fn((c: [number, number], z: number) => {
    stop();
    fake.moveTo({ lat: c[0], lng: c[1] }, Math.max(z, fake.options.minZoom));
  }),
  /** At once, unless `slowPans`: then an animated pan waits (`stopPan`). */
  panTo: vi.fn((c: [number, number], opts?: { animate?: boolean }) => {
    if (slowPans && opts?.animate) {
      panning = { from: fake.center, to: { lat: c[0], lng: c[1] } };
      return;
    }
    fake.center = { lat: c[0], lng: c[1] };
    fake.fire("moveend");
  }),
  dragging: { moving: () => dragMoving },
  /** A glide: zoomstart now, the rest when `land()` is called. */
  flyTo: vi.fn((c: [number, number], z: number) => {
    stop();
    fake.fire("zoomstart");
    landing = () => {
      fake.center = { lat: c[0], lng: c[1] };
      fake.zoom = z;
      fake.fire("zoomend");
      fake.fire("moveend");
    };
  }),
};

vi.mock("react-leaflet", async () => {
  const { makeReactLeafletModule } = await import("../helpers/reactLeafletMock");
  const SVGOverlay = ({ children }: { children?: React.ReactNode }) => <svg>{children}</svg>;
  return { ...makeReactLeafletModule(), SVGOverlay, useMap: () => fake };
});

let reduceMotion = false;
vi.mock("@/hooks/use-reduce-motion", () => ({ useReduceMotion: () => reduceMotion }));

const { buildMapTree } = await import("@/atlas/ocean/mapTree");
const { AtlasCanvas } = await import("@/atlas/canvas/AtlasCanvas");
const { SETTLE_IDLE_MS } = await import("@/atlas/canvas/OceanZoomLimit");
const { settledCentre, insidePolygon } = await import("@/atlas/canvas/mapSettle");
type Camera = import("@/atlas/canvas/AtlasCanvas").CanvasCamera;
type View = import("@/atlas/canvas/AtlasCanvas").CanvasView;

// The isle (600x400, on the ocean at (200,300)) holds "cove" (400x300) in the
// frame (0,0)-(100,75), entered at isle zoom 2 (cove zoom = isle zoom - 2).
// The cove holds "pool" (400x300) in the frame (300,225)-(400,300), entered at
// cove zoom 2 (pool zoom = cove zoom - 2).
const PROJECT = {
  schemaVersion: 2,
  maps: [
    { id: "isle", name: "Isle", width: 600, height: 400, layers: [] },
    {
      id: "cove",
      name: "Cove",
      width: 400,
      height: 300,
      layers: [],
      parent: "isle",
      frame: { x: 0, y: 0, width: 100, height: 75, rotation: 0 },
      enterZoom: 2,
    },
    {
      id: "pool",
      name: "Pool",
      width: 400,
      height: 300,
      layers: [],
      parent: "cove",
      frame: { x: 300, y: 225, width: 100, height: 75, rotation: 0 },
      enterZoom: 2,
    },
  ],
  ocean: {
    width: 3000,
    height: 2000,
    sea: "default",
    onOcean: [{ map: "isle", x: 200, y: 300, scale: 1, rotation: 0 }],
  },
} as unknown as AtlasProject;
const tree = buildMapTree(PROJECT);
const ISLE: View = { kind: "map", mapId: "isle" };
const COVE: View = { kind: "map", mapId: "cove" };
const POOL: View = { kind: "map", mapId: "pool" };

function mount(view: View, camera: Camera) {
  const onViewChange = vi.fn();
  let glide = 0;
  const el = (v: View, c: Camera) => (
    <AtlasCanvas tree={tree} view={v} camera={c} glide={glide} onViewChange={onViewChange} />
  );
  const r = render(el(view, camera));
  return {
    onViewChange,
    update: (v: View, c: Camera) =>
      act(() => {
        r.rerender(el(v, c));
      }),
    /** A crumb or Reset: glide to the camera. */
    glideTo: (v: View, c: Camera) =>
      act(() => {
        glide += 1;
        r.rerender(el(v, c));
      }),
  };
}

let now = 1000;
let clock: { mockRestore: () => void } | null = null;

/** The camera at view point `c` (the view `h` px tall) and zoom `z`. */
const at = (h: number, c: [number, number], z: number) => {
  fake.center = { lat: h - c[1], lng: c[0] };
  fake.zoom = z;
};
/** A user zoom (wheel) from the current camera to `c` at `z`, in a view `h` px tall. */
const wheelZoom = (h: number, c: [number, number], z: number) => {
  fake.container.dispatchEvent(new Event("wheel"));
  act(() => fake.fire("zoomstart"));
  at(h, c, z);
  act(() => fake.fire("zoomend"));
  act(() => fake.fire("moveend"));
};
/** The camera centre in view px of a view `h` px tall. */
const centre = (h: number) => [fake.center.lng, h - fake.center.lat];
const idle = () => act(() => vi.advanceTimersByTime(SETTLE_IDLE_MS + 1));
/** The pointer at container point (x, y) (jsdom's container sits at 0,0). */
const pointAt = (x: number, y: number) =>
  fake.container.dispatchEvent(new MouseEvent("pointermove", { clientX: x, clientY: y }));
/** The wheel handoff from the isle into the cove at its frame's corner (P-04). */
const wheelIntoCove = (before?: () => void) => {
  const m = mount(ISLE, { center: [250, 180], zoom: 1 });
  before?.();
  fake.container.dispatchEvent(new Event("wheel"));
  const k = 2 ** -4;
  act(() => fake.fire("zoomstart"));
  fake.center = { lat: 400 - (70 + 220 * k), lng: 95 + 310 * k };
  fake.zoom = 4;
  act(() => fake.fire("zoomend"));
  expect(m.onViewChange).toHaveBeenCalledTimes(1);
  const [view, cam] = m.onViewChange.mock.calls[0] as [View, Camera];
  expect(view).toEqual(COVE);
  return { m, cam };
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  now = 1000;
  clock = vi.spyOn(performance, "now").mockImplementation(() => now);
  reduceMotion = false;
  fake._animatingZoom = false;
  fake.size = { x: 800, y: 600 };
  fake.center = { lat: 0, lng: 0 };
  fake.zoom = 0;
  fake.options.minZoom = -6;
  fake.options.maxZoom = 4;
  slowPans = false;
  dragMoving = false;
  panning = null;
  landing = null;
  fake.layers = [];
  fake.handlers.clear();
  fake.container = document.createElement("div");
  fake.fitBounds.mockClear();
  fake.setView.mockClear();
  fake.panTo.mockClear();
  fake.flyTo.mockClear();
});
afterEach(() => {
  cleanup();
  clock?.mockRestore();
  vi.useRealTimers();
});

describe("settledCentre", () => {
  const size = { x: 800, y: 600 };
  it("leaves a camera that shows no sea where it is", () => {
    expect(settledCentre([300, 200], 1, 600, 400, size)).toBeNull();
  });
  it("slides the shortest way so a map bigger than the screen covers it", () => {
    // zoom 2: the screen is 200x150 view px; the camera at x 580 shows sea past 600
    expect(settledCentre([580, 20], 2, 600, 400, size)).toEqual([500, 75]);
  });
  it("puts a map smaller than the screen wholly on it", () => {
    // zoom 0: the screen is 800x600, the map 600x400; the camera at (700, 450)
    const c = settledCentre([700, 450], 0, 600, 400, size)!;
    expect(c).toEqual([400, 300]);
  });
  it("ignores a slide under a screen pixel", () => {
    expect(settledCentre([500.1, 200], 2, 600, 400, size)).toBeNull();
  });
  it("knows a point inside a polygon", () => {
    const sq: [number, number][] = [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ];
    expect(insidePolygon([5, 5], sq)).toBe(true);
    expect(insidePolygon([15, 5], sq)).toBe(false);
  });
});

describe("MapZoomSettle: the map stays on screen (Q-02)", () => {
  it("slides a zoom in that ends over the map's edge back onto the map", () => {
    mount(ISLE, { center: [300, 200], zoom: 1 });
    wheelZoom(400, [580, 200], 2); // half the screen is sea, right of x 600
    expect(fake.panTo).not.toHaveBeenCalled(); // not before the user stops
    idle();
    expect(fake.panTo).toHaveBeenCalledTimes(1);
    expect(centre(400)).toEqual([500, 200]);
    expect(fake.panTo.mock.calls[0][1]).toMatchObject({ animate: true });
  });

  it("jumps in calm mode", () => {
    reduceMotion = true;
    mount(ISLE, { center: [300, 200], zoom: 1 });
    wheelZoom(400, [580, 200], 2);
    idle();
    expect(fake.panTo.mock.calls[0][1]).toMatchObject({ animate: false });
    expect(centre(400)).toEqual([500, 200]);
  });

  it("lands a handoff into a child on the child, not in its corner", () => {
    // P-04's anchored entry at the frame's bottom-right corner: the cove's
    // camera centre (457.5, 335) is outside the 400x300 cove.
    const { m, cam } = wheelIntoCove();
    m.update(COVE, cam);
    expect(centre(300)[0]).toBeCloseTo(457.5, 6); // the handed-over camera, as before
    idle();
    expect(fake.panTo).toHaveBeenCalledTimes(1);
    // zoom 2: the screen is 200x150 cove px, so the centre clamps to (300, 225)
    expect(centre(300)).toEqual([300, 225]);
    expect(m.onViewChange).toHaveBeenCalledTimes(1); // the slide never hands off
  });

  it("is disarmed by a pointer press, a drag or a new zoom", () => {
    mount(ISLE, { center: [300, 200], zoom: 1 });
    wheelZoom(400, [580, 200], 2);
    fake.container.dispatchEvent(new Event("pointerdown"));
    idle();
    wheelZoom(400, [580, 200], 2.2);
    act(() => fake.fire("dragstart"));
    idle();
    expect(fake.panTo).not.toHaveBeenCalled();
  });

  it("leaves a zoom out alone", () => {
    mount(ISLE, { center: [580, 200], zoom: 2 });
    wheelZoom(400, [580, 200], 1.5);
    idle();
    expect(fake.panTo).not.toHaveBeenCalled();
  });

  it("never slides a child's frame out from under the pointer (P-04)", () => {
    mount(ISLE, { center: [80, 60], zoom: 1 });
    // the pointer over the cove's frame at view (50, 40): screen (400-30*k, 300-20*k), k 2^1.9
    const k = 2 ** 1.9;
    const over = new MouseEvent("pointermove", { clientX: 400 - 30 * k, clientY: 300 - 20 * k });
    fake.container.dispatchEvent(over);
    wheelZoom(400, [80, 60], 1.9); // sea above and left; below the cove's enter zoom
    idle();
    expect(fake.panTo).not.toHaveBeenCalled();
    // the same zoom with the pointer off the frame settles
    fake.container.dispatchEvent(new MouseEvent("pointermove", { clientX: 700, clientY: 500 }));
    wheelZoom(400, [80, 60], 1.95);
    idle();
    expect(fake.panTo).toHaveBeenCalledTimes(1);
  });

  it("keeps a grandchild's frame under a pointer that has not moved since the handoff", () => {
    // The pointer stays where the one notch was: container (90, 80), the
    // anchor's screen spot, over cove (380, 280) inside the pool's frame.
    const { m, cam } = wheelIntoCove(() => pointAt(90, 80));
    m.update(COVE, cam);
    expect(centre(300)[0]).toBeCloseTo(457.5, 6);
    idle();
    expect(fake.panTo).not.toHaveBeenCalled();
    // The pointer leaves: the next zoom in settles again.
    fake.container.dispatchEvent(new Event("pointerleave"));
    wheelZoom(300, centre(300) as [number, number], 2.1);
    idle();
    expect(fake.panTo).toHaveBeenCalledTimes(1);
  });

  it("settles a keyboard zoom that enters two levels at once", () => {
    fake.options.maxZoom = 8;
    fake.size = { x: 800, y: 600 };
    const m = mount(ISLE, { center: [99.5, 74.5], zoom: 3 });
    fake.container.dispatchEvent(new KeyboardEvent("keydown", { key: "+" }));
    act(() => fake.fire("zoomstart"));
    at(400, [99.5, 74.5], 6); // cove zoom 4, past the pool's enter zoom 2
    act(() => fake.fire("zoomend"));
    act(() => fake.fire("moveend"));
    expect(m.onViewChange).toHaveBeenCalledTimes(1);
    const [view, cam] = m.onViewChange.mock.calls[0] as [View, Camera];
    expect(view).toEqual(POOL);
    m.update(POOL, cam);
    expect(centre(300)[0]).toBeCloseTo(392, 6); // the pool's corner, sea past it
    idle();
    expect(fake.panTo).toHaveBeenCalledTimes(1);
    // pool zoom 2: the screen is 200x150 pool px
    expect(centre(300)).toEqual([300, 225]);
  });

  it("settles a pinch that ends with a moveend only (calm mode)", () => {
    mount(ISLE, { center: [300, 200], zoom: 1 });
    fake.container.dispatchEvent(new Event("touchstart"));
    act(() => fake.fire("zoomstart"));
    at(400, [580, 200], 2);
    act(() => fake.fire("moveend")); // touchend's _resetView: no zoomend
    idle();
    expect(fake.panTo).toHaveBeenCalledTimes(1);
    expect(centre(400)).toEqual([500, 200]);
  });

  it("settles after a glide that a drag stopped (a zoomstart with no zoomend)", () => {
    const m = mount(ISLE, { center: [300, 200], zoom: 1 });
    m.glideTo(ISLE, { center: [300, 200], zoom: 1.5 });
    expect(fake.flyTo).toHaveBeenCalledTimes(1);
    fake.container.dispatchEvent(new Event("pointerdown"));
    act(() => fake.fire("dragstart"));
    landing = null; // `_stop()` cancels the flight
    act(() => fake.moveTo({ lat: 200, lng: 320 }, fake.zoom)); // the drag ends: moveend only
    now += 1000;
    wheelZoom(400, [580, 200], 2);
    idle();
    expect(fake.panTo).toHaveBeenCalledTimes(1);
    expect(centre(400)).toEqual([500, 200]);
  });

  it("never slides under a glide that starts while it waits", () => {
    const m = mount(ISLE, { center: [300, 200], zoom: 1 });
    wheelZoom(400, [580, 200], 2); // armed
    m.glideTo(ISLE, { center: [580, 200], zoom: 2.5 }); // a crumb: flyTo's zoomstart
    idle();
    expect(fake.panTo).not.toHaveBeenCalled();
    land();
    act(() => vi.advanceTimersByTime(1000));
    expect(fake.panTo).not.toHaveBeenCalled(); // the glide's landing is the canvas's own
  });

  it("lets the user's input win over a running slide", () => {
    slowPans = true;
    mount(ISLE, { center: [300, 200], zoom: 1.5 });
    wheelZoom(400, [580, 200], 1.8);
    idle();
    expect(fake.panTo).toHaveBeenCalledTimes(1);
    expect(panning).not.toBeNull();
    // A drag: Leaflet stops the pan where it is.
    fake.container.dispatchEvent(new Event("pointerdown"));
    act(() => fake.fire("dragstart"));
    stopPan();
    dragMoving = true;
    act(() => vi.advanceTimersByTime(1000));
    dragMoving = false;
    act(() => fake.fire("moveend"));
    act(() => vi.advanceTimersByTime(1000));
    expect(fake.panTo).toHaveBeenCalledTimes(1);
    // A wheel during a new slide: the zoom it makes stands where it ends.
    wheelZoom(400, [580, 200], 1.85);
    idle();
    expect(fake.panTo).toHaveBeenCalledTimes(2);
    fake.container.dispatchEvent(new Event("wheel"));
    stopPan();
    act(() => fake.fire("zoomstart"));
    at(400, [300, 200], 1.9); // on the map: nothing to settle
    act(() => fake.fire("zoomend"));
    act(() => fake.fire("moveend"));
    act(() => vi.advanceTimersByTime(1000));
    expect(fake.panTo).toHaveBeenCalledTimes(2);
    expect(centre(400)).toEqual([300, 200]);
  });

  it("is disarmed by an arrow-key pan", () => {
    mount(ISLE, { center: [300, 200], zoom: 1 });
    wheelZoom(400, [580, 200], 2);
    fake.container.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft" }));
    idle();
    expect(fake.panTo).not.toHaveBeenCalled();
  });

  it("forgets a handoff the caller ignored: a later jump to that map does not slide", () => {
    const { m, cam } = wheelIntoCove(); // the caller stays on the isle
    now += 2000;
    m.update(COVE, cam); // later, a calm-mode crumb jump to the cove
    idle();
    expect(fake.panTo).not.toHaveBeenCalled();
  });

  it("leaves the ocean to OceanZoomLimit", () => {
    mount({ kind: "ocean" }, { center: [1500, 1000], zoom: 1 });
    wheelZoom(2000, [2900, 1000], 1.5);
    idle();
    // OceanZoomLimit settles only at the floor; the zoom ended above it
    expect(fake.panTo).not.toHaveBeenCalled();
  });
});

describe("RedrawVectorsWhileMoving (Q-02)", () => {
  const renderer = () => {
    const r = Object.create(L.Renderer.prototype) as { _reset: ReturnType<typeof vi.fn> };
    r._reset = vi.fn();
    return r;
  };

  it("redraws every renderer on a glide's or pinch's in-between frames", () => {
    const svg = renderer();
    const other = { _reset: vi.fn() };
    fake.layers = [svg, other];
    mount(ISLE, { center: [300, 200], zoom: 1 });
    act(() => fake.fire("zoomstart"));
    for (let i = 0; i < 3; i++) act(() => fake.fire("zoom"));
    expect(svg._reset).toHaveBeenCalledTimes(2); // not the first: Leaflet's own
    expect(other._reset).not.toHaveBeenCalled();
  });

  it("leaves a calm-mode jump and Leaflet's own zoom animation to Leaflet", () => {
    const svg = renderer();
    fake.layers = [svg];
    mount(ISLE, { center: [300, 200], zoom: 1 });
    // A calm-mode jump: one zoom between zoomstart and zoomend.
    act(() => fake.fire("zoomstart"));
    act(() => fake.fire("zoom"));
    act(() => fake.fire("zoomend"));
    // A wheel zoom: the CSS transition, then one zoom at its end.
    act(() => fake.fire("zoomstart"));
    fake._animatingZoom = true;
    act(() => fake.fire("zoom"));
    fake._animatingZoom = false;
    act(() => fake.fire("zoom"));
    expect(svg._reset).not.toHaveBeenCalled();
  });

  it("skips a renderer without _reset instead of throwing", () => {
    const bare = Object.create(L.Renderer.prototype) as { _reset?: unknown };
    bare._reset = undefined;
    fake.layers = [bare];
    mount(ISLE, { center: [300, 200], zoom: 1 });
    act(() => fake.fire("zoomstart"));
    expect(() => {
      for (let i = 0; i < 2; i++) act(() => fake.fire("zoom"));
    }).not.toThrow();
  });
});
