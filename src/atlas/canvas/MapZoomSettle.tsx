import type { Map } from "leaflet";
import { useEffect, type MutableRefObject } from "react";
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
  /** A handoff entered this view key (`map:<id>`): settle once it is shown. */
  entered: string | null;
}

export const newSettleControl = (): SettleControl => ({ zoomedIn: null, entered: null });

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
 * wheel restarts it, and the user's input wins over a running slide.
 *
 * It never slides with the pointer over a child's frame: zooming at a frame
 * by a map's edge is how P-04 enters that child. The slide is the canvas's
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
  useEffect(() => {
    if (!node) return;
    const { width, height } = node.map;
    const ctl = control.current;
    const frames = node.children.map(childFrame).filter((f): f is Point[] => f !== null);
    let zooming = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let pending = false;
    /** The pointer's last position in the container, if it is over it. */
    let pointer: { x: number; y: number } | null = null;
    const box = map.getContainer();
    const dragging = () =>
      !!(map as unknown as { dragging?: { moving?: () => boolean } }).dragging?.moving?.();
    const overFrame = () => {
      if (!pointer || frames.length === 0) return false;
      const toLatLng_ = (map as Partial<Map>).containerPointToLatLng;
      if (!toLatLng_) return false;
      const p = fromLatLng(viewHeight, toLatLng_.call(map, [pointer.x, pointer.y]));
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
    const onWheel = (e: WheelEvent) => {
      track(e);
      if (pending) arm();
    };
    const track = (e: MouseEvent) => {
      if (!Number.isFinite(e.clientX) || !Number.isFinite(e.clientY)) return;
      const r = box.getBoundingClientRect();
      pointer = { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const onLeave = () => {
      pointer = null;
    };
    const onZoomStart = () => {
      zooming = true;
      disarm();
    };
    const onMoveEnd = () => {
      if (!(map as unknown as { _animatingZoom?: boolean })._animatingZoom) zooming = false;
    };
    const onZoomEnd = () => {
      zooming = false;
    };
    ctl.zoomedIn = arm;
    // A handoff into this map: settle once its camera is applied (CanvasCamera
    // runs first, see AtlasCanvas).
    if (ctl.entered === viewKey) {
      ctl.entered = null;
      arm();
    }
    map.on("zoomstart", onZoomStart);
    map.on("zoomend", onZoomEnd);
    map.on("moveend", onMoveEnd);
    map.on("dragstart", disarm);
    box.addEventListener("wheel", onWheel, { passive: true });
    box.addEventListener("pointermove", track, { passive: true });
    box.addEventListener("pointerleave", onLeave);
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
      box.removeEventListener("pointermove", track);
      box.removeEventListener("pointerleave", onLeave);
      box.removeEventListener("touchstart", disarm);
      box.removeEventListener("pointerdown", disarm);
    };
  }, [map, node, viewKey, viewHeight, reduceMotion, armed, control]);
  return null;
}
