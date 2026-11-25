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
 * synchronously; the settle timer runs on fake timers.
 */
import type React from "react";
import L from "leaflet";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AtlasProject } from "@/atlas/content/schema";

type LL = { lat: number; lng: number };
type Handler = () => void;

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
    fake.moveTo({ lat: c[0], lng: c[1] }, Math.max(z, fake.options.minZoom));
  }),
  panTo: vi.fn((c: [number, number], _opts?: { animate?: boolean }) => {
    fake.center = { lat: c[0], lng: c[1] };
    fake.fire("moveend");
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

function mount(view: View, camera: Camera) {
  const onViewChange = vi.fn();
  const el = (v: View, c: Camera) => (
    <AtlasCanvas tree={tree} view={v} camera={c} onViewChange={onViewChange} />
  );
  const r = render(el(view, camera));
  return {
    onViewChange,
    update: (v: View, c: Camera) =>
      act(() => {
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
  fake.layers = [];
  fake.handlers.clear();
  fake.container = document.createElement("div");
  fake.fitBounds.mockClear();
  fake.setView.mockClear();
  fake.panTo.mockClear();
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
    const m = mount(ISLE, { center: [250, 180], zoom: 1 });
    fake.container.dispatchEvent(new Event("wheel"));
    const k = 2 ** -4;
    act(() => fake.fire("zoomstart"));
    fake.center = { lat: 400 - (70 + 220 * k), lng: 95 + 310 * k };
    fake.zoom = 4;
    act(() => fake.fire("zoomend"));
    expect(m.onViewChange).toHaveBeenCalledTimes(1);
    const [view, cam] = m.onViewChange.mock.calls[0] as [View, Camera];
    expect(view).toEqual(COVE);
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

  it("redraws every renderer on a glide's or pinch's zoom frame", () => {
    const svg = renderer();
    const other = { _reset: vi.fn() };
    fake.layers = [svg, other];
    mount(ISLE, { center: [300, 200], zoom: 1 });
    act(() => fake.fire("zoom"));
    expect(svg._reset).toHaveBeenCalledTimes(1);
    expect(other._reset).not.toHaveBeenCalled();
  });

  it("leaves Leaflet's own zoom animation to Leaflet", () => {
    const svg = renderer();
    fake.layers = [svg];
    mount(ISLE, { center: [300, 200], zoom: 1 });
    fake._animatingZoom = true;
    act(() => fake.fire("zoom"));
    expect(svg._reset).not.toHaveBeenCalled();
  });
});
