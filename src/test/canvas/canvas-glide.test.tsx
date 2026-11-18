/**
 * P-06 on the canvas-camera fake map: a breadcrumb or Reset (the caller
 * bumping `glide`) glides with `flyTo` / `flyToBounds`, calm mode jumps, a
 * glide never hands off, and one wheel step hands off one level at most.
 *
 * The fake's flyTo fires zoomstart at once (Leaflet's `_moveStart`) and leaves
 * the end (zoomend, moveend) to the test, `land()`, as the animation would.
 */
import type React from "react";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AtlasProject } from "@/atlas/content/schema";

type LL = { lat: number; lng: number };
type Handler = () => void;
type Bounds = [[number, number], [number, number]];

let landing: (() => void) | null = null;
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
  fitBounds: vi.fn((b: Bounds) => {
    fake.moveTo({ lat: (b[0][0] + b[1][0]) / 2, lng: (b[0][1] + b[1][1]) / 2 }, -1);
  }),
  setView: vi.fn((c: [number, number], z: number) => {
    fake.moveTo({ lat: c[0], lng: c[1] }, Math.max(z, fake.options.minZoom));
  }),
  /** Leaflet's flyTo: zoomstart and movestart now, zoomend and moveend when it lands. */
  flyTo: vi.fn((c: [number, number], z: number) => {
    fake.fire("zoomstart");
    landing = () => {
      fake.center = { lat: c[0], lng: c[1] };
      fake.zoom = z;
      fake.fire("zoomend");
      fake.fire("moveend");
    };
  }),
  flyToBounds: vi.fn((b: Bounds) => {
    fake.flyTo([(b[0][0] + b[1][0]) / 2, (b[0][1] + b[1][1]) / 2], -1);
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
type Camera = import("@/atlas/canvas/AtlasCanvas").CanvasCamera;
type View = import("@/atlas/canvas/AtlasCanvas").CanvasView;

// ocean 3000x2000; isle 600x400 at (200,300) scale 1; cove 400x300 in the
// isle's frame (0,0)-(100,75), entered at isle zoom 2 (cove zoom = isle zoom - 2).
const tree = buildMapTree({
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
} as unknown as AtlasProject);
const OCEAN: View = { kind: "ocean" };
const ISLE: View = { kind: "map", mapId: "isle" };
const COVE: View = { kind: "map", mapId: "cove" };

function mount(view: View, camera: Camera, onViewChange = vi.fn()) {
  const onCameraChange = vi.fn();
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
    /** A plain camera or view change (a jump). */
    update: (v: View, c: Camera) =>
      act(() => {
        r.rerender(el(v, c, glide));
      }),
    /** A crumb or Reset: the same change with the glide counter bumped. */
    glideTo: (v: View, c: Camera) =>
      act(() => {
        glide += 1;
        r.rerender(el(v, c, glide));
      }),
  };
}

let now = 1000;
let clock: { mockRestore: () => void } | null = null;
beforeEach(() => {
  now = 1000;
  clock = vi.spyOn(performance, "now").mockImplementation(() => now);
  reduceMotion = false;
  landing = null;
  fake.size = { x: 800, y: 600 };
  fake.center = { lat: 0, lng: 0 };
  fake.zoom = 0;
  fake.options.minZoom = -6;
  fake.handlers.clear();
  fake.container = document.createElement("div");
  for (const f of [fake.fitBounds, fake.setView, fake.flyTo, fake.flyToBounds]) f.mockClear();
});
afterEach(() => {
  cleanup();
  clock?.mockRestore();
});

const lastCam = (m: { onCameraChange: ReturnType<typeof vi.fn> }) =>
  m.onCameraChange.mock.calls.at(-1)![0] as { center: number[]; zoom: number };

describe("glide (P-06)", () => {
  it("Reset glides to the fit with flyToBounds when motion is on", () => {
    const m = mount(ISLE, { center: [100, 100], zoom: 2 });
    m.glideTo(ISLE, "fit");
    expect(fake.flyToBounds).toHaveBeenCalledTimes(1);
    expect(fake.fitBounds).not.toHaveBeenCalled();
    land();
    // the camera the caller (and so the URL) hears is the landed one
    expect(lastCam(m)).toEqual({ center: [300, 200], zoom: -1 });
  });

  it("a crumb up the tree cuts to the same ground, then glides to the ancestor's camera", () => {
    const m = mount(ISLE, { center: [300, 200], zoom: 2 });
    fake.setView.mockClear();
    m.glideTo(OCEAN, { center: [1500, 1000], zoom: -2 });
    // the cut: the isle's (300,200) is the ocean's (500,500); zoom unchanged (scale 1)
    expect(fake.setView).toHaveBeenCalledTimes(1);
    const [c, z] = fake.setView.mock.calls[0] as [[number, number], number];
    expect(c[1]).toBeCloseTo(500, 9);
    expect(2000 - c[0]).toBeCloseTo(500, 9);
    expect(z).toBeCloseTo(2, 9);
    expect(fake.flyTo).toHaveBeenCalledTimes(1);
    const [fc, fz] = fake.flyTo.mock.calls[0] as [[number, number], number];
    expect([fc[1], 2000 - fc[0], fz]).toEqual([1500, 1000, -2]);
    land();
    expect(lastCam(m)).toEqual({ center: [1500, 1000], zoom: -2 });
  });

  it("a crumb to an ancestor's fit glides with flyToBounds", () => {
    const m = mount(COVE, { center: [200, 150], zoom: 1 });
    fake.setView.mockClear();
    m.glideTo(ISLE, "fit");
    expect(fake.setView).toHaveBeenCalledTimes(1);
    expect(fake.flyToBounds).toHaveBeenCalledTimes(1);
    expect(fake.fitBounds).not.toHaveBeenCalled();
  });

  it("calm mode (reduced motion) jumps: no flyTo, no flyToBounds", () => {
    reduceMotion = true;
    const m = mount(ISLE, { center: [100, 100], zoom: 2 });
    m.glideTo(ISLE, "fit");
    m.glideTo(OCEAN, { center: [1500, 1000], zoom: 0 });
    expect(fake.flyTo).not.toHaveBeenCalled();
    expect(fake.flyToBounds).not.toHaveBeenCalled();
    expect(fake.fitBounds).toHaveBeenCalled();
    expect(lastCam(m)).toEqual({ center: [1500, 1000], zoom: 0 });
  });

  it("a change without a glide bump still jumps", () => {
    const m = mount(ISLE, { center: [100, 100], zoom: 2 });
    m.update(ISLE, "fit");
    expect(fake.fitBounds).toHaveBeenCalledTimes(1);
    expect(fake.flyToBounds).not.toHaveBeenCalled();
  });

  it("a glide never hands off, though it lands past the threshold", () => {
    const m = mount(OCEAN, { center: [1500, 1000], zoom: -2 });
    // the ocean's (500,500) is the isle's centre; ocean zoom 1 is past its entry
    m.glideTo(OCEAN, { center: [500, 500], zoom: 1 });
    expect(fake.flyTo).toHaveBeenCalledTimes(1);
    land();
    expect(m.onViewChange).not.toHaveBeenCalled();
  });

  // Leaflet's interrupts: a wheel's zoom calls `map._stop()` (the flight ends
  // with no zoomend) and fires its own zoomstart and zoomend; a drag also
  // stops it, and ends with a moveend only.
  const stopFlight = () => {
    landing = null;
  };
  const isleZoom = (zoom = 1.2) => act(() => fake.moveTo({ lat: 1500, lng: 500 }, zoom));

  it("a wheel that stops a glide zooms on its own, and that zoom hands off", () => {
    const m = mount(OCEAN, { center: [1500, 1000], zoom: -2 });
    m.glideTo(OCEAN, { center: [1500, 1000], zoom: 0 });
    fake.container.dispatchEvent(new Event("wheel"));
    now += 40; // Leaflet's wheel debounce
    stopFlight();
    isleZoom();
    expect(m.onViewChange).toHaveBeenCalledTimes(1);
    expect(m.onViewChange.mock.calls[0][0]).toEqual(ISLE);
    // nothing left armed: a camera the canvas applies later never hands off
    m.update(OCEAN, { center: [500, 500], zoom: 1.5 });
    expect(m.onViewChange).toHaveBeenCalledTimes(1);
  });

  it("a drag that stops a glide ends it with no handoff, and nothing sticks", () => {
    const m = mount(OCEAN, { center: [1500, 1000], zoom: -2 });
    m.glideTo(OCEAN, { center: [500, 500], zoom: 1 });
    fake.container.dispatchEvent(new Event("mousedown"));
    stopFlight();
    now += 300;
    act(() => {
      fake.center = { lat: 1400, lng: 600 };
      fake.zoom = 0.4;
      fake.fire("moveend");
    });
    expect(m.onViewChange).not.toHaveBeenCalled();
    // the flag is clear: the canvas's own camera doesn't hand off ...
    m.update(OCEAN, { center: [500, 500], zoom: 1.5 });
    expect(m.onViewChange).not.toHaveBeenCalled();
    // ... and the next user zoom does
    now += 300;
    fake.container.dispatchEvent(new Event("wheel"));
    isleZoom(2);
    expect(m.onViewChange).toHaveBeenCalledTimes(1);
    expect(m.onViewChange.mock.calls[0][0]).toEqual(ISLE);
  });

  it("a wheel in a glide's last moments still hands off once the glide lands", () => {
    const m = mount(OCEAN, { center: [1500, 1000], zoom: -2 });
    m.glideTo(OCEAN, { center: [1500, 1000], zoom: 0 });
    fake.container.dispatchEvent(new Event("wheel"));
    now += 10;
    land();
    expect(m.onViewChange).not.toHaveBeenCalled();
    now += 30;
    isleZoom();
    expect(m.onViewChange).toHaveBeenCalledTimes(1);
    expect(m.onViewChange.mock.calls[0][0]).toEqual(ISLE);
  });

  it("a click long before a glide lands doesn't make the landing a handoff", () => {
    const m = mount(OCEAN, { center: [1500, 1000], zoom: -2 });
    m.glideTo(OCEAN, { center: [500, 500], zoom: 1 });
    fake.container.dispatchEvent(new Event("mousedown"));
    now += 400;
    land();
    expect(m.onViewChange).not.toHaveBeenCalled();
    m.update(OCEAN, { center: [500, 500], zoom: 1.5 });
    expect(m.onViewChange).not.toHaveBeenCalled();
  });
});

describe("one wheel step, one handoff (P-06)", () => {
  // The ocean's (250,330) is the isle's (50,30), inside the cove's frame.
  const deepZoom = (input: string) => {
    const m = mount(OCEAN, { center: [250, 330], zoom: 0 });
    fake.container.dispatchEvent(new Event(input));
    act(() => fake.moveTo({ lat: 2000 - 330, lng: 250 }, 3.5));
    return m.onViewChange;
  };

  it("a wheel step past both thresholds enters the isle only", () => {
    const onViewChange = deepZoom("wheel");
    expect(onViewChange).toHaveBeenCalledTimes(1);
    expect(onViewChange.mock.calls[0][0]).toEqual(ISLE);
  });

  it("a keyboard zoom past both still chains to the cove (R-32 unchanged)", () => {
    const onViewChange = deepZoom("keydown");
    expect(onViewChange).toHaveBeenCalledTimes(1);
    expect(onViewChange.mock.calls[0][0]).toEqual(COVE);
  });
});
