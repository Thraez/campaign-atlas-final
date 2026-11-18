/**
 * The soft handoff (P-05): at a zoom handoff the old view's pictures fade out
 * over the new view's (`HANDOFF_FADE_MS`) instead of a hard cut. With reduced
 * motion (calm mode or the OS setting) nothing is drawn: a plain cut, as
 * before.
 *
 * How: just before the caller swaps the view (`capture`, called by AtlasCanvas
 * from the handoff report), the canvas copies its image pane as it is on
 * screen: the same `<img>` and `<svg>` elements, already loaded, so the copy is
 * lossless. Once the new view is shown, the copy goes on the map as a layer in
 * the new view's own pixels (`ghostBox`: the ground the screen covers at the
 * handed-over camera), in its own pane above the pictures and below every
 * outline, label, pin and caller layer. Like an image overlay it follows pans,
 * zooms and Leaflet's zoom animation, so the old and new pictures stay on the
 * same ground for the whole fade. It holds fully shown until the new view's
 * pictures have loaded (at most `HANDOFF_LOAD_WAIT_MS`), then fades out and
 * is removed.
 *
 * Only ever one ghost: a new handoff, a view change that isn't the awaited
 * handoff, calm mode turning on, and unmounting each remove it at once.
 * Removal runs on timers, never on a transition event, so a fade can't stick.
 * The ghost takes no pointer events and fires no map events, so it can't
 * start a handoff of its own.
 *
 * PLAYER-SAFE: import nothing editor- or viewer-only. It copies only what the
 * canvas already shows.
 */
import { useEffect, useLayoutEffect, useRef, type MutableRefObject } from "react";
import L from "leaflet";
import { useMap } from "react-leaflet";
import { boxBounds } from "./canvasGeometry";
import { CANVAS_IMAGE_PANE } from "./CanvasLayers";
import { HANDOFF_FADE_MS, HANDOFF_LOAD_WAIT_MS, ghostBox, type GhostCamera } from "./handoffGhost";

/**
 * The ghost's pane. The app's stylesheet pins every Leaflet pane to
 * `z-index: 1 !important` (`src/index.css`), so panes stack in DOM order: the
 * ghost's goes straight after the pictures (tilePane), under the outlines,
 * labels and pins.
 */
export const HANDOFF_GHOST_PANE = "atlasHandoffGhost";
/** How long a copy waits for the caller to show the new view. */
const PENDING_TTL_MS = 1000;

/** What AtlasCanvas calls, just before it reports a handoff to the caller. */
export interface CrossfadeControl {
  capture(toViewKey: string, toViewHeight: number, camera: GhostCamera): void;
}

/** A still copy of a screen, placed on the map like an image overlay. */
class GhostLayer extends L.Layer {
  private mapRef: L.Map | null = null;
  constructor(
    readonly el: HTMLElement,
    private readonly inner: HTMLElement,
    private readonly bounds: L.LatLngBounds,
    private readonly shotWidth: number,
  ) {
    super({ pane: HANDOFF_GHOST_PANE });
  }
  onAdd(map: L.Map) {
    this.mapRef = map;
    map.getPane(HANDOFF_GHOST_PANE)?.appendChild(this.el);
    this.reset();
    return this;
  }
  onRemove() {
    this.el.remove();
    this.mapRef = null;
    return this;
  }
  getEvents() {
    return { zoom: this.reset, viewreset: this.reset, zoomanim: this.animateZoom };
  }
  private reset() {
    const map = this.mapRef;
    if (!map) return;
    const nw = map.latLngToLayerPoint(this.bounds.getNorthWest());
    const se = map.latLngToLayerPoint(this.bounds.getSouthEast());
    const w = se.x - nw.x;
    L.DomUtil.setPosition(this.el, nw);
    this.el.style.width = `${w}px`;
    this.el.style.height = `${se.y - nw.y}px`;
    this.inner.style.transform = `scale(${w / this.shotWidth})`;
  }
  // As Leaflet's ImageOverlay does: scale with the map's zoom animation.
  private animateZoom(ev: L.LeafletEvent) {
    const e = ev as L.ZoomAnimEvent;
    const map = this.mapRef as
      | (L.Map & {
          _latLngBoundsToNewLayerBounds?: (
            b: L.LatLngBounds,
            zoom: number,
            center: L.LatLng,
          ) => L.Bounds;
        })
      | null;
    if (!map?._latLngBoundsToNewLayerBounds) return;
    const scale = map.getZoomScale(e.zoom, map.getZoom());
    const offset = map._latLngBoundsToNewLayerBounds(this.bounds, e.zoom, e.center).min;
    if (offset) L.DomUtil.setTransform(this.el, offset, scale);
  }
}

/** A copy of what the image pane shows now, sized to the screen; null when there is nothing to copy. */
function snapshot(map: L.Map) {
  const pane = map.getPane(CANVAS_IMAGE_PANE);
  const mapPane = map.getPane("mapPane");
  if (!pane || !mapPane || pane.childElementCount === 0) return null;
  const size = map.getSize();
  if (!(size.x > 0 && size.y > 0)) return null;
  const copy = pane.cloneNode(true) as HTMLElement;
  copy.removeAttribute("class");
  // A copy only: no duplicate ids, and nothing that queries `data-*` (a map's
  // `data-canvas-map`) finds the ghost instead of the real layer.
  for (const node of [copy, ...copy.querySelectorAll("*")]) {
    for (const name of node.getAttributeNames()) {
      if (name === "id" || name.startsWith("data-")) node.removeAttribute(name);
    }
  }
  copy.style.position = "absolute";
  copy.style.left = "0";
  copy.style.top = "0";
  // The pane's children sit at layer points; the map pane's offset puts them on screen.
  const at = L.DomUtil.getPosition(mapPane);
  copy.style.transform = `translate(${at.x}px, ${at.y}px)`;
  const inner = document.createElement("div");
  Object.assign(inner.style, {
    position: "absolute",
    left: "0",
    top: "0",
    width: `${size.x}px`,
    height: `${size.y}px`,
    overflow: "hidden",
    transformOrigin: "0 0",
    opacity: "1",
  });
  inner.appendChild(copy);
  const el = document.createElement("div");
  el.setAttribute("data-handoff-ghost", "");
  el.setAttribute("aria-hidden", "true");
  el.className = "leaflet-zoom-animated";
  Object.assign(el.style, { position: "absolute", pointerEvents: "none" });
  el.appendChild(inner);
  return { el, inner, size };
}

/**
 * The new view's pictures that are still loading, each as the elements whose
 * `load` or `error` means it is done. An `<img>` says so itself (`complete`).
 * An SVG `<image>` (the ocean's maps) has no `complete` and may have loaded
 * from cache before anyone listened, so a probe `<img>` with the same address
 * asks the cache; whichever of the two finishes first counts.
 */
function loading(map: L.Map): EventTarget[][] {
  const pane = map.getPane(CANVAS_IMAGE_PANE);
  if (!pane) return [];
  const left: EventTarget[][] = [];
  for (const img of pane.querySelectorAll("img")) if (!img.complete) left.push([img]);
  for (const image of pane.querySelectorAll("image")) {
    const href = image.getAttribute("href") ?? image.getAttribute("xlink:href");
    if (!href) continue;
    const probe = new Image();
    probe.src = href;
    if (!probe.complete) left.push([image, probe]);
  }
  return left;
}

type Pending = {
  toViewKey: string;
  toViewHeight: number;
  camera: GhostCamera;
  shot: NonNullable<ReturnType<typeof snapshot>>;
};

export function HandoffCrossfade({
  viewKey,
  reduceMotion,
  control,
}: {
  viewKey: string;
  reduceMotion: boolean;
  control: MutableRefObject<CrossfadeControl | null>;
}) {
  const map = useMap();
  const pending = useRef<Pending | null>(null);
  // The ghost on the map and how to take it off (clears its timers too).
  const active = useRef<{ viewKey: string; stop: () => void } | null>(null);
  // Read by `capture`, which runs outside React (a zoomend). Kept current in
  // the commit itself (a layout effect; the lint rule forbids writing refs
  // during render), so no event can land between calm mode turning on and the
  // ref seeing it, as it could before a passive effect ran.
  const motion = useRef(!reduceMotion);
  useLayoutEffect(() => {
    motion.current = !reduceMotion;
  }, [reduceMotion]);
  // The unused-copy expiry; cleared on a new capture and on unmount.
  const expiry = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    control.current = {
      capture(toViewKey, toViewHeight, camera) {
        active.current?.stop();
        pending.current = null;
        if (expiry.current !== null) clearTimeout(expiry.current);
        expiry.current = null;
        if (!motion.current) return;
        const shot = snapshot(map);
        if (!shot) return;
        const p = { toViewKey, toViewHeight, camera, shot };
        pending.current = p;
        // A caller that never shows the new view: forget the copy.
        expiry.current = setTimeout(() => {
          expiry.current = null;
          if (pending.current === p) pending.current = null;
        }, PENDING_TTL_MS);
      },
    };
    return () => {
      control.current = null;
    };
  }, [map, control]);

  // Calm mode turning on ends a fade at once.
  useEffect(() => {
    if (!reduceMotion) return;
    pending.current = null;
    active.current?.stop();
  }, [reduceMotion]);

  // Unmounting the canvas takes the ghost with it.
  useEffect(
    () => () => {
      pending.current = null;
      if (expiry.current !== null) clearTimeout(expiry.current);
      expiry.current = null;
      active.current?.stop();
    },
    [],
  );

  // After the view swap (this effect runs after CanvasCamera's, which applies
  // the handed-over camera): put the ghost on the new view and fade it.
  useEffect(() => {
    if (active.current && active.current.viewKey !== viewKey) active.current.stop();
    const p = pending.current;
    pending.current = null;
    if (!p || p.toViewKey !== viewKey || !motion.current) return;

    const box = ghostBox(p.camera, p.shot.size);
    const layer = new GhostLayer(
      p.shot.el,
      p.shot.inner,
      L.latLngBounds(boxBounds(p.toViewHeight, box)),
      p.shot.size.x,
    );
    let pane = map.getPane(HANDOFF_GHOST_PANE);
    if (!pane) {
      pane = map.createPane(HANDOFF_GHOST_PANE);
      pane.style.pointerEvents = "none";
      // No z-index of its own: `index.css` pins every pane to z-index 1, so
      // panes stack in DOM order. Put the ghost's right after the pictures,
      // under the outlines, labels and pins.
      const pictures = map.getPane(CANVAS_IMAGE_PANE);
      if (pictures?.parentNode === pane.parentNode) pictures.after(pane);
    }
    map.addLayer(layer);

    const timers: ReturnType<typeof setTimeout>[] = [];
    const listeners: [EventTarget, () => void][] = [];
    let fading = false;
    const stop = () => {
      timers.forEach(clearTimeout);
      listeners.forEach(([target, f]) => {
        target.removeEventListener("load", f);
        target.removeEventListener("error", f);
      });
      map.removeLayer(layer);
      if (active.current?.stop === stop) active.current = null;
    };
    const fade = () => {
      if (fading) return;
      fading = true;
      const { inner } = p.shot;
      // Read layout once so the browser starts from the shown state.
      void inner.offsetWidth;
      inner.style.transition = `opacity ${HANDOFF_FADE_MS}ms ease-out`;
      inner.style.opacity = "0";
      timers.push(setTimeout(stop, HANDOFF_FADE_MS + 50));
    };
    // The new view's layers mount after this effect: look at its pictures
    // on the next task, and fade when they have loaded (or the wait runs out).
    timers.push(
      setTimeout(() => {
        const left = loading(map);
        if (left.length === 0) return fade();
        let n = left.length;
        for (const targets of left) {
          // One picture: the first load or error on any of its targets.
          let done = false;
          const one = () => {
            if (done) return;
            done = true;
            n -= 1;
            if (n === 0) fade();
          };
          for (const t of targets) {
            t.addEventListener("load", one);
            t.addEventListener("error", one);
            listeners.push([t, one]);
          }
        }
      }, 0),
    );
    timers.push(setTimeout(fade, HANDOFF_LOAD_WAIT_MS));
    active.current = { viewKey, stop };
  }, [map, viewKey]);

  return null;
}
