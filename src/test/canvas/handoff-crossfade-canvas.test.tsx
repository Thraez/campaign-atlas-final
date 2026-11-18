/**
 * P-05 through AtlasCanvas: the soft handoff's copy is taken before the caller
 * hears the handoff (so it is the old view's pictures, whatever the caller
 * swaps in), a copy that fails never stops the handoff (R-32: it is a plain
 * cut), and the real reduce-motion switch (calm mode or the OS setting, not a
 * mock) keeps it a plain cut with no ghost.
 */
import type React from "react";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type L from "leaflet";
import type { AtlasProject } from "@/atlas/content/schema";

type LL = { lat: number; lng: number };
type Handler = () => void;

function makeFake() {
  const container = document.createElement("div");
  const mapPane = document.createElement("div");
  const tilePane = document.createElement("div");
  const overlayPane = document.createElement("div");
  mapPane.append(tilePane, overlayPane);
  container.appendChild(mapPane);
  const panes: Record<string, HTMLElement> = { mapPane, tilePane, overlayPane };
  const handlers = new Map<string, Set<Handler>>();
  const layers = new Set<L.Layer>();
  const fake = {
    container,
    panes,
    layers,
    /** Set to make reading the picture pane throw (a broken copy). */
    paneThrows: false,
    center: { lat: 0, lng: 0 } as LL,
    zoom: 0,
    options: { zoomSnap: 1, minZoom: -6 },
    _animatingZoom: false,
    on(ev: string, h: Handler) {
      if (!handlers.has(ev)) handlers.set(ev, new Set());
      handlers.get(ev)!.add(h);
    },
    off(ev: string, h?: Handler) {
      if (h) handlers.get(ev)?.delete(h);
      else handlers.delete(ev);
    },
    fire(ev: string) {
      for (const h of [...(handlers.get(ev) ?? [])]) h();
    },
    getSize: () => ({ x: 800, y: 600 }),
    getCenter: () => fake.center,
    getZoom: () => fake.zoom,
    getMinZoom: () => fake.options.minZoom,
    getMaxZoom: () => 4,
    getZoomScale: (to: number, from: number) => 2 ** (to - from),
    latLngToLayerPoint: (ll: LL) => ({ x: ll.lng, y: -ll.lat }),
    moveTo(center: LL, zoom: number) {
      const zoomed = zoom !== fake.zoom;
      if (zoomed) fake.fire("zoomstart");
      fake.center = center;
      fake.zoom = zoom;
      if (zoomed) fake.fire("zoomend");
      fake.fire("moveend");
    },
    setMinZoom: vi.fn(),
    setZoom: vi.fn(),
    invalidateSize: vi.fn(),
    getContainer: () => container,
    getPane(name: string): HTMLElement | undefined {
      if (fake.paneThrows && name === "tilePane") throw new Error("pane gone");
      return panes[name];
    },
    createPane(name: string) {
      const p = document.createElement("div");
      mapPane.appendChild(p);
      panes[name] = p;
      return p;
    },
    addLayer(l: L.Layer) {
      layers.add(l);
      l.onAdd(fake as unknown as L.Map);
      return fake;
    },
    removeLayer(l: L.Layer) {
      if (layers.delete(l)) l.onRemove(fake as unknown as L.Map);
      return fake;
    },
    fitBounds: vi.fn((b: [[number, number], [number, number]]) => {
      fake.moveTo({ lat: (b[0][0] + b[1][0]) / 2, lng: (b[0][1] + b[1][1]) / 2 }, -1);
    }),
    setView: vi.fn((c: [number, number], z: number) => {
      fake.moveTo({ lat: c[0], lng: c[1] }, Math.max(z, fake.options.minZoom));
    }),
  };
  return fake;
}

let fake = makeFake();

vi.mock("react-leaflet", async () => {
  const { makeReactLeafletModule } = await import("../helpers/reactLeafletMock");
  const SVGOverlay = ({ children }: { children?: React.ReactNode }) => <svg>{children}</svg>;
  return { ...makeReactLeafletModule(), SVGOverlay, useMap: () => fake };
});

// The real reduce-motion switch, not a mock.
const { setCalmMode, _resetCalmModeForTests } = await import("@/hooks/use-reduce-motion");
const { buildMapTree } = await import("@/atlas/ocean/mapTree");
const { AtlasCanvas } = await import("@/atlas/canvas/AtlasCanvas");
const { HANDOFF_GHOST_PANE } = await import("@/atlas/canvas/HandoffCrossfade");
type Camera = import("@/atlas/canvas/AtlasCanvas").CanvasCamera;
type View = import("@/atlas/canvas/AtlasCanvas").CanvasView;

// A 3000x2000 ocean with one 600x400 map at (200,300), scale 1 (as canvas-camera.test.tsx).
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

/** What the picture pane shows, as Leaflet places it. */
function showPictures(src: string) {
  const img = document.createElement("img");
  img.src = src;
  Object.defineProperty(img, "complete", { value: true, configurable: true });
  fake.panes.tilePane.replaceChildren(img);
}

/** The ocean view, with a caller that shows whatever view the canvas hands off to. */
function mountOcean(onHandoff?: (v: View, c: Camera) => void) {
  const onViewChange = vi.fn((v: View, c: Camera) => {
    onHandoff?.(v, c);
    act(() => r.rerender(el(v, c)));
  });
  const el = (v: View, c: Camera) => (
    <AtlasCanvas tree={tree} view={v} camera={c} onViewChange={onViewChange} />
  );
  const r = render(el(OCEAN, "fit"));
  return { onViewChange };
}

/** A user wheel zoom onto the isle's centre, past its enter threshold. */
function wheelIntoIsle() {
  fake.container.dispatchEvent(new Event("wheel"));
  fake.fire("zoomstart");
  fake.center = { lat: 2000 - 500, lng: 500 };
  fake.zoom = 1;
  act(() => fake.fire("zoomend"));
}

const ghosts = () => fake.container.querySelectorAll("[data-handoff-ghost]");

let clock: { mockRestore: () => void } | null = null;
const realMatchMedia = window.matchMedia;

beforeEach(() => {
  fake = makeFake();
  clock = vi.spyOn(performance, "now").mockImplementation(() => 1000);
  _resetCalmModeForTests();
});
afterEach(() => {
  cleanup();
  clock?.mockRestore();
  window.matchMedia = realMatchMedia;
  _resetCalmModeForTests();
});

describe("AtlasCanvas soft handoff (P-05)", () => {
  it("copies the old view's pictures before the caller hears the handoff", () => {
    showPictures("ocean-isle.png");
    // The caller swaps the pictures as soon as it hears the handoff.
    const m = mountOcean(() => showPictures("isle.png"));
    wheelIntoIsle();
    expect(m.onViewChange).toHaveBeenCalledTimes(1);
    expect(m.onViewChange.mock.calls[0][0]).toEqual(ISLE);
    expect(ghosts()).toHaveLength(1);
    expect(ghosts()[0].querySelector("img")?.getAttribute("src")).toBe("ocean-isle.png");
    // Under every outline, label and pin, and never in the way of the pointer.
    expect((ghosts()[0] as HTMLElement).style.pointerEvents).toBe("none");
    expect(fake.panes.tilePane.nextElementSibling).toBe(fake.panes[HANDOFF_GHOST_PANE]);
  });

  it("a copy that throws still hands off: a plain cut", () => {
    showPictures("ocean-isle.png");
    const m = mountOcean();
    fake.paneThrows = true;
    wheelIntoIsle();
    expect(m.onViewChange).toHaveBeenCalledTimes(1);
    expect(m.onViewChange.mock.calls[0][0]).toEqual(ISLE);
    expect(ghosts()).toHaveLength(0);
    expect(fake.layers.size).toBe(0);
  });

  it("calm mode (the real switch) is a plain cut: the handoff happens, no ghost", () => {
    setCalmMode(true);
    showPictures("ocean-isle.png");
    const m = mountOcean();
    wheelIntoIsle();
    expect(m.onViewChange).toHaveBeenCalledTimes(1);
    expect(ghosts()).toHaveLength(0);
    expect(fake.panes[HANDOFF_GHOST_PANE]).toBeUndefined();
  });

  it("the OS's reduced-motion setting is a plain cut too", () => {
    window.matchMedia = ((query: string) => ({
      ...realMatchMedia(query),
      matches: query.includes("reduce"),
    })) as typeof window.matchMedia;
    showPictures("ocean-isle.png");
    const m = mountOcean();
    wheelIntoIsle();
    expect(m.onViewChange).toHaveBeenCalledTimes(1);
    expect(ghosts()).toHaveLength(0);
  });

  it("turning calm mode on mid-fade takes the ghost off", () => {
    showPictures("ocean-isle.png");
    mountOcean();
    wheelIntoIsle();
    expect(ghosts()).toHaveLength(1);
    act(() => setCalmMode(true));
    expect(ghosts()).toHaveLength(0);
    expect(fake.layers.size).toBe(0);
  });
});
