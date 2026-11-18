/**
 * The shared canvas's feel (P-06): how far one wheel notch zooms, how long a
 * glide takes, and where a glide up the breadcrumb starts. Pure: no React,
 * no Leaflet map.
 *
 * Wheel. Leaflet turns a wheel event's pixels into its own "wheel px" by
 * dividing by a platform factor (`wheelPxFactor` in Leaflet's DomEvent: 3x the
 * device pixel ratio on a Mac, 2x elsewhere, 1x on Linux Chrome), then zooms
 * `4 log2(2 / (1 + e^-|d/4w|))` levels per batch, where w is
 * `wheelPxPerZoomLevel` (default 60). On a retina Mac a notch (deltaY 100) was
 * 100/6 wheel px, about 0.2 levels, so a level of the tree (about 2 zoom
 * levels on a laptop screen) took about 10 notches. The canvas sets w to
 * `WHEEL_PX_PER_LEVEL_AT_FACTOR_1 / factor`, which undoes the platform factor:
 * a 100 px notch zooms the same `ZOOM_PER_NOTCH` (about 0.48) everywhere, so a
 * level takes 4-5 notches, and on Windows it is close to Leaflet's default
 * (w 72 instead of 60). Trackpad scrolls and pinches (small pixel deltas,
 * batched every 40 ms) scale by the same ratio; Leaflet's curve still flattens
 * big batches (at most 4 levels a batch, about 1.3 for a 300 px flick).
 *
 * PLAYER-SAFE: import nothing editor- or viewer-only.
 */
import type { MutableRefObject } from "react";
import type { Map as LeafletMap } from "leaflet";
import type { Point } from "../content/schema";
import { toLatLng } from "./canvasGeometry";
import {
  childToParent,
  mapToOcean,
  oceanZoomOffset,
  zoomOffset,
  type MapTree,
} from "../ocean/mapTree";
import type { TreeView, ViewCamera } from "../ocean/zoomHandoff";

/** A mouse wheel notch in Chrome: 100 px, pixel mode. */
export const NOTCH_DELTA_Y = 100;

/** `wheelPxPerZoomLevel` for a platform factor of 1; the canvas divides by the real factor. */
export const WHEEL_PX_PER_LEVEL_AT_FACTOR_1 = 144;

/** How long a crumb click or Reset glides, in seconds (Leaflet's `duration`). */
export const GLIDE_SECONDS = 0.4;

/** Leaflet 1.9's `wheelPxFactor` (DomEvent.js), which it keeps private. */
export function leafletWheelPxFactor(
  browser: { linux?: boolean; chrome?: boolean; mac?: boolean },
  devicePixelRatio: number,
): number {
  if (browser.linux && browser.chrome) return devicePixelRatio;
  if (browser.mac) return devicePixelRatio * 3;
  return devicePixelRatio > 0 ? 2 * devicePixelRatio : 1;
}

/** The canvas's `wheelPxPerZoomLevel` for a platform factor. */
export function canvasWheelPxPerZoomLevel(factor: number): number {
  return WHEEL_PX_PER_LEVEL_AT_FACTOR_1 / (factor > 0 ? factor : 1);
}

/**
 * Leaflet's zoom for one wheel batch (ScrollWheelZoom `_performZoom`, zoomSnap
 * 0): `wheelPx` is the batch's summed Leaflet wheel delta.
 */
export function wheelBatchZoom(wheelPx: number, pxPerZoomLevel: number): number {
  const d2 = wheelPx / (pxPerZoomLevel * 4);
  const d3 = (4 * Math.log(2 / (1 + Math.exp(-Math.abs(d2))))) / Math.LN2;
  return wheelPx > 0 ? d3 : -d3;
}

/** The zoom one notch gives on the canvas, on any platform. */
export const ZOOM_PER_NOTCH = wheelBatchZoom(NOTCH_DELTA_Y, WHEEL_PX_PER_LEVEL_AT_FACTOR_1);

/**
 * The camera in `to` that shows the same ground as `camera` in `from`, when
 * `to` is an ancestor of `from` (a breadcrumb up the tree): `from` is mapped
 * up one level at a time, as a zoom hand-back does. Null when `to` isn't an
 * ancestor of `from`, or the tree can't map it.
 */
export function ancestorCamera(
  tree: MapTree,
  from: TreeView,
  camera: ViewCamera,
  to: TreeView,
): ViewCamera | null {
  if (from.kind === "ocean") return null;
  let node = tree.byId.get(from.mapId);
  let center: Point = camera.center;
  let zoom = camera.zoom;
  for (let i = 0; node && i < 64; i++) {
    const { map } = node;
    if (node.parentId !== null) {
      if (!map.frame) return null;
      center = childToParent(map.frame, map, center);
      zoom -= zoomOffset(map, map.frame);
      if (to.kind === "map" && to.mapId === node.parentId) return { center, zoom };
      node = tree.byId.get(node.parentId);
    } else {
      if (!tree.ocean || !node.placement || to.kind !== "ocean") return null;
      center = mapToOcean(node.placement, map, center);
      zoom -= oceanZoomOffset(map, node.placement);
      return { center, zoom };
    }
  }
  return null;
}

/** The glide's shared state (`CanvasGlide`). */
export interface GlideControl {
  /** This commit's request: glide, after cutting to `start` when set (a crumb up the tree). */
  request: { start: ViewCamera | null } | null;
  /** Set just around the fly call: the next zoomstart is the glide's (ZoomHandoff). */
  flying: boolean;
}

export const newGlideControl = (): GlideControl => ({ request: null, flying: false });

/** Takes this commit's glide request, if any. */
export function takeGlide(control: MutableRefObject<GlideControl> | undefined) {
  if (!control) return null;
  const r = control.current.request;
  control.current.request = null;
  return r;
}

/** Cuts to the request's start camera (if any), then runs `fly` marked as a glide. */
export function runGlide(
  map: Pick<LeafletMap, "setView">,
  control: MutableRefObject<GlideControl>,
  viewHeight: number,
  request: { start: ViewCamera | null },
  fly: () => void,
) {
  const { start } = request;
  if (start) map.setView(toLatLng(viewHeight, start.center), start.zoom, { animate: false });
  control.current.flying = true;
  try {
    fly();
  } finally {
    control.current.flying = false;
  }
}
