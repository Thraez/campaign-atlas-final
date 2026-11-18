/**
 * P-05, the soft handoff's ghost on a fake map with real panes: a handoff
 * leaves one copy of the old pictures on the new view, which holds while the
 * new pictures load and then fades out and goes; reduced motion (calm mode or
 * the OS setting) is a plain cut with no copy; a second handoff, a view change
 * that isn't the handoff, calm mode turning on and unmounting all take the
 * ghost off at once, so there are never two pictures or a stuck fade.
 */
import { act, cleanup, render } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type L from "leaflet";

type Handler = (e?: unknown) => void;

function makeMap() {
  const container = document.createElement("div");
  const mapPane = document.createElement("div");
  const tilePane = document.createElement("div");
  const overlayPane = document.createElement("div");
  mapPane.append(tilePane, overlayPane);
  container.appendChild(mapPane);
  const panes: Record<string, HTMLElement> = { mapPane, tilePane, overlayPane };
  const handlers = new Map<string, Set<Handler>>();
  const layers = new Set<L.Layer>();
  // Like Leaflet's addLayer: a layer's getEvents() are bound to it while it is on the map.
  const layerEvents = new Map<L.Layer, [string, Handler][]>();
  const map = {
    container,
    panes,
    layers,
    fire(ev: string, e?: unknown) {
      for (const h of [...(handlers.get(ev) ?? [])]) h(e);
    },
    getContainer: () => container,
    getPane: (name: string) => panes[name],
    createPane: (name: string) => {
      const p = document.createElement("div");
      mapPane.appendChild(p);
      panes[name] = p;
      return p;
    },
    getSize: () => ({ x: 800, y: 600 }),
    getZoom: () => 0,
    getZoomScale: (to: number, from: number) => 2 ** (to - from),
    // Zoom 0 and a view-pixel origin: layer px = (lng, -lat).
    latLngToLayerPoint: (ll: { lat: number; lng: number }) => ({ x: ll.lng, y: -ll.lat }),
    // Leaflet's private helper ImageOverlay uses for its zoom animation.
    _latLngBoundsToNewLayerBounds: () => ({ min: { x: -50, y: -70 } }),
    on(ev: string, h: Handler) {
      if (!handlers.has(ev)) handlers.set(ev, new Set());
      handlers.get(ev)!.add(h);
    },
    off(ev: string, h: Handler) {
      handlers.get(ev)?.delete(h);
    },
    addLayer(l: L.Layer) {
      layers.add(l);
      l.onAdd(map as unknown as L.Map);
      const evs = Object.entries(l.getEvents?.() ?? {}).map(
        ([ev, f]) => [ev, (f as Handler).bind(l)] as [string, Handler],
      );
      evs.forEach(([ev, h]) => map.on(ev, h));
      layerEvents.set(l, evs);
      return map;
    },
    removeLayer(l: L.Layer) {
      if (!layers.delete(l)) return map;
      layerEvents.get(l)?.forEach(([ev, h]) => map.off(ev, h));
      layerEvents.delete(l);
      l.onRemove(map as unknown as L.Map);
      return map;
    },
  };
  return map;
}

let fake = makeMap();

vi.mock("react-leaflet", () => ({ useMap: () => fake }));

const { HandoffCrossfade, HANDOFF_GHOST_PANE } = await import("@/atlas/canvas/HandoffCrossfade");
const { HANDOFF_FADE_MS, HANDOFF_LOAD_WAIT_MS } = await import("@/atlas/canvas/handoffGhost");
type Control = import("@/atlas/canvas/HandoffCrossfade").CrossfadeControl;

const CAM = { center: [300, 200] as [number, number], zoom: 0 };

/** The old view's pictures, as Leaflet places them in the image pane. */
function showPictures(src: string, complete = true) {
  fake.panes.tilePane.replaceChildren();
  const img = document.createElement("img");
  img.src = src;
  Object.defineProperty(img, "complete", { value: complete, configurable: true });
  fake.panes.tilePane.appendChild(img);
  return img;
}

/** The ocean's pictures: SVG <image> elements, which have no `complete`. */
function showSvgPictures(href: string) {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  const image = document.createElementNS(ns, "image");
  image.setAttribute("href", href);
  svg.appendChild(image);
  fake.panes.tilePane.replaceChildren(svg);
  return image;
}

function mount(viewKey: string, reduceMotion = false) {
  const control = createRef<Control | null>() as React.MutableRefObject<Control | null>;
  const el = (k: string, rm: boolean) => (
    <HandoffCrossfade viewKey={k} reduceMotion={rm} control={control} />
  );
  const r = render(el(viewKey, reduceMotion));
  return {
    control,
    rerender: (k: string, rm = reduceMotion) => act(() => r.rerender(el(k, rm))),
    unmount: () => r.unmount(),
  };
}

const ghosts = () => fake.container.querySelectorAll("[data-handoff-ghost]");
const ghostOpacity = () =>
  (ghosts()[0]?.firstElementChild as HTMLElement | undefined)?.style.opacity;

beforeEach(() => {
  vi.useFakeTimers();
  fake = makeMap();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("HandoffCrossfade (P-05)", () => {
  it("puts one copy of the old pictures on the new view, fades it, then removes it", () => {
    const c = mount("map:isle");
    showPictures("isle.png");
    c.control.current!.capture("map:cove", 300, CAM);
    // The new view's pictures replace the old ones in the image pane.
    showPictures("cove.png");
    c.rerender("map:cove");
    expect(ghosts()).toHaveLength(1);
    expect(fake.panes[HANDOFF_GHOST_PANE].contains(ghosts()[0])).toBe(true);
    // Panes stack in DOM order (the app pins them all to z-index 1): the
    // ghost's sits right after the pictures, under outlines and labels.
    expect(fake.panes.tilePane.nextElementSibling).toBe(fake.panes[HANDOFF_GHOST_PANE]);
    expect(ghosts()[0].querySelector("img")?.getAttribute("src")).toBe("isle.png");
    expect(ghostOpacity()).toBe("1");
    act(() => vi.advanceTimersByTime(0));
    expect(ghostOpacity()).toBe("0");
    act(() => vi.advanceTimersByTime(HANDOFF_FADE_MS + 60));
    expect(ghosts()).toHaveLength(0);
    expect(fake.layers.size).toBe(0);
  });

  it("places the copy on the new view's ground: the screen at the handed-over camera", () => {
    const c = mount("map:isle");
    showPictures("isle.png");
    // 800x600 screen at zoom 0 around (300, 200): view px (-100,-100)..(700,500).
    c.control.current!.capture("map:cove", 300, CAM);
    c.rerender("map:cove");
    const g = ghosts()[0] as HTMLElement;
    expect(g.style.width).toBe("800px");
    expect(g.style.height).toBe("600px");
    // NW corner: view (-100,-100) in a 300-tall view is lat 400, lng -100 -> layer (-100, -400).
    // Leaflet uses left/top where the browser has no 3D transforms (jsdom).
    const pos = g.style.transform || `${g.style.left} ${g.style.top}`;
    expect(pos).toMatch(/-100px,? -400px/);
  });

  it("holds the copy while the new picture loads, then fades", () => {
    const c = mount("map:isle");
    showPictures("isle.png");
    c.control.current!.capture("map:cove", 300, CAM);
    const img = showPictures("cove.png", false);
    c.rerender("map:cove");
    act(() => vi.advanceTimersByTime(50));
    expect(ghostOpacity()).toBe("1");
    act(() => {
      img.dispatchEvent(new Event("load"));
    });
    expect(ghostOpacity()).toBe("0");
    act(() => vi.advanceTimersByTime(HANDOFF_FADE_MS + 60));
    expect(ghosts()).toHaveLength(0);
  });

  it("fades anyway when the new picture never loads", () => {
    const c = mount("map:isle");
    showPictures("isle.png");
    c.control.current!.capture("map:cove", 300, CAM);
    showPictures("cove.png", false);
    c.rerender("map:cove");
    act(() => vi.advanceTimersByTime(HANDOFF_LOAD_WAIT_MS));
    expect(ghostOpacity()).toBe("0");
    act(() => vi.advanceTimersByTime(HANDOFF_FADE_MS + 60));
    expect(ghosts()).toHaveLength(0);
  });

  it("with reduced motion it is a plain cut: no copy at all", () => {
    const c = mount("map:isle", true);
    showPictures("isle.png");
    c.control.current!.capture("map:cove", 300, CAM);
    c.rerender("map:cove");
    expect(ghosts()).toHaveLength(0);
    expect(fake.layers.size).toBe(0);
  });

  it("calm mode turning on mid-fade removes the copy at once", () => {
    const c = mount("map:isle");
    showPictures("isle.png");
    c.control.current!.capture("map:cove", 300, CAM);
    c.rerender("map:cove");
    expect(ghosts()).toHaveLength(1);
    c.rerender("map:cove", true);
    expect(ghosts()).toHaveLength(0);
  });

  it("a quick zoom back out mid-fade leaves only the newest copy", () => {
    const c = mount("map:isle");
    showPictures("isle.png");
    c.control.current!.capture("map:cove", 300, CAM);
    showPictures("cove.png");
    c.rerender("map:cove");
    act(() => vi.advanceTimersByTime(100));
    c.control.current!.capture("map:isle", 400, CAM);
    // The old ghost is gone the moment the second handoff is taken.
    expect(ghosts()).toHaveLength(0);
    showPictures("isle.png");
    c.rerender("map:isle");
    expect(ghosts()).toHaveLength(1);
    expect(ghosts()[0].querySelector("img")?.getAttribute("src")).toBe("cove.png");
    act(() => vi.advanceTimersByTime(HANDOFF_FADE_MS + 60));
    expect(ghosts()).toHaveLength(0);
    expect(fake.layers.size).toBe(0);
  });

  it("a view change that is not the awaited handoff shows no copy and removes the old one", () => {
    const c = mount("map:isle");
    showPictures("isle.png");
    c.control.current!.capture("map:cove", 300, CAM);
    c.rerender("map:cove");
    expect(ghosts()).toHaveLength(1);
    // A crumb click to the ocean mid-fade.
    c.rerender("ocean");
    expect(ghosts()).toHaveLength(0);
    // A copy the caller never showed is not put on a later view.
    c.control.current!.capture("map:cove", 300, CAM);
    c.rerender("map:isle");
    expect(ghosts()).toHaveLength(0);
  });

  it("a copy the caller never shows is forgotten, not put on a later visit", () => {
    const c = mount("map:isle");
    showPictures("isle.png");
    c.control.current!.capture("map:cove", 300, CAM);
    act(() => vi.advanceTimersByTime(2000));
    c.rerender("map:cove");
    expect(ghosts()).toHaveLength(0);
  });

  it("nothing to copy (an empty image pane) is a plain cut", () => {
    const c = mount("map:isle");
    c.control.current!.capture("map:cove", 300, CAM);
    c.rerender("map:cove");
    expect(ghosts()).toHaveLength(0);
  });

  it("unmounting mid-fade removes the copy", () => {
    const c = mount("map:isle");
    showPictures("isle.png");
    c.control.current!.capture("map:cove", 300, CAM);
    c.rerender("map:cove");
    expect(ghosts()).toHaveLength(1);
    c.unmount();
    expect(ghosts()).toHaveLength(0);
    expect(fake.layers.size).toBe(0);
  });

  it("holds the copy while the new view's SVG <image> loads (the ocean's maps), then fades", () => {
    const c = mount("map:isle");
    showPictures("isle.png");
    c.control.current!.capture("ocean", 2000, CAM);
    const image = showSvgPictures("isle.png");
    c.rerender("ocean");
    act(() => vi.advanceTimersByTime(50));
    expect(ghostOpacity()).toBe("1");
    act(() => {
      image.dispatchEvent(new Event("load"));
    });
    expect(ghostOpacity()).toBe("0");
    act(() => vi.advanceTimersByTime(HANDOFF_FADE_MS + 60));
    expect(ghosts()).toHaveLength(0);
  });

  it("an SVG <image> already in the cache does not hold the copy", () => {
    // The probe <img> a cached picture gets is complete at once.
    vi.stubGlobal(
      "Image",
      class {
        src = "";
        complete = true;
      },
    );
    try {
      const c = mount("map:isle");
      showPictures("isle.png");
      c.control.current!.capture("ocean", 2000, CAM);
      showSvgPictures("isle.png");
      c.rerender("ocean");
      act(() => vi.advanceTimersByTime(0));
      expect(ghostOpacity()).toBe("0");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("an SVG <image> that never loads fades after the wait", () => {
    const c = mount("map:isle");
    showPictures("isle.png");
    c.control.current!.capture("ocean", 2000, CAM);
    showSvgPictures("isle.png");
    c.rerender("ocean");
    act(() => vi.advanceTimersByTime(HANDOFF_LOAD_WAIT_MS - 1));
    expect(ghostOpacity()).toBe("1");
    act(() => vi.advanceTimersByTime(1));
    expect(ghostOpacity()).toBe("0");
  });

  it("the ghost takes no pointer events, and neither does its pane", () => {
    const c = mount("map:isle");
    showPictures("isle.png");
    c.control.current!.capture("map:cove", 300, CAM);
    c.rerender("map:cove");
    expect((ghosts()[0] as HTMLElement).style.pointerEvents).toBe("none");
    expect(fake.panes[HANDOFF_GHOST_PANE].style.pointerEvents).toBe("none");
    // No z-index of its own: panes stack in DOM order (index.css).
    expect(fake.panes[HANDOFF_GHOST_PANE].style.zIndex).toBe("");
  });

  it("the copy carries no ids or data-* attributes of the real layers", () => {
    const c = mount("map:isle");
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.id = "isle-frame";
    svg.setAttribute("data-canvas-map", "isle");
    svg.appendChild(document.createElementNS("http://www.w3.org/2000/svg", "image"));
    fake.panes.tilePane.replaceChildren(svg);
    c.control.current!.capture("map:cove", 300, CAM);
    c.rerender("map:cove");
    const g = ghosts()[0];
    expect(g.querySelector("svg")).not.toBeNull();
    expect(g.querySelector("[id]")).toBeNull();
    expect(g.querySelector("[data-canvas-map]")).toBeNull();
    expect(fake.container.querySelectorAll("[data-canvas-map]")).toHaveLength(1);
  });

  it("follows Leaflet's zoom animation mid-fade, like an image overlay", () => {
    const c = mount("map:isle");
    showPictures("isle.png");
    c.control.current!.capture("map:cove", 300, CAM);
    c.rerender("map:cove");
    act(() => vi.advanceTimersByTime(100)); // mid-fade
    expect(ghostOpacity()).toBe("0");
    expect(ghosts()).toHaveLength(1);
    act(() => fake.fire("zoomanim", { zoom: 1, center: { lat: 0, lng: 0 } }));
    const g = ghosts()[0] as HTMLElement;
    expect(g.style.transform).toMatch(/-50px, ?-70px/);
    expect(g.style.transform).toContain("scale(2)");
    // The fade still ends and the layer's listeners go with it.
    act(() => vi.advanceTimersByTime(HANDOFF_FADE_MS));
    expect(ghosts()).toHaveLength(0);
    act(() => fake.fire("zoomanim", { zoom: 2, center: { lat: 0, lng: 0 } }));
    expect(fake.layers.size).toBe(0);
  });

  it("unmounting clears the unused copy's expiry timer", () => {
    const c = mount("map:isle");
    showPictures("isle.png");
    c.control.current!.capture("map:cove", 300, CAM);
    expect(vi.getTimerCount()).toBe(1);
    c.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
