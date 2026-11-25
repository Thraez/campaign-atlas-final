import type { Map } from "leaflet";
import { useEffect, useRef, type MutableRefObject } from "react";
import { useMap } from "react-leaflet";
import type { Point } from "../content/schema";
import type { MapTreeNode } from "../ocean/mapTree";
import { childFrame, fromLatLng, toLatLng } from "./canvasGeometry";
import { GLIDE_SECONDS } from "./canvasMotion";
import { insidePolygon, settledCentre } from "./mapSettle";
import { SETTLE_IDLE_MS } from "./OceanZoomLimit";

/** Shared between AtlasCanvas, ZoomHandoff and MapZoomSettle. */
export interface SettleControl {
  /** Set by the mounted MapZoomSettle of a map view: a user zoom in settled. */
  zoomedIn: (() => void) | null;
  /**
   * A handoff entered this view key (`map:<id>`, any depth) at `at`
   * (performance.now()): settle once it is shown. Only good for
   * `ENTERED_WINDOW_MS`, so a handoff the caller ignored can't make a later
   * jump to that map slide.
   */
  entered: { key: string; at: number } | null;
}

export const newSettleControl = (): SettleControl => ({ zoomedIn: null, entered: null });

/** How long a handoff's `entered` mark waits for its view to be shown. */
export const ENTERED_WINDOW_MS = 1000;

/** Keys Leaflet's keyboard handler pans with: a pan in progress is the user's. */
const PAN_KEYS = new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]);

/**
 * The entered map stays on screen (Q-02). In a map view, a user zoom in that
 * settles (ZoomHandoff, no handoff) and a handoff that enters this map each
 * arm one timer. After `SETTLE_IDLE_MS` with no input the camera slides
 * (`GLIDE_SECONDS`; a jump in calm mode) to `settledCentre`: the shortest
 * slide that leaves no sea on a side the map could fill and puts the whole
 * map on screen where it is smaller than the screen.
 *
 * Why: a wheel zooms about the pointer, and an entry at a frame's edge (P-04's
 * anchor, or the centre beside the frame) leaves the pointer on the new map's
 * edge or over its sea, so every further notch grew the map away from it into
 * a corner (the sea landing). Like Q-01's ocean settle, it waits for the user
 * to stop: a zoom starting, a drag, a touch or a pointer press disarms it, a
 * wheel restarts it, an arrow-key pan disarms it, and the user's input wins
 * over a running slide.
 *
 * It never slides with the pointer over a child's frame: zooming at a frame
 * by a map's edge is how P-04 enters that child. The pointer's last position
 * outlives a view change, so this holds right after a handoff, before the
 * pointer moves again. The slide is the canvas's
 * own move: it clears the user-input flag (`armed`), so it never hands off.
 * Zoom out, fits, glides and drags are left as they are. The ocean has
 * `OceanZoomLimit` instead.
 */
export function MapZoomSettle({
  node,
  viewKey,
  viewHeight,
  reduceMotion = false,
  armed,
  control,
}: {
  /** The map view's node; null in the ocean view (nothing to do). */
  node: MapTreeNode | null;
  viewKey: string;
  viewHeight: number;
  reduceMotion?: boolean;
  armed?: MutableRefObject<boolean>;
  control: MutableRefObject<SettleControl>;
}) {
  const map = useMap();
  // The pointer's last position in the container (null when it left), kept
  // across views: one wheel notch that hands off sends no pointermove after.
  const pointer = useRef<{ x: number; y: number } | null>(null);
  useEffect(() => {
    const box = map.getContainer();
    const track = (e: MouseEvent) => {
      if (!Number.isFinite(e.clientX) || !Number.isFinite(e.clientY)) return;
      const r = box.getBoundingClientRect();
      pointer.current = { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const leave = () => {
      pointer.current = null;
    };
    const opts = { capture: true, passive: true } as const;
    box.addEventListener("pointermove", track, opts);
    box.addEventListener("wheel", track, opts);
    box.addEventListener("pointerleave", leave);
    return () => {
      box.removeEventListener("pointermove", track, opts);
      box.removeEventListener("wheel", track, opts);
      box.removeEventListener("pointerleave", leave);
    };
  }, [map]);

  useEffect(() => {
    if (!node) return;
    const { width, height } = node.map;
    const ctl = control.current;
    const frames = node.children.map(childFrame).filter((f): f is Point[] => f !== null);
    let zooming = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let pending = false;
    const box = map.getContainer();
    const dragging = () =>
      !!(map as unknown as { dragging?: { moving?: () => boolean } }).dragging?.moving?.();
    const overFrame = () => {
      const at = pointer.current;
      if (!at || frames.length === 0) return false;
      const toLatLng_ = (map as Partial<Map>).containerPointToLatLng;
      if (!toLatLng_) return false;
      const p = fromLatLng(viewHeight, toLatLng_.call(map, [at.x, at.y]));
      return frames.some((f) => insidePolygon(p, f));
    };
    const disarm = () => {
      pending = false;
      clearTimeout(timer);
    };
    const fire = () => {
      pending = false;
      if (zooming || dragging() || overFrame()) return;
      const c = fromLatLng(viewHeight, map.getCenter());
      const to = settledCentre(c, map.getZoom(), width, height, map.getSize());
      if (!to) return;
      if (armed) armed.current = false;
      map.panTo(toLatLng(viewHeight, to), { animate: !reduceMotion, duration: GLIDE_SECONDS });
    };
    const arm = () => {
      disarm();
      pending = true;
      timer = setTimeout(fire, SETTLE_IDLE_MS);
    };
    const onWheel = () => {
      if (pending) arm();
    };
    const onKey = (e: KeyboardEvent) => {
      if (PAN_KEYS.has(e.key)) disarm();
    };
    const onZoomStart = () => {
      zooming = true;
      disarm();
    };
    // Some zooms end with a moveend only (a calm-mode pinch, a glide stopped
    // by a drag): no zoom animation running means none is (as OceanZoomLimit).
    const onMoveEnd = () => {
      if (!(map as unknown as { _animatingZoom?: boolean })._animatingZoom) zooming = false;
    };
    const onZoomEnd = () => {
      zooming = false;
    };
    ctl.zoomedIn = arm;
    // A handoff into this map: settle once its camera is applied (CanvasCamera
    // runs first, see AtlasCanvas). A mark for this view is used up; a stale
    // one (the caller ignored that handoff) is dropped.
    const entered = ctl.entered;
    const fresh = !!entered && performance.now() - entered.at <= ENTERED_WINDOW_MS;
    if (entered && (entered.key === viewKey || !fresh)) ctl.entered = null;
    if (fresh && entered?.key === viewKey) arm();
    map.on("zoomstart", onZoomStart);
    map.on("zoomend", onZoomEnd);
    map.on("moveend", onMoveEnd);
    map.on("dragstart", disarm);
    box.addEventListener("wheel", onWheel, { passive: true });
    box.addEventListener("keydown", onKey);
    box.addEventListener("touchstart", disarm, { passive: true });
    box.addEventListener("pointerdown", disarm);
    return () => {
      disarm();
      if (ctl.zoomedIn === arm) ctl.zoomedIn = null;
      map.off("zoomstart", onZoomStart);
      map.off("zoomend", onZoomEnd);
      map.off("moveend", onMoveEnd);
      map.off("dragstart", disarm);
      box.removeEventListener("wheel", onWheel);
      box.removeEventListener("keydown", onKey);
      box.removeEventListener("touchstart", disarm);
      box.removeEventListener("pointerdown", disarm);
    };
  }, [map, node, viewKey, viewHeight, reduceMotion, armed, control]);
  return null;
}
