// The map tree and its geometry (R-30). Pure: no React, no Leaflet.
//
// A schema v2 atlas.json has an ocean, top-level maps placed on it (`onOcean`),
// and child maps that sit inside a parent through a `frame`. This module turns
// that into one tree and the maths to move a point or a camera between a child,
// its parent and the ocean. Phase 3's canvas, zoom handoff and viewer share it.
//
// Rotation, for frames and ocean placements alike, is in degrees, clockwise on
// screen, about the centre of the (scaled) rectangle. ADR-0003 leaves the pivot
// open; the centre is the provisional call (docs R-30), and the resolver keeps
// testing both pivots.

import { frameQuads } from "../content/resolveCampaign";
import type { AtlasProject, MapDocument, MapFrame, OceanPlacement, Point } from "../content/schema";

/** A map's pixel size: all the geometry needs of a child or a top-level map. */
export type MapSize = Pick<MapDocument, "width" | "height">;

export interface MapTreeOcean {
  width: number;
  height: number;
  sea: string;
}

export interface MapTreeNode {
  map: MapDocument;
  /** Parent map id; null for a top-level map. */
  parentId: string | null;
  /** v2 top-level maps only: where the map sits on the ocean. */
  placement: OceanPlacement | null;
  /** Child maps, in `project.maps` order. */
  children: MapTreeNode[];
}

export interface MapTreeWarning {
  mapId: string;
  kind: "aspect-mismatch";
  message: string;
}

export interface MapTree {
  /** The ocean, or null for v1 output. */
  ocean: MapTreeOcean | null;
  /** Top-level maps: `onOcean` order (v2) or `project.maps` order (v1). */
  roots: MapTreeNode[];
  byId: ReadonlyMap<string, MapTreeNode>;
  /** Ids left out of the tree (with their subtrees) because the output is malformed. For tests; the viewer logs only the count, never the ids, and never shows them. */
  dropped: string[];
  warnings: MapTreeWarning[];
}

export type BreadcrumbItem = { kind: "ocean" } | { kind: "map"; map: MapDocument };

const ASPECT_TOLERANCE = 0.01;

const finite = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);
const positiveSize = (m: MapSize): boolean =>
  finite(m.width) && finite(m.height) && m.width > 0 && m.height > 0;

function validPlacement(p: OceanPlacement): boolean {
  return (
    finite(p.x) &&
    finite(p.y) &&
    finite(p.scale) &&
    p.scale > 0 &&
    (p.rotation === undefined || finite(p.rotation))
  );
}

function validFrame(f: MapFrame | undefined): f is MapFrame {
  return !!f && frameQuads(f) !== null;
}

function aspectMismatch(a: MapSize, w: number, h: number): boolean {
  const ra = a.width / a.height;
  const rb = w / h;
  return Math.abs(ra - rb) / rb > ASPECT_TOLERANCE;
}

/**
 * Build the tree from a parsed atlas. Never throws: a malformed tree is
 * trimmed (see `dropped`).
 */
export function buildMapTree(project: AtlasProject): MapTree {
  const maps = project.maps;
  const mapById = new Map<string, MapDocument>();
  for (const m of maps) if (!mapById.has(m.id)) mapById.set(m.id, m);

  const byId = new Map<string, MapTreeNode>();
  const warnings: MapTreeWarning[] = [];
  const roots: MapTreeNode[] = [];
  const v2 = !!project.ocean;
  const isV2Child = (m: MapDocument) => v2 && m.parent !== undefined;

  const node = (
    map: MapDocument,
    parentId: string | null,
    placement: OceanPlacement | null,
  ): MapTreeNode => ({
    map,
    parentId,
    placement,
    children: [],
  });

  if (project.ocean) {
    const seen = new Set<string>();
    for (const p of project.ocean.onOcean) {
      const m = mapById.get(p.map);
      if (!m || seen.has(m.id) || isV2Child(m)) continue; // unknown map, repeat, or a child: ignored
      seen.add(m.id);
      if (!validPlacement(p) || !positiveSize(m)) continue; // left out; reported as dropped below
      const n = node(m, null, p);
      roots.push(n);
      byId.set(m.id, n);
    }
  } else {
    for (const m of mapById.values()) {
      if (!positiveSize(m)) continue;
      const n = node(m, null, null);
      roots.push(n);
      byId.set(m.id, n);
    }
  }

  if (v2) {
    // Children by parent id, in project.maps order.
    const kids = new Map<string, MapDocument[]>();
    for (const m of mapById.values()) {
      if (m.parent === undefined) continue;
      const list = kids.get(m.parent) ?? [];
      list.push(m);
      kids.set(m.parent, list);
    }
    // Walk down from the roots only: a missing parent, a cycle or a dropped
    // ancestor never gets reached, so it is dropped with its subtree.
    const attach = (parent: MapTreeNode) => {
      for (const m of kids.get(parent.map.id) ?? []) {
        if (byId.has(m.id) || !validFrame(m.frame) || !positiveSize(m)) continue;
        const n = node(m, parent.map.id, null);
        byId.set(m.id, n);
        parent.children.push(n);
        if (aspectMismatch(m, m.frame.width, m.frame.height)) {
          warnings.push({
            mapId: m.id,
            kind: "aspect-mismatch",
            message: `${m.id}: frame is ${m.frame.width}x${m.frame.height} but the map is ${m.width}x${m.height}; the width ratio is used`,
          });
        }
        attach(n);
      }
    };
    for (const r of roots) attach(r);
  }

  // Maps not in the tree, plus any map reusing an id (first one wins); each id once.
  const dropped: string[] = [];
  for (const m of maps) {
    if (byId.get(m.id)?.map !== m && !dropped.includes(m.id)) dropped.push(m.id);
  }

  return {
    ocean: project.ocean
      ? { width: project.ocean.width, height: project.ocean.height, sea: project.ocean.sea }
      : null,
    roots,
    byId,
    dropped,
    warnings,
  };
}

/** The chain ocean (v2 only) > top-level map > ... > the map. Empty for an id not in the tree. */
export function breadcrumb(tree: MapTree, mapId: string): BreadcrumbItem[] {
  let n = tree.byId.get(mapId);
  if (!n) return [];
  const chain: BreadcrumbItem[] = [];
  while (n) {
    chain.push({ kind: "map", map: n.map });
    n = n.parentId === null ? undefined : tree.byId.get(n.parentId);
  }
  chain.reverse();
  return tree.ocean ? [{ kind: "ocean" }, ...chain] : chain;
}

function rotateAbout(p: Point, c: Point, degrees: number): Point {
  if (!degrees) return [p[0], p[1]];
  const rad = (degrees * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const dx = p[0] - c[0];
  const dy = p[1] - c[1];
  return [c[0] + dx * cos - dy * sin, c[1] + dx * sin + dy * cos];
}

/** A rectangle at (x, y) of size w x h, turned `rotation` about its centre; maps unrotated-rect points out and back. */
function toOuter(
  x: number,
  y: number,
  w: number,
  h: number,
  rotation: number,
  local: Point,
): Point {
  return rotateAbout([x + local[0], y + local[1]], [x + w / 2, y + h / 2], rotation);
}
function toLocal(
  x: number,
  y: number,
  w: number,
  h: number,
  rotation: number,
  outer: Point,
): Point {
  const p = rotateAbout(outer, [x + w / 2, y + h / 2], -rotation);
  return [p[0] - x, p[1] - y];
}

/** A child map's pixel to the parent's pixels (the child fills its frame). */
export function childToParent(frame: MapFrame, child: MapSize, point: Point): Point {
  const local: Point = [
    (point[0] * frame.width) / child.width,
    (point[1] * frame.height) / child.height,
  ];
  return toOuter(frame.x, frame.y, frame.width, frame.height, frame.rotation ?? 0, local);
}

/** A parent pixel to the child's pixels; the inverse of `childToParent`. */
export function parentToChild(frame: MapFrame, child: MapSize, point: Point): Point {
  const local = toLocal(frame.x, frame.y, frame.width, frame.height, frame.rotation ?? 0, point);
  return [(local[0] * child.width) / frame.width, (local[1] * child.height) / frame.height];
}

/** A top-level map's pixel to the ocean's pixels. */
export function mapToOcean(placement: OceanPlacement, map: MapSize, point: Point): Point {
  const w = map.width * placement.scale;
  const h = map.height * placement.scale;
  return toOuter(placement.x, placement.y, w, h, placement.rotation ?? 0, [
    point[0] * placement.scale,
    point[1] * placement.scale,
  ]);
}

/** An ocean pixel to the map's pixels; the inverse of `mapToOcean`. */
export function oceanToMap(placement: OceanPlacement, map: MapSize, point: Point): Point {
  const w = map.width * placement.scale;
  const h = map.height * placement.scale;
  const local = toLocal(placement.x, placement.y, w, h, placement.rotation ?? 0, point);
  return [local[0] / placement.scale, local[1] / placement.scale];
}

/**
 * The zoom to add to the parent's zoom to get the child's zoom showing the
 * same ground. Zoom is log2 of screen px per map px. The width ratio is used
 * even when the aspects differ (the tree warns about those).
 */
export function zoomOffset(child: MapSize, frame: MapFrame): number {
  return Math.log2(frame.width / child.width);
}

/** The same for a top-level map and the ocean: one map pixel is `scale` ocean pixels. */
export function oceanZoomOffset(_map: MapSize, placement: OceanPlacement): number {
  return Math.log2(placement.scale);
}

/** The frame's four corners in the parent's pixels (centre pivot), or null for a frame the resolver rejects. */
export function frameOutline(frame: MapFrame): Point[] | null {
  const quads = frameQuads(frame);
  return quads ? quads[0] : null;
}
