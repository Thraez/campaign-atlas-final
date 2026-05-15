/**
 * Fog draft state — toggle, color, and reveal authoring (polygon + circle).
 *
 * Storage stays compatible with the existing schema: reveals are
 * `Point[][]` (polygon arrays). Circles are stored as ~32-vertex polygon
 * approximations so the player runtime needs no changes. We track the
 * editing intent (kind/center/radius) only in-memory for UX.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FogOverlay, MapDocument, Point, Region, Route } from "@/atlas/content/schema";
import type { UndoStackAPI } from "@/atlas/useUndoStack";

export interface FogIssue {
  severity: "blocking" | "warning";
  code: string;
  message: string;
  index?: number;
}

const DEFAULT_COLOR = "rgba(0,0,0,0.55)";
const CIRCLE_SEGMENTS = 36;

export type FogTool = "polygon" | "circle" | null;

export interface FogDraftAPI {
  fog: FogOverlay;
  /** True if local edits diverge from canon. */
  dirty: boolean;
  setEnabled: (v: boolean) => void;
  setColor: (v: string | undefined) => void;
  // Reveal authoring
  tool: FogTool;
  setTool: (t: FogTool) => void;
  draftPoints: Point[];
  addDraftPoint: (p: Point) => void;
  removeLastDraftPoint: () => void;
  cancelDraft: () => void;
  finishDraftPolygon: () => boolean;
  /** Draw a circle by anchor + radius (in map units). Adds polygon approximation. */
  finishDraftCircle: (radius: number) => boolean;
  removeReveal: (index: number) => void;
  clearReveals: () => void;
  // Convenience reveals from existing geometry
  revealRegion: (r: Region) => void;
  revealAroundRoute: (r: Route, points: Point[], padding: number) => void;
  revealAroundPin: (center: Point, radius: number) => void;
  reset: () => void;
  /** Phase 1B B0 — full-state snapshot for the save-boundary undo entry.
   *  null = "no local override" (fog state is purely canon). */
  snapshot: () => FogOverlay | null;
  applySnapshot: (snap: FogOverlay | null) => void;
  issues: FogIssue[];
}

function circlePolygon(cx: number, cy: number, r: number, segs = CIRCLE_SEGMENTS): Point[] {
  const out: Point[] = [];
  for (let i = 0; i < segs; i++) {
    const a = (i / segs) * Math.PI * 2;
    out.push([Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r)]);
  }
  return out;
}

function bboxAroundLine(points: Point[], padding: number): Point[] {
  if (!points.length) return [];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of points) {
    if (x < minX) minX = x; if (y < minY) minY = y;
    if (x > maxX) maxX = x; if (y > maxY) maxY = y;
  }
  minX -= padding; minY -= padding; maxX += padding; maxY += padding;
  return [[minX, minY], [maxX, minY], [maxX, maxY], [minX, maxY]];
}

const DEFAULT_FOG = (mapId: string): FogOverlay => ({
  mapId, enabled: false, color: DEFAULT_COLOR, reveals: [],
});

export function useFogDraft(map: MapDocument | undefined, undoStack?: UndoStackAPI): FogDraftAPI {
  const base: FogOverlay = useMemo(
    () => map?.fog ?? (map ? DEFAULT_FOG(map.id) : DEFAULT_FOG("")),
    [map]
  );
  const [override, setOverride] = useState<FogOverlay | null>(null);
  const fog = override ?? base;
  const dirty = override !== null;

  const [tool, setTool] = useState<FogTool>(null);
  const [draftPoints, setDraftPoints] = useState<Point[]>([]);

  const overrideRef = useRef(override);
  useEffect(() => { overrideRef.current = override; }, [override]);

  const applyOverride = useCallback((next: FogOverlay | null) => {
    overrideRef.current = next;
    setOverride(next);
  }, []);

  /**
   * Apply a partial change to the fog overlay and (optionally) record an
   * undo entry. Records the snapshot pair (prior override, next override)
   * so Cmd+Z reverts both the visible flag and any reveal change at once.
   */
  const mutate = useCallback((p: Partial<FogOverlay>) => {
    const before = overrideRef.current;
    const cur = before ?? base;
    const next: FogOverlay = { ...cur, ...p };
    // No real change → no-op.
    if (before && (Object.keys(p) as (keyof FogOverlay)[]).every((k) => before[k] === next[k])) return;
    applyOverride(next);
    if (undoStack) {
      undoStack.push({
        undo: () => applyOverride(before),
        redo: () => applyOverride(next),
        label: "fog",
      });
    }
  }, [base, applyOverride, undoStack]);

  const setEnabled = useCallback((v: boolean) => mutate({ enabled: v }), [mutate]);
  const setColor = useCallback((v: string | undefined) => mutate({ color: v }), [mutate]);

  const addDraftPoint = useCallback((p: Point) => setDraftPoints((s) => [...s, p]), []);
  const removeLastDraftPoint = useCallback(() => setDraftPoints((s) => s.slice(0, -1)), []);
  const cancelDraft = useCallback(() => { setTool(null); setDraftPoints([]); }, []);

  const addReveal = useCallback((poly: Point[]) => {
    mutate({ reveals: [...fog.reveals, poly] });
  }, [mutate, fog.reveals]);

  const finishDraftPolygon = useCallback((): boolean => {
    if (draftPoints.length < 3) { return false; }
    addReveal(draftPoints);
    setDraftPoints([]);
    setTool(null);
    return true;
  }, [draftPoints, addReveal]);

  const finishDraftCircle = useCallback((radius: number): boolean => {
    if (draftPoints.length < 1 || radius <= 0) return false;
    const [cx, cy] = draftPoints[0];
    addReveal(circlePolygon(cx, cy, radius));
    setDraftPoints([]);
    setTool(null);
    return true;
  }, [draftPoints, addReveal]);

  const removeReveal = useCallback((index: number) => {
    mutate({ reveals: fog.reveals.filter((_, i) => i !== index) });
  }, [mutate, fog.reveals]);

  const clearReveals = useCallback(() => mutate({ reveals: [] }), [mutate]);

  const revealRegion = useCallback((r: Region) => {
    if (r.points.length >= 3) addReveal(r.points);
  }, [addReveal]);

  const revealAroundRoute = useCallback((_r: Route, points: Point[], padding: number) => {
    const poly = bboxAroundLine(points, padding);
    if (poly.length >= 3) addReveal(poly);
  }, [addReveal]);

  const revealAroundPin = useCallback((center: Point, radius: number) => {
    addReveal(circlePolygon(center[0], center[1], radius));
  }, [addReveal]);

  // reset() bypasses the undo stack — see comment in useRegionDraft.ts.
  const reset = useCallback(() => { applyOverride(null); cancelDraft(); }, [applyOverride, cancelDraft]);

  const issues = useMemo<FogIssue[]>(() => {
    const out: FogIssue[] = [];
    if (map && fog.mapId !== map.id) out.push({ severity: "warning", code: "fog-wrong-map", message: `Fog mapId "${fog.mapId}" doesn't match active map.` });
    fog.reveals.forEach((poly, i) => {
      if (poly.length < 3) out.push({ severity: "blocking", code: "fog-reveal-too-few-points", message: `Reveal #${i + 1} has fewer than 3 points`, index: i });
      if (map) {
        const oob = poly.some(([x, y]) => x < 0 || y < 0 || x > map.width || y > map.height);
        if (oob) out.push({ severity: "warning", code: "fog-reveal-out-of-bounds", message: `Reveal #${i + 1} extends outside map bounds`, index: i });
      }
    });
    return out;
  }, [fog, map]);

  const snapshot = useCallback((): FogOverlay | null => overrideRef.current, []);
  const applySnapshot = useCallback((snap: FogOverlay | null) => { applyOverride(snap); }, [applyOverride]);

  return {
    fog, dirty, setEnabled, setColor,
    tool, setTool, draftPoints, addDraftPoint, removeLastDraftPoint, cancelDraft,
    finishDraftPolygon, finishDraftCircle,
    removeReveal, clearReveals,
    revealRegion, revealAroundRoute, revealAroundPin,
    reset,
    snapshot, applySnapshot,
    issues,
  };
}

export function fogToYamlObject(f: FogOverlay): Record<string, unknown> {
  const out: Record<string, unknown> = {
    mapId: f.mapId,
    enabled: f.enabled,
    reveals: f.reveals.map((poly) => poly.map(([x, y]) => [Math.round(x), Math.round(y)])),
  };
  if (f.color) out.color = f.color;
  return out;
}
