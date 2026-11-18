/**
 * R-31: the shared canvas's camera on a mock map that, like Leaflet with
 * `animate: false`, fires `zoomstart`/`zoomend` (on a zoom change) and
 * `moveend` synchronously from `fitBounds` and `setView`. Pins that the caller hears the fitted camera (on first mount and
 * on a view change), that an explicit camera is applied, that a camera echoed
 * back is ignored, that reduced motion never animates, and that turning the
 * camera back to "fit" re-fits. R-32: a zoom the user made hands off to
 * another view through `onViewChange`; a zoom the canvas made never does.
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
  options: { zoomSnap: 1, minZoom: -6 },
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
  /** Leaflet's order for a move: zoomstart, (the move), zoomend, moveend. */
  moveTo(center: LL, zoom: number) {
    const zoomed = zoom !== this.zoom;
    if (zoomed) this.fire("zoomstart");
    this.center = center;
    this.zoom = zoom;
    if (zoomed) this.fire("zoomend");
    this.fire("moveend");
  },
  setMinZoom: vi.fn(),
  setZoom: vi.fn(),
  invalidateSize: vi.fn(),
  container: document.createElement("div"),
  getContainer() {
    return this.container;
  },
  fitBounds: vi.fn((b: [[number, number], [number, number]]) => {
    fake.moveTo({ lat: (b[0][0] + b[1][0]) / 2, lng: (b[0][1] + b[1][1]) / 2 }, -1);
  }),
  // Like Leaflet, setView clamps to the floor (options.minZoom).
  setView: vi.fn((c: [number, number], z: number) => {
    fake.moveTo({ lat: c[0], lng: c[1] }, Math.max(z, fake.options.minZoom));
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
const { OCEAN_FIT_MARGIN } = await import("@/atlas/canvas/canvasGeometry");
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

function mount(
  view: View,
  camera: Camera,
  onViewChange?: (v: View, c: Camera) => void,
  canvasTree = tree,
) {
  const onCameraChange = vi.fn();
  const el = (v: View, c: Camera) => (
    <AtlasCanvas
      tree={canvasTree}
      view={v}
      camera={c}
      onCameraChange={onCameraChange}
      onViewChange={onViewChange}
    />
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
  fake.options.minZoom = -6;
  fake.handlers.clear();
  fake.container = document.createElement("div");
  fake.fitBounds.mockClear();
  fake.setView.mockClear();
  fake.setMinZoom.mockClear();
  fake.setZoom.mockClear();
});
afterEach(cleanup);

describe("AtlasCanvas camera", () => {
  it("reports the fitted camera on first mount, in the view's own pixels", () => {
    const m = mount(OCEAN, "fit");
    expect(fake.fitBounds).toHaveBeenCalledTimes(1);
    // the fit box is the placed map (200,300)-(800,700) plus the margin: same centre (500,500)
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

  // R-36: the ocean floor (one level below the fit zoom) is set before the camera applies.
  // The test ocean fits 600x400 plus the R-37 margin (8% a side: 696x464) in 800x600:
  // fit zoom log2(800/696), floor 1 below it.
  const OCEAN_FLOOR = Math.log2(800 / (600 * (1 + 2 * OCEAN_FIT_MARGIN))) - 1;

  it("clamps a handed-over ocean camera below the floor to it, with no animated setZoom", () => {
    const m = mount(ISLE, "fit");
    m.update(OCEAN, { center: [500, 500], zoom: -5 });
    expect(fake.options.minZoom).toBeCloseTo(OCEAN_FLOOR, 9);
    expect(fake.zoom).toBeCloseTo(OCEAN_FLOOR, 9);
    expect(fake.setMinZoom).not.toHaveBeenCalled();
    // the old map's zoom (-1) sat below the new floor: moved at once, never animated
    for (const call of fake.setZoom.mock.calls) expect(call[1]).toEqual({ animate: false });
  });

  it("opens the ocean at a URL zoom below the floor at the floor, not animating up to it", () => {
    mount(OCEAN, { center: [500, 500], zoom: -6 });
    expect(fake.zoom).toBeCloseTo(OCEAN_FLOOR, 9);
    expect(fake.setZoom).not.toHaveBeenCalled();
    expect(fake.setView).toHaveBeenCalledTimes(1);
  });

  it("gives a map view the canvas floor back after the ocean's", () => {
    const m = mount(OCEAN, "fit");
    expect(fake.options.minZoom).toBeCloseTo(OCEAN_FLOOR, 9);
    m.update(ISLE, { center: [300, 200], zoom: -3 });
    expect(fake.options.minZoom).toBe(-6);
    expect(fake.zoom).toBe(-3);
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

describe("AtlasCanvas zoom handoff (R-32)", () => {
  // Ocean point (500, 500) is the isle's centre (300, 200); the isle fills the
  // viewport's shorter side (600 / 400) from ocean zoom log2(1.5).
  // A user zoom as Leaflet reports it: zoomstart at the old zoom, then zoomend.
  const zoomTo = (oceanPoint: [number, number], zoom: number) => {
    fake.fire("zoomstart");
    fake.center = { lat: 2000 - oceanPoint[1], lng: oceanPoint[0] };
    fake.zoom = zoom;
  };

  it("hands off after a user zoom settles past the threshold", () => {
    const onViewChange = vi.fn();
    mount(OCEAN, "fit", onViewChange);
    fake.container.dispatchEvent(new Event("wheel"));
    zoomTo([500, 500], 1);
    act(() => fake.fire("zoomend"));
    expect(onViewChange).toHaveBeenCalledTimes(1);
    const [view, camera] = onViewChange.mock.calls[0] as [View, { center: number[]; zoom: number }];
    expect(view).toEqual(ISLE);
    expect(camera.center[0]).toBeCloseTo(300, 9);
    expect(camera.center[1]).toBeCloseTo(200, 9);
    expect(camera.zoom).toBeCloseTo(1, 9);
  });

  it("stays below the threshold", () => {
    const onViewChange = vi.fn();
    mount(OCEAN, "fit", onViewChange);
    fake.container.dispatchEvent(new Event("wheel"));
    zoomTo([500, 500], 0.5);
    act(() => fake.fire("zoomend"));
    expect(onViewChange).not.toHaveBeenCalled();
  });

  it("never hands off on a zoom the canvas made (a fit, an explicit camera)", () => {
    const onViewChange = vi.fn();
    const m = mount(OCEAN, "fit", onViewChange);
    zoomTo([500, 500], 1);
    act(() => fake.fire("zoomend"));
    m.update(OCEAN, { center: [500, 500], zoom: 2 });
    act(() => fake.fire("zoomend"));
    expect(onViewChange).not.toHaveBeenCalled();
  });

  it("never hands off a caller's camera after a click or a key that moved nothing", () => {
    const onViewChange = vi.fn();
    const m = mount(OCEAN, "fit", onViewChange);
    for (const ev of ["pointerdown", "mousedown", "keydown"]) {
      fake.container.dispatchEvent(new Event(ev)); // a pin select, a Tab: no move
    }
    m.update(OCEAN, { center: [500, 500], zoom: 2 }); // a deep link, past the threshold
    expect(fake.setView).toHaveBeenCalledTimes(1);
    expect(onViewChange).not.toHaveBeenCalled();
  });

  it("never hands off a re-fit after a click that moved nothing", () => {
    const onViewChange = vi.fn();
    const m = mount(ISLE, { center: [300, 200], zoom: 2 }, onViewChange);
    fake.container.dispatchEvent(new Event("pointerdown"));
    m.update(ISLE, "fit"); // fits at -1: past the isle's leave zoom
    expect(fake.fitBounds).toHaveBeenCalledTimes(1);
    expect(onViewChange).not.toHaveBeenCalled();
  });

  it("never enters on a zoom out", () => {
    const onViewChange = vi.fn();
    mount(OCEAN, { center: [500, 500], zoom: 2 }, onViewChange);
    fake.container.dispatchEvent(new Event("wheel"));
    zoomTo([500, 500], 1.5); // still past the isle's enter zoom, but going out
    act(() => fake.fire("zoomend"));
    expect(onViewChange).not.toHaveBeenCalled();
  });

  it("forgets a user input once its move ends (a pan)", () => {
    const onViewChange = vi.fn();
    mount(OCEAN, "fit", onViewChange);
    fake.container.dispatchEvent(new Event("mousedown"));
    act(() => fake.fire("moveend"));
    zoomTo([500, 500], 1);
    act(() => fake.fire("zoomend"));
    expect(onViewChange).not.toHaveBeenCalled();
  });

  it("drops the old view's moveend that follows a handoff's zoomend", async () => {
    const onViewChange = vi.fn();
    const m = mount(OCEAN, "fit", onViewChange);
    m.onCameraChange.mockClear();
    fake.container.dispatchEvent(new Event("wheel"));
    zoomTo([500, 500], 1);
    act(() => {
      fake.fire("zoomend"); // Leaflet fires both in one dispatch
      fake.fire("moveend");
    });
    expect(onViewChange).toHaveBeenCalledTimes(1);
    expect(m.onCameraChange).not.toHaveBeenCalled();
    await Promise.resolve();
    act(() => fake.fire("moveend")); // later moves report again
    expect(m.onCameraChange).toHaveBeenCalledTimes(1);
  });

  it("swaps to the new view's camera without animation and without a refit", () => {
    const m = mount(OCEAN, "fit", (v, c) => m.update(v, c));
    fake.fitBounds.mockClear();
    fake.container.dispatchEvent(new Event("wheel"));
    zoomTo([500, 500], 1);
    act(() => fake.fire("zoomend"));
    expect(fake.fitBounds).not.toHaveBeenCalled();
    expect(fake.setView).toHaveBeenCalledTimes(1);
    const [latLng, zoom, opts] = fake.setView.mock.calls[0] as unknown as [
      number[],
      number,
      object,
    ];
    expect(latLng[0]).toBeCloseTo(200, 9); // isle: lat = 400 - 200
    expect(latLng[1]).toBeCloseTo(300, 9);
    expect(zoom).toBeCloseTo(1, 9);
    expect(opts).toEqual({ animate: false });
  });
});

describe("AtlasCanvas zoom handoff: a pan's moveend during a zoom (R-40)", () => {
  const zoomTo = (oceanPoint: [number, number], zoom: number) => {
    fake.center = { lat: 2000 - oceanPoint[1], lng: oceanPoint[0] };
    fake.zoom = zoom;
  };

  it("still hands off when a pan's moveend lands between zoomstart and zoomend", () => {
    const onViewChange = vi.fn();
    mount(OCEAN, "fit", onViewChange);
    fake.container.dispatchEvent(new Event("wheel"));
    act(() => fake.fire("zoomstart"));
    act(() => fake.fire("moveend")); // a fling's inertia ends mid-zoom
    zoomTo([500, 500], 1);
    act(() => fake.fire("zoomend"));
    expect(onViewChange).toHaveBeenCalledTimes(1);
    expect(onViewChange.mock.calls[0][0]).toEqual(ISLE);
  });

  it("a pan's moveend after the zoom has ended still disarms", () => {
    const onViewChange = vi.fn();
    mount(OCEAN, "fit", onViewChange);
    fake.container.dispatchEvent(new Event("wheel"));
    act(() => fake.fire("zoomstart"));
    zoomTo([500, 500], 0.25); // below the threshold: stays
    act(() => {
      fake.fire("zoomend");
      fake.fire("moveend");
    });
    fake.container.dispatchEvent(new Event("mousedown"));
    act(() => fake.fire("moveend")); // a pan
    act(() => fake.fire("zoomstart")); // a zoom nobody asked for
    zoomTo([500, 500], 1);
    act(() => fake.fire("zoomend"));
    expect(onViewChange).not.toHaveBeenCalled();
  });

  it("a new view while a zoom is in flight leaves no stale state behind", () => {
    const onViewChange = vi.fn();
    const m = mount(OCEAN, "fit", onViewChange);
    fake.container.dispatchEvent(new Event("wheel"));
    act(() => fake.fire("zoomstart")); // never ends: the view changes first
    m.update(ISLE, "fit");
    fake.container.dispatchEvent(new Event("mousedown"));
    act(() => fake.fire("moveend")); // a pan on the new view disarms as usual
    m.update(ISLE, { center: [300, 200], zoom: -4 }); // the caller's camera, past the leave zoom
    expect(onViewChange).not.toHaveBeenCalled();
  });
});

describe("AtlasCanvas zoom handoff: the zoom's anchor point (P-04)", () => {
  // The isle (600x400, ocean (200,300), scale 1) holds a child "cove" (400x300)
  // in the frame (0,0)-(100,75), entered at isle zoom 2 (cove zoom = isle zoom - 2).
  const NESTED = {
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
  const nested = buildMapTree(NESTED);
  const COVE: View = { kind: "map", mapId: "cove" };

  /**
   * A zoom anchored at a screen point, as Leaflet's wheel and double-click
   * make it: the ground `p` (view px) sits `s` screen px from the centre
   * before and after. The view is `h` px tall.
   */
  const anchoredZoom = (
    h: number,
    p: [number, number],
    s: [number, number],
    z0: number,
    z1: number,
  ) => {
    const at = (z: number) => {
      const k = 2 ** -z;
      fake.center = { lat: h - (p[1] - s[1] * k), lng: p[0] - s[0] * k };
      fake.zoom = z;
    };
    at(z0);
    act(() => fake.fire("zoomstart"));
    at(z1);
    act(() => fake.fire("zoomend"));
  };

  const start = (view: View, center: [number, number], zoom: number) => {
    const onViewChange = vi.fn();
    mount(view, { center, zoom }, onViewChange, nested);
    return onViewChange;
  };

  it("enters the child under the cursor at max zoom, though the centre is outside its frame", () => {
    // The Oskmark dead end: the cursor sits by the frame's bottom-right corner,
    // so the frame slides up-left and the centre never reaches it.
    const onViewChange = start(ISLE, [250, 180], 1);
    fake.container.dispatchEvent(new Event("wheel"));
    anchoredZoom(400, [95, 70], [-310, -220], 1, 4);
    // the centre ends at (114.4, 83.75): outside the frame (0..100, 0..75)
    expect(fake.center.lng).toBeGreaterThan(100);
    expect(onViewChange).toHaveBeenCalledTimes(1);
    const [view, cam] = onViewChange.mock.calls[0] as [View, { center: number[]; zoom: number }];
    expect(view).toEqual(COVE);
    expect(cam.zoom).toBeCloseTo(2, 9);
    // the same ground under the centre: isle (114.375, 83.75) is cove (457.5, 335)
    expect(cam.center[0]).toBeCloseTo(457.5, 9);
    expect(cam.center[1]).toBeCloseTo(335, 9);
  });

  it("still enters by the centre when the cursor is beside the frame (keyboard, buttons, today's rule)", () => {
    const onViewChange = start(ISLE, [50, 40], 1);
    fake.container.dispatchEvent(new Event("keydown"));
    anchoredZoom(400, [50, 40], [0, 0], 1, 2.5); // zoom about the centre
    expect(onViewChange.mock.calls[0][0]).toEqual(COVE);
  });

  it("stays below the child's enter zoom with the cursor on the frame", () => {
    const onViewChange = start(ISLE, [250, 180], 1);
    fake.container.dispatchEvent(new Event("wheel"));
    anchoredZoom(400, [95, 70], [-310, -220], 1, 1.9);
    expect(onViewChange).not.toHaveBeenCalled();
  });

  it("never enters on a zoom out with the cursor on the frame", () => {
    const onViewChange = start(ISLE, [114.375, 83.75], 4);
    fake.container.dispatchEvent(new Event("wheel"));
    anchoredZoom(400, [95, 70], [-310, -220], 4, 3);
    expect(onViewChange).not.toHaveBeenCalled();
  });

  it("never enters on the canvas's own zoom with the cursor on the frame", () => {
    const onViewChange = start(ISLE, [250, 180], 1);
    anchoredZoom(400, [95, 70], [-310, -220], 1, 4); // no input event first
    expect(onViewChange).not.toHaveBeenCalled();
  });

  it("zooming out of the child hands back with the ground under the cursor kept", () => {
    // cove leaves below min(fit (1), fit - 0.5, landing (0) - 0.5): -0.5
    const onViewChange = start(COVE, [200, 150], 1);
    fake.container.dispatchEvent(new Event("wheel"));
    anchoredZoom(300, [100, 80], [-200, -140], 1, -0.75);
    expect(onViewChange).toHaveBeenCalledTimes(1);
    const [view, cam] = onViewChange.mock.calls[0] as [View, { center: number[]; zoom: number }];
    expect(view).toEqual(ISLE);
    expect(cam.zoom).toBeCloseTo(1.25, 9);
    // cove (100, 80) is isle (25, 20), still 200,140 screen px up-left of the centre
    const k = 2 ** -1.25;
    expect(cam.center[0]).toBeCloseTo(25 + 200 * k, 9);
    expect(cam.center[1]).toBeCloseTo(20 + 140 * k, 9);
  });

  it("one wheel step from the ocean with the cursor on the frame enters the isle only", () => {
    // isle entry: ocean fill zoom log2(600/400) = 0.58; the cove needs isle 2 = ocean 2
    const onViewChange = start(OCEAN, [400, 400], 0);
    fake.container.dispatchEvent(new Event("wheel"));
    anchoredZoom(2000, [295, 370], [-100, -60], 0, 1.5); // the cove's frame is ocean (200..300, 300..375)
    expect(onViewChange.mock.calls[0][0]).toEqual(ISLE);
  });

  it("an anchor that a pan pushed off the screen falls back to the centre", () => {
    const onViewChange = start(ISLE, [300, 200], 1);
    fake.container.dispatchEvent(new Event("wheel"));
    act(() => fake.fire("zoomstart"));
    // the centre moved far while the zoom barely changed: no screen point stayed put
    fake.center = { lat: 400 - 300, lng: 500 };
    fake.zoom = 1.01;
    act(() => fake.fire("zoomend"));
    expect(onViewChange).not.toHaveBeenCalled();
  });
});
