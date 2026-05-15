/**
 * Route draft state — adds, edits, deletes, drawing, selection.
 *
 * Mirrors useRegionDraft. Waypoints can be raw coords [x,y] or entity refs
 * { entityId }. The hook resolves entity refs against the project's placements
 * for the active map so the live polyline preview matches what the player
 * runtime would render.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AtlasProject, MapDocument, Point, Route, RouteMode } from "@/atlas/content/schema";
import type { UndoStackAPI } from "@/atlas/useUndoStack";

export type Waypoint = Point | { entityId: string };

export interface RouteDraft {
  edits: Record<string, Partial<Route>>;
  added: Route[];
  deleted: string[];
}

export interface RouteIssue {
  severity: "blocking" | "warning";
  code: string;
  message: string;
  routeId?: string;
}

const EMPTY: RouteDraft = { edits: {}, added: [], deleted: [] };

export interface RouteDraftAPI {
  draft: RouteDraft;
  effective: Route[];
  dirty: boolean;
  dirtyCount: number;
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
  drawing: boolean;
  draftWaypoints: Waypoint[];
  startDraw: () => void;
  cancelDraw: () => void;
  addDraftPoint: (p: Point) => void;
  addDraftEntity: (entityId: string) => void;
  removeLastDraftPoint: () => void;
  finishDraw: () => string | null;
  patch: (id: string, partial: Partial<Route>) => void;
  moveWaypoint: (id: string, idx: number, p: Point) => void;
  /** Replaces a waypoint with an entity ref. */
  setWaypointEntity: (id: string, idx: number, entityId: string) => void;
  removeWaypoint: (id: string, idx: number) => void;
  insertWaypointAfter: (id: string, idx: number, w: Waypoint) => void;
  duplicate: (id: string) => string | null;
  remove: (id: string) => void;
  reset: () => void;
  /** Phase 1B B0 — full-state snapshot for the save-boundary undo entry. */
  snapshot: () => RouteDraft;
  applySnapshot: (snap: RouteDraft) => void;
  issues: RouteIssue[];
  /** Resolve a waypoint to absolute [x,y] using project placements. Null when unresolved. */
  resolveWaypoint: (w: Waypoint) => Point | null;
  /** Resolve every waypoint of a route. Drops unresolved entries. */
  resolveRoute: (r: Route) => Point[];
}

function slugify(s: string): string {
  return s.toLowerCase().trim().replace(/[\s_]+/g, "-").replace(/[^a-z0-9-]/g, "").replace(/-+/g, "-") || "route";
}

function uniqueId(base: string, taken: Set<string>): string {
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

export function useRouteDraft(
  project: AtlasProject | null,
  map: MapDocument | undefined,
  opts: { entityIds?: Set<string>; dmEntityIds?: Set<string> } = {},
  undoStack?: UndoStackAPI,
): RouteDraftAPI {
  const [draft, setDraft] = useState<RouteDraft>(EMPTY);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [draftWaypoints, setDraftWaypoints] = useState<Waypoint[]>([]);

  const draftRef = useRef(draft);
  useEffect(() => { draftRef.current = draft; }, [draft]);

  const applyDraft = useCallback((next: RouteDraft) => {
    draftRef.current = next;
    setDraft(next);
  }, []);

  const mutateDraft = useCallback((compute: (prev: RouteDraft) => RouteDraft, label: string) => {
    const before = draftRef.current;
    const after = compute(before);
    if (after === before) return;
    applyDraft(after);
    if (undoStack) {
      undoStack.push({
        undo: () => applyDraft(before),
        redo: () => applyDraft(after),
        label,
      });
    }
  }, [applyDraft, undoStack]);

  const baseRoutes = map?.routes ?? [];

  const effective: Route[] = useMemo(() => {
    if (!map) return [];
    const out: Route[] = [];
    for (const r of baseRoutes) {
      if (draft.deleted.includes(r.id)) continue;
      const e = draft.edits[r.id];
      out.push(e ? { ...r, ...e } : r);
    }
    out.push(...draft.added);
    return out;
  }, [baseRoutes, draft, map]);

  const projectIds = useMemo(
    () => new Set(baseRoutes.map((r) => r.id).concat(draft.added.map((r) => r.id))),
    [baseRoutes, draft.added]
  );

  const placementByEntity = useMemo(() => {
    const m = new Map<string, Point>();
    if (project && map) {
      for (const p of project.placements) {
        if (p.mapId === map.id) m.set(p.entityId, [p.x, p.y]);
      }
    }
    return m;
  }, [project, map]);

  const resolveWaypoint = useCallback((w: Waypoint): Point | null => {
    if (Array.isArray(w)) return w;
    return placementByEntity.get(w.entityId) ?? null;
  }, [placementByEntity]);

  const resolveRoute = useCallback((r: Route): Point[] => {
    const out: Point[] = [];
    for (const w of r.waypoints) {
      const p = resolveWaypoint(w);
      if (p) out.push(p);
    }
    return out;
  }, [resolveWaypoint]);

  const dirty = draft.added.length > 0 || draft.deleted.length > 0 || Object.keys(draft.edits).length > 0;
  const dirtyCount = draft.added.length + draft.deleted.length + Object.keys(draft.edits).length;

  const startDraw = useCallback(() => { setDrawing(true); setDraftWaypoints([]); setSelectedId(null); }, []);
  const cancelDraw = useCallback(() => { setDrawing(false); setDraftWaypoints([]); }, []);
  const addDraftPoint = useCallback((p: Point) => setDraftWaypoints((w) => [...w, p]), []);
  const addDraftEntity = useCallback((entityId: string) => setDraftWaypoints((w) => [...w, { entityId }]), []);
  const removeLastDraftPoint = useCallback(() => setDraftWaypoints((w) => w.slice(0, -1)), []);

  const finishDraw = useCallback((): string | null => {
    if (draftWaypoints.length < 2 || !map) { setDrawing(false); setDraftWaypoints([]); return null; }
    const id = uniqueId(slugify(`route-${effective.length + 1}`), projectIds);
    const route: Route = {
      id,
      mapId: map.id,
      name: `New Route ${effective.length + 1}`,
      visibility: "dm",
      waypoints: draftWaypoints,
      mode: "foot",
      color: "#cfd6dc",
      weight: 3,
      dashed: false,
    };
    mutateDraft((d) => ({ ...d, added: [...d.added, route] }), `add route ${id}`);
    setDrawing(false);
    setDraftWaypoints([]);
    setSelectedId(id);
    return id;
  }, [draftWaypoints, map, effective.length, projectIds, mutateDraft]);

  const patch = useCallback((id: string, partial: Partial<Route>) => {
    mutateDraft((d) => {
      const addedIdx = d.added.findIndex((r) => r.id === id);
      if (addedIdx >= 0) {
        const added = d.added.slice();
        added[addedIdx] = { ...added[addedIdx], ...partial };
        return { ...d, added };
      }
      return { ...d, edits: { ...d.edits, [id]: { ...(d.edits[id] ?? {}), ...partial } } };
    }, `patch route ${id}`);
  }, [mutateDraft]);

  const getEffective = useCallback((id: string): Route | null => effective.find((r) => r.id === id) ?? null, [effective]);

  const moveWaypoint = useCallback((id: string, idx: number, p: Point) => {
    const cur = getEffective(id); if (!cur) return;
    const ws = cur.waypoints.slice(); ws[idx] = p;
    patch(id, { waypoints: ws });
  }, [getEffective, patch]);

  const setWaypointEntity = useCallback((id: string, idx: number, entityId: string) => {
    const cur = getEffective(id); if (!cur) return;
    const ws = cur.waypoints.slice(); ws[idx] = { entityId };
    patch(id, { waypoints: ws });
  }, [getEffective, patch]);

  const removeWaypoint = useCallback((id: string, idx: number) => {
    const cur = getEffective(id); if (!cur) return;
    if (cur.waypoints.length <= 2) return;
    patch(id, { waypoints: cur.waypoints.filter((_, i) => i !== idx) });
  }, [getEffective, patch]);

  const insertWaypointAfter = useCallback((id: string, idx: number, w: Waypoint) => {
    const cur = getEffective(id); if (!cur) return;
    const ws = cur.waypoints.slice(); ws.splice(idx + 1, 0, w);
    patch(id, { waypoints: ws });
  }, [getEffective, patch]);

  const duplicate = useCallback((id: string): string | null => {
    const cur = getEffective(id); if (!cur || !map) return null;
    const newId = uniqueId(`${cur.id}-copy`, projectIds);
    const offset: Point = [Math.round(map.width * 0.02), Math.round(map.height * 0.02)];
    const copy: Route = {
      ...cur, id: newId, name: `${cur.name} (copy)`,
      waypoints: cur.waypoints.map((w) =>
        Array.isArray(w) ? ([w[0] + offset[0], w[1] + offset[1]] as Point) : { ...w }
      ),
    };
    mutateDraft((d) => ({ ...d, added: [...d.added, copy] }), `duplicate route ${id}`);
    setSelectedId(newId);
    return newId;
  }, [getEffective, map, projectIds, mutateDraft]);

  const remove = useCallback((id: string) => {
    mutateDraft((d) => {
      const addedIdx = d.added.findIndex((r) => r.id === id);
      if (addedIdx >= 0) return { ...d, added: d.added.filter((r) => r.id !== id) };
      const { [id]: _drop, ...restEdits } = d.edits; void _drop;
      return { ...d, edits: restEdits, deleted: d.deleted.includes(id) ? d.deleted : [...d.deleted, id] };
    }, `remove route ${id}`);
    setSelectedId((s) => (s === id ? null : s));
  }, [mutateDraft]);

  // reset() bypasses the undo stack — see comment in useRegionDraft.ts.
  const reset = useCallback(() => { applyDraft(EMPTY); setSelectedId(null); cancelDraw(); }, [applyDraft, cancelDraw]);

  const issues = useMemo<RouteIssue[]>(() => {
    const out: RouteIssue[] = [];
    const seen = new Set<string>();
    for (const r of effective) {
      if (seen.has(r.id)) out.push({ severity: "blocking", code: "duplicate-route-id", message: `Duplicate route "${r.id}"`, routeId: r.id });
      seen.add(r.id);
      if (r.waypoints.length < 2) out.push({ severity: "blocking", code: "route-too-few-waypoints", message: `Route "${r.name}" needs ≥ 2 waypoints`, routeId: r.id });
      if (map && r.mapId !== map.id) out.push({ severity: "warning", code: "route-wrong-map", message: `Route "${r.name}" mapId "${r.mapId}" doesn't match active map`, routeId: r.id });
      for (const w of r.waypoints) {
        if (!Array.isArray(w)) {
          if (opts.entityIds && !opts.entityIds.has(w.entityId)) {
            out.push({ severity: "warning", code: "route-unknown-entity", message: `Route "${r.name}" references unknown entity "${w.entityId}"`, routeId: r.id });
          } else if (!placementByEntity.has(w.entityId)) {
            out.push({ severity: "warning", code: "route-entity-no-placement", message: `Entity "${w.entityId}" has no placement on this map`, routeId: r.id });
          }
          if (opts.dmEntityIds && r.visibility === "player" && opts.dmEntityIds.has(w.entityId)) {
            out.push({ severity: "blocking", code: "spoiler-leak", message: `Player route "${r.name}" uses DM-only entity waypoint "${w.entityId}"`, routeId: r.id });
          }
        } else if (map) {
          const [x, y] = w;
          if (x < 0 || y < 0 || x > map.width || y > map.height) {
            out.push({ severity: "warning", code: "route-out-of-bounds", message: `Route "${r.name}" has waypoints outside map bounds`, routeId: r.id });
            break;
          }
        }
      }
      if (r.speed != null && !map?.scale) {
        out.push({ severity: "warning", code: "route-no-scale", message: `Route "${r.name}" has speed but map has no scale — travel time won't render`, routeId: r.id });
      }
    }
    return out;
  }, [effective, map, opts.entityIds, opts.dmEntityIds, placementByEntity]);

  const snapshot = useCallback((): RouteDraft => draftRef.current, []);
  const applySnapshot = useCallback((snap: RouteDraft) => { applyDraft(snap); }, [applyDraft]);

  return {
    draft, effective, dirty, dirtyCount,
    selectedId, setSelectedId,
    drawing, draftWaypoints,
    startDraw, cancelDraw, addDraftPoint, addDraftEntity, removeLastDraftPoint, finishDraw,
    patch, moveWaypoint, setWaypointEntity, removeWaypoint, insertWaypointAfter,
    duplicate, remove, reset,
    snapshot, applySnapshot,
    issues,
    resolveWaypoint, resolveRoute,
  };
}

export function routeToYamlObject(r: Route): Record<string, unknown> {
  const out: Record<string, unknown> = {
    id: r.id, mapId: r.mapId, name: r.name, visibility: r.visibility,
    waypoints: r.waypoints.map((w) =>
      Array.isArray(w) ? [Math.round(w[0]), Math.round(w[1])] : { entityId: w.entityId }
    ),
  };
  if (r.mode) out.mode = r.mode;
  if (r.speed != null) out.speed = r.speed;
  if (r.color) out.color = r.color;
  if (r.weight != null) out.weight = r.weight;
  if (r.dashed) out.dashed = true;
  if (r.description) out.description = r.description;
  return out;
}

export const ROUTE_MODES: RouteMode[] = ["foot", "horse", "ship", "cart", "fly", "custom"];
