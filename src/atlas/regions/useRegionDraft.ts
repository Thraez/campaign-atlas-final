/**
 * Region draft state — the single source of truth for in-progress region work
 * on the active map. Wraps adds, edits, deletes, drawing, and selection so the
 * Regions tab and the editor map can both drive the same model.
 *
 * Persistence: regions remain in `world.yaml`. The hook only tracks LOCAL
 * draft changes; export goes through buildPatches/dumpYaml as usual.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MapDocument, Point, Region } from "@/atlas/content/schema";
import type { UndoStackAPI } from "@/atlas/useUndoStack";

export interface RegionDraft {
  /** Per-id partial overrides applied to existing canon regions. */
  edits: Record<string, Partial<Region>>;
  /** Brand-new regions created in this session. */
  added: Region[];
  /** Existing region ids removed in this session. */
  deleted: string[];
}

export interface RegionIssue {
  severity: "blocking" | "warning";
  code: string;
  message: string;
  regionId?: string;
}

const EMPTY: RegionDraft = { edits: {}, added: [], deleted: [] };

export interface RegionDraftAPI {
  draft: RegionDraft;
  effective: Region[];
  /** Bool: true when there are any local changes to export. */
  dirty: boolean;
  dirtyCount: number;
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
  drawing: boolean;
  draftPoints: Point[];
  startDraw: () => void;
  cancelDraw: () => void;
  addDraftPoint: (p: Point) => void;
  removeLastDraftPoint: () => void;
  /** Returns the new region id if a polygon was created, else null. */
  finishDraw: () => string | null;
  patch: (id: string, partial: Partial<Region>) => void;
  movePoint: (id: string, idx: number, p: Point) => void;
  insertPointAfter: (id: string, idx: number, p: Point) => void;
  deletePoint: (id: string, idx: number) => void;
  translate: (id: string, dx: number, dy: number) => void;
  duplicate: (id: string) => string | null;
  remove: (id: string) => void;
  reset: () => void;
  issues: RegionIssue[];
}

function slugify(s: string): string {
  return s.toLowerCase().trim().replace(/[\s_]+/g, "-").replace(/[^a-z0-9-]/g, "").replace(/-+/g, "-") || "region";
}

function uniqueId(base: string, taken: Set<string>): string {
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

function centroid(points: Point[]): Point {
  if (!points.length) return [0, 0];
  let sx = 0, sy = 0;
  for (const [x, y] of points) { sx += x; sy += y; }
  return [sx / points.length, sy / points.length];
}

export function useRegionDraft(
  map: MapDocument | undefined,
  opts: { entityIds?: Set<string>; dmEntityIds?: Set<string> } = {},
  undoStack?: UndoStackAPI,
): RegionDraftAPI {
  const [draft, setDraft] = useState<RegionDraft>(EMPTY);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [draftPoints, setDraftPoints] = useState<Point[]>([]);

  // Synchronous mirror of `draft` so consecutive mutations and undo callbacks
  // can read the latest state without waiting for React to flush.
  const draftRef = useRef(draft);
  useEffect(() => { draftRef.current = draft; }, [draft]);

  const applyDraft = useCallback((next: RegionDraft) => {
    draftRef.current = next;
    setDraft(next);
  }, []);

  /**
   * Mutate the region draft and (optionally) push an undo entry capturing the
   * snapshot before/after. Use this in place of setDraft for any mutation
   * that the DM should be able to Cmd+Z.
   */
  const mutateDraft = useCallback((compute: (prev: RegionDraft) => RegionDraft, label: string) => {
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

  const baseRegions = map?.regions ?? [];

  const effective: Region[] = useMemo(() => {
    if (!map) return [];
    const out: Region[] = [];
    for (const r of baseRegions) {
      if (draft.deleted.includes(r.id)) continue;
      const e = draft.edits[r.id];
      out.push(e ? { ...r, ...e } : r);
    }
    out.push(...draft.added);
    return out;
  }, [baseRegions, draft, map]);

  const projectIds = useMemo(() => new Set(baseRegions.map((r) => r.id).concat(draft.added.map((r) => r.id))), [baseRegions, draft.added]);

  const dirty = draft.added.length > 0 || draft.deleted.length > 0 || Object.keys(draft.edits).length > 0;
  const dirtyCount = draft.added.length + draft.deleted.length + Object.keys(draft.edits).length;

  const startDraw = useCallback(() => { setDrawing(true); setDraftPoints([]); setSelectedId(null); }, []);
  const cancelDraw = useCallback(() => { setDrawing(false); setDraftPoints([]); }, []);
  const addDraftPoint = useCallback((p: Point) => setDraftPoints((pts) => [...pts, p]), []);
  const removeLastDraftPoint = useCallback(() => setDraftPoints((pts) => pts.slice(0, -1)), []);

  const finishDraw = useCallback((): string | null => {
    if (draftPoints.length < 3 || !map) { setDrawing(false); setDraftPoints([]); return null; }
    const id = uniqueId(slugify(`region-${effective.length + 1}`), projectIds);
    const region: Region = {
      id,
      mapId: map.id,
      name: `New Region ${effective.length + 1}`,
      points: draftPoints,
      visibility: "dm",
      color: "#7fb069",
      fillOpacity: 0.18,
      strokeOpacity: 0.85,
    };
    mutateDraft((d) => ({ ...d, added: [...d.added, region] }), `add region ${id}`);
    setDrawing(false);
    setDraftPoints([]);
    setSelectedId(id);
    return id;
  }, [draftPoints, map, effective.length, projectIds, mutateDraft]);

  const patch = useCallback((id: string, partial: Partial<Region>) => {
    mutateDraft((d) => {
      // Added region? mutate it in place.
      const addedIdx = d.added.findIndex((r) => r.id === id);
      if (addedIdx >= 0) {
        const added = d.added.slice();
        added[addedIdx] = { ...added[addedIdx], ...partial };
        return { ...d, added };
      }
      return { ...d, edits: { ...d.edits, [id]: { ...(d.edits[id] ?? {}), ...partial } } };
    }, `patch region ${id}`);
  }, [mutateDraft]);

  const getEffective = useCallback((id: string): Region | null => effective.find((r) => r.id === id) ?? null, [effective]);

  const movePoint = useCallback((id: string, idx: number, p: Point) => {
    const cur = getEffective(id); if (!cur) return;
    const points = cur.points.slice(); points[idx] = p;
    patch(id, { points });
  }, [getEffective, patch]);

  const insertPointAfter = useCallback((id: string, idx: number, p: Point) => {
    const cur = getEffective(id); if (!cur) return;
    const points = cur.points.slice(); points.splice(idx + 1, 0, p);
    patch(id, { points });
  }, [getEffective, patch]);

  const deletePoint = useCallback((id: string, idx: number) => {
    const cur = getEffective(id); if (!cur) return;
    if (cur.points.length <= 3) return; // never go below a triangle
    const points = cur.points.filter((_, i) => i !== idx);
    patch(id, { points });
  }, [getEffective, patch]);

  const translate = useCallback((id: string, dx: number, dy: number) => {
    const cur = getEffective(id); if (!cur) return;
    patch(id, { points: cur.points.map(([x, y]) => [x + dx, y + dy] as Point) });
  }, [getEffective, patch]);

  const duplicate = useCallback((id: string): string | null => {
    const cur = getEffective(id); if (!cur || !map) return null;
    const newId = uniqueId(`${cur.id}-copy`, projectIds);
    const c = centroid(cur.points);
    const offset: Point = [Math.round(map.width * 0.02), Math.round(map.height * 0.02)];
    const copy: Region = {
      ...cur, id: newId, name: `${cur.name} (copy)`,
      points: cur.points.map(([x, y]) => [x + offset[0], y + offset[1]] as Point),
    };
    void c;
    mutateDraft((d) => ({ ...d, added: [...d.added, copy] }), `duplicate region ${id}`);
    setSelectedId(newId);
    return newId;
  }, [getEffective, map, projectIds, mutateDraft]);

  const remove = useCallback((id: string) => {
    mutateDraft((d) => {
      const addedIdx = d.added.findIndex((r) => r.id === id);
      if (addedIdx >= 0) {
        return { ...d, added: d.added.filter((r) => r.id !== id) };
      }
      const { [id]: _drop, ...restEdits } = d.edits;
      void _drop;
      return { ...d, edits: restEdits, deleted: d.deleted.includes(id) ? d.deleted : [...d.deleted, id] };
    }, `remove region ${id}`);
    setSelectedId((s) => (s === id ? null : s));
  }, [mutateDraft]);

  // reset() is NOT undoable — it's called both for save cleanup and map
  // switching. For save cleanup, the editor pushes its own undo entry that
  // captures pre-save drafts; for map switching, the user confirms loss
  // explicitly. Either way, an undo here would surprise the DM more than help.
  const reset = useCallback(() => { applyDraft(EMPTY); setSelectedId(null); cancelDraw(); }, [applyDraft, cancelDraw]);

  const issues = useMemo<RegionIssue[]>(() => {
    const out: RegionIssue[] = [];
    const seen = new Set<string>();
    for (const r of effective) {
      if (seen.has(r.id)) out.push({ severity: "blocking", code: "duplicate-region-id", message: `Duplicate region id "${r.id}"`, regionId: r.id });
      seen.add(r.id);
      if (r.points.length < 3) out.push({ severity: "blocking", code: "region-too-few-points", message: `Region "${r.name}" needs ≥ 3 points`, regionId: r.id });
      if (map && r.mapId !== map.id) out.push({ severity: "warning", code: "region-wrong-map", message: `Region "${r.name}" mapId "${r.mapId}" doesn't match active map`, regionId: r.id });
      if (opts.entityIds && r.entityId && !opts.entityIds.has(r.entityId)) {
        out.push({ severity: "warning", code: "region-unknown-entity", message: `Region "${r.name}" links to unknown entity "${r.entityId}"`, regionId: r.id });
      }
      if (opts.dmEntityIds && r.visibility === "player" && r.entityId && opts.dmEntityIds.has(r.entityId)) {
        out.push({ severity: "blocking", code: "spoiler-leak", message: `Player-visible region "${r.name}" links to DM-only entity`, regionId: r.id });
      }
      if (map) {
        const oob = r.points.some(([x, y]) => x < 0 || y < 0 || x > map.width || y > map.height);
        if (oob) out.push({ severity: "warning", code: "region-out-of-bounds", message: `Region "${r.name}" has points outside map bounds`, regionId: r.id });
      }
      if (r.fillOpacity != null && (r.fillOpacity < 0 || r.fillOpacity > 1)) {
        out.push({ severity: "warning", code: "region-opacity", message: `Region "${r.name}" fillOpacity must be 0–1`, regionId: r.id });
      }
      if (r.strokeOpacity != null && (r.strokeOpacity < 0 || r.strokeOpacity > 1)) {
        out.push({ severity: "warning", code: "region-opacity", message: `Region "${r.name}" strokeOpacity must be 0–1`, regionId: r.id });
      }
    }
    return out;
  }, [effective, map, opts.entityIds, opts.dmEntityIds]);

  return {
    draft, effective, dirty, dirtyCount,
    selectedId, setSelectedId,
    drawing, draftPoints,
    startDraw, cancelDraw, addDraftPoint, removeLastDraftPoint, finishDraw,
    patch, movePoint, insertPointAfter, deletePoint, translate,
    duplicate, remove, reset, issues,
  };
}

/** Strip undefined fields so the YAML stays minimal. */
export function regionToYamlObject(r: Region): Record<string, unknown> {
  const out: Record<string, unknown> = {
    id: r.id,
    mapId: r.mapId,
    name: r.name,
    visibility: r.visibility,
    points: r.points.map(([x, y]) => [Math.round(x), Math.round(y)]),
  };
  if (r.entityId) out.entityId = r.entityId;
  if (r.color) out.color = r.color;
  if (r.fillOpacity != null) out.fillOpacity = r.fillOpacity;
  if (r.strokeOpacity != null) out.strokeOpacity = r.strokeOpacity;
  return out;
}
