// The zoom handoff (R-32): when zooming moves the canvas from one view of the
// map tree to another. Pure: no React, no Leaflet.
//
// Views are the ocean (v2 only) or one map. A camera is a centre in the view's
// own pixels (top-left origin) and a Leaflet zoom (log2 of screen px per view
// px). A handoff keeps the same ground under the centre at the same screen
// scale, through R-30's transforms and zoom offsets; only the view changes.
//
// The rule, with M = HANDOFF_MARGIN:
// - Enter a child map when the zoom is at least its enter zoom and the centre
//   is inside its frame (rotated). The enter zoom is the child's `enterZoom`,
//   or, with none, the zoom at which the frame's shorter side spans the
//   viewport's shorter side ("fills the shorter side"). A top-level map is
//   entered from the ocean the same way, by the fill rule (the ocean has no
//   `enterZoom`). The viewer clamps a child's enter zoom to at least M above
//   where a zoom entry lands on its parent, so a zoom never skips a level.
// - Leave a map (to its parent, or to the ocean for a top-level map) when the
//   zoom drops below its leave zoom: `zoom.min`, or its fitted zoom when it has
//   none, lowered where needed so every way in lands at least M above it:
//     leave = min(zoom.min ?? fit, fit - M, enter landing - M)
//   where "enter landing" is the map's enter zoom moved into its own zoom.
//   The fitted zoom covers a click enter, which lands fitted; it is also never
//   above the fill-rule landing.
// - Hysteresis: a zoom enter lands at least M above the leave zoom, and a zoom
//   leave lands more than M below the enter zoom, so neither can flip back
//   until the user zooms M the other way. M is half a zoom level.
// - A v1 tree (no ocean) never leaves its top-level map.
// - A big gesture can cross several thresholds; the steps chain (ocean to a
//   grandchild in one pinch) and the result is always a view `nextView` then
//   leaves alone.

import type { Point } from "../content/schema";
import {
  childToParent,
  mapToOcean,
  oceanToMap,
  oceanZoomOffset,
  parentToChild,
  zoomOffset,
  type MapSize,
  type MapTree,
  type MapTreeNode,
} from "./mapTree";

/** What the canvas shows: the ocean or one map of the tree. */
export type TreeView = { kind: "ocean" } | { kind: "map"; mapId: string };

/** A camera in a view's own pixels and Leaflet zoom. */
export interface ViewCamera {
  center: Point;
  zoom: number;
}

/** The canvas's size on screen, in px. */
export interface Viewport {
  width: number;
  height: number;
}

export type HandoffResult =
  { kind: "stay" } | { kind: "handoff"; view: TreeView; camera: ViewCamera };

/** The hysteresis band, in zoom levels (log2): half a level. */
export const HANDOFF_MARGIN = 0.5;

/** Enough for any real tree's depth, twice over; a guard, never reached in practice. */
const MAX_STEPS = 32;

const STAY: HandoffResult = { kind: "stay" };

const finite = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);

/** The zoom that fits a `w` x `h` area whole in the viewport. */
function fitZoom(w: number, h: number, vp: Viewport): number {
  return Math.log2(Math.min(vp.width / w, vp.height / h));
}

/** The zoom at which a `w` x `h` area's shorter side spans the viewport's shorter side. */
function fillZoom(w: number, h: number, vp: Viewport): number {
  return Math.log2(Math.min(vp.width, vp.height) / Math.min(w, h));
}

/** A child's zoom minus its parent's zoom (or a top-level map's minus the ocean's). */
function offsetOf(node: MapTreeNode): number | null {
  if (node.parentId !== null) return node.map.frame ? zoomOffset(node.map, node.map.frame) : null;
  return node.placement ? oceanZoomOffset(node.map, node.placement) : null;
}

/** The authored (or fill-rule) enter zoom, before the viewer's clamp. */
function ownEnterZoom(node: MapTreeNode, vp: Viewport): number | null {
  const { map } = node;
  if (node.parentId !== null) {
    if (!map.frame) return null;
    if (finite(map.enterZoom)) return map.enterZoom;
    return fillZoom(map.frame.width, map.frame.height, vp);
  }
  if (!node.placement) return null;
  const s = node.placement.scale;
  return fillZoom(map.width * s, map.height * s, vp);
}

/**
 * The zoom, in the parent's (or the ocean's) zoom, at which the node is
 * entered. A child is never entered below M above where a zoom entry lands on
 * its parent: the fill landing depends on the screen, so an authored
 * `enterZoom` can sit at or below it on a large screen, and the zoom would
 * skip the parent.
 */
export function enterZoom(tree: MapTree, node: MapTreeNode, vp: Viewport): number | null {
  const own = ownEnterZoom(node, vp);
  if (own === null || node.parentId === null) return own;
  const parent = tree.byId.get(node.parentId);
  const landing = parent ? landingZoom(tree, parent, vp) : null;
  return landing === null ? own : Math.max(own, landing + HANDOFF_MARGIN);
}

/** Where a zoom entry lands on the node, in its own zoom. */
function landingZoom(tree: MapTree, node: MapTreeNode, vp: Viewport): number | null {
  const enter = enterZoom(tree, node, vp);
  const off = offsetOf(node);
  return enter === null || off === null ? null : enter + off;
}

/**
 * The zoom, in the map's own zoom, below which the canvas leaves it; -Infinity
 * when it can't be left (a v1 top-level map, or one with nowhere to go).
 */
export function leaveZoom(tree: MapTree, node: MapTreeNode, vp: Viewport): number {
  if (node.parentId === null && !tree.ocean) return -Infinity;
  const off = offsetOf(node);
  const enter = enterZoom(tree, node, vp);
  if (off === null || enter === null) return -Infinity;
  const fit = fitZoom(node.map.width, node.map.height, vp);
  const z = node.map.zoom;
  const authored = z && finite(z.min) ? z.min : fit;
  return Math.min(authored, fit - HANDOFF_MARGIN, enter + off - HANDOFF_MARGIN);
}

function inside(size: MapSize, p: Point): boolean {
  return p[0] >= 0 && p[1] >= 0 && p[0] <= size.width && p[1] <= size.height;
}

type Step = { view: TreeView; camera: ViewCamera };

function enterStep(
  tree: MapTree,
  node: MapTreeNode,
  camera: ViewCamera,
  vp: Viewport,
): Step | null {
  const enter = enterZoom(tree, node, vp);
  const off = offsetOf(node);
  if (enter === null || off === null || camera.zoom < enter) return null;
  const { map } = node;
  const center =
    node.parentId !== null
      ? parentToChild(map.frame!, map, camera.center)
      : oceanToMap(node.placement!, map, camera.center);
  if (!inside(map, center)) return null;
  return { view: { kind: "map", mapId: map.id }, camera: { center, zoom: camera.zoom + off } };
}

function step(tree: MapTree, view: TreeView, camera: ViewCamera, vp: Viewport): Step | null {
  if (view.kind === "ocean") {
    if (!tree.ocean) return null;
    for (const root of tree.roots) {
      const s = enterStep(tree, root, camera, vp);
      if (s) return s;
    }
    return null;
  }
  const node = tree.byId.get(view.mapId);
  if (!node) return null;
  if (camera.zoom < leaveZoom(tree, node, vp)) {
    const off = offsetOf(node)!;
    const zoom = camera.zoom - off;
    if (node.parentId !== null) {
      const center = childToParent(node.map.frame!, node.map, camera.center);
      return { view: { kind: "map", mapId: node.parentId }, camera: { center, zoom } };
    }
    const center = mapToOcean(node.placement!, node.map, camera.center);
    return { view: { kind: "ocean" }, camera: { center, zoom } };
  }
  for (const child of node.children) {
    const s = enterStep(tree, child, camera, vp);
    if (s) return s;
  }
  return null;
}

/**
 * Where a settled camera should be shown: "stay", or the view to hand over to
 * and its camera, showing the same ground. Never throws; a view the tree
 * can't show, a non-finite camera or an empty viewport stays.
 */
export function nextView(
  tree: MapTree,
  view: TreeView,
  camera: ViewCamera,
  viewport: Viewport,
): HandoffResult {
  if (
    !finite(camera.zoom) ||
    !finite(camera.center[0]) ||
    !finite(camera.center[1]) ||
    !finite(viewport.width) ||
    !finite(viewport.height) ||
    viewport.width <= 0 ||
    viewport.height <= 0
  ) {
    return STAY;
  }
  let cur: Step = { view, camera };
  let moved = false;
  for (let i = 0; i < MAX_STEPS; i++) {
    const s = step(tree, cur.view, cur.camera, viewport);
    if (!s) break;
    cur = s;
    moved = true;
  }
  return moved ? { kind: "handoff", view: cur.view, camera: cur.camera } : STAY;
}
