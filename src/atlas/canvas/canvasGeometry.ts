// What the shared canvas draws where (R-31). Pure: no React, no Leaflet.
//
// Every view is a flat pixel space with a top-left origin: the ocean's pixels
// for the ocean view, a map's pixels for a map view. Leaflet's FlatCRS puts
// pixel (x, y) at lat = viewHeight - y, lng = x.

import type { MapDocument, OceanPlacement, Point } from "../content/schema";
import { frameOutline, mapToOcean, type MapTree, type MapTreeNode } from "../ocean/mapTree";

export interface Box {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export type LatLngTuple = [number, number];

/** A view pixel as a Leaflet [lat, lng]. */
export const toLatLng = (viewHeight: number, p: Point): LatLngTuple => [viewHeight - p[1], p[0]];

/** A Leaflet lat/lng as a view pixel. */
export const fromLatLng = (viewHeight: number, ll: { lat: number; lng: number }): Point => [
  ll.lng,
  viewHeight - ll.lat,
];

export function boxOf(points: readonly Point[]): Box | null {
  if (points.length === 0) return null;
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  return {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys),
  };
}

/** A box as Leaflet bounds in a view `viewHeight` tall. */
export function boxBounds(viewHeight: number, b: Box): [LatLngTuple, LatLngTuple] {
  return [
    [viewHeight - b.maxY, b.minX],
    [viewHeight - b.minY, b.maxX],
  ];
}

/** A top-level map's four corners on the ocean (TL, TR, BR, BL), turned about its centre. */
export function placementCorners(
  placement: OceanPlacement,
  map: Pick<MapDocument, "width" | "height">,
): Point[] {
  const { width: w, height: h } = map;
  const corners: Point[] = [
    [0, 0],
    [w, 0],
    [w, h],
    [0, h],
  ];
  return corners.map((c) => mapToOcean(placement, map, c));
}

/** The box around every top-level map on the ocean: what the ocean view fits on open. */
export function oceanFitBox(tree: MapTree): Box | null {
  return boxOf(
    tree.roots.flatMap((n) => (n.placement ? placementCorners(n.placement, n.map) : [])),
  );
}

/**
 * The SVG for one top-level map on the ocean: the `viewBox` (its bounding box
 * in ocean pixels), the rotation about the scaled map's centre, and each image
 * layer's rectangle in ocean pixels before that rotation.
 */
export interface OceanMapSvg {
  box: Box;
  rotation: number;
  centre: Point;
  layers: {
    id: string;
    src: string;
    x: number;
    y: number;
    w: number;
    h: number;
    opacity: number;
  }[];
}

export function oceanMapSvg(node: MapTreeNode): OceanMapSvg | null {
  const p = node.placement;
  if (!p) return null;
  const box = boxOf(placementCorners(p, node.map));
  if (!box) return null;
  const s = p.scale;
  return {
    box,
    rotation: p.rotation ?? 0,
    centre: [p.x + (node.map.width * s) / 2, p.y + (node.map.height * s) / 2],
    layers: [...node.map.layers]
      .sort((a, b) => a.zIndex - b.zIndex)
      .map((l) => ({
        id: l.id,
        src: l.src,
        x: p.x + l.x * s,
        y: p.y + l.y * s,
        w: l.width * s,
        h: l.height * s,
        opacity: l.opacity,
      })),
  };
}

/** A child's frame outline in its parent's pixels; null for a node with no usable frame. */
export function childFrame(node: MapTreeNode): Point[] | null {
  return node.map.frame ? frameOutline(node.map.frame) : null;
}
