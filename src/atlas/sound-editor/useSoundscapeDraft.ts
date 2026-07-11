/**
 * Soundscape draft state — the single source of truth for in-progress sound
 * work on the active map, modelled on `useRegionDraft`. Owns the working
 * `SoundscapeConfig` (areas + enabled/masterGain), selection, and the polygon
 * draw state machine for sound-only zones.
 *
 * EDITOR-ONLY. Reached solely from the DM editor (`AtlasPlacementEditor`);
 * never import this from the player runtime (`src/atlas/sound/`), AtlasViewer,
 * or Landing. Pure of Leaflet — it receives plain `[x, y]` map points.
 *
 * Persistence: the panel writes `effective` back through the editor's
 * `patchMap({ soundscape })` seam; the unified Save serialises it via
 * `soundscapeToYamlObject`. This hook only tracks LOCAL draft changes.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  EntityVisibility,
  MapDocument,
  Point,
  SoundArea,
  SoundBed,
  SoundscapeConfig,
} from "@/atlas/content/schema";
import type { UndoStackAPI } from "@/atlas/useUndoStack";
import { uniqueId } from "@/atlas/content/slugify";

export interface SoundscapeDraft {
  /** Per-id partial overrides applied to existing canon areas. */
  edits: Record<string, Partial<SoundArea>>;
  /** Brand-new areas created in this session. */
  added: SoundArea[];
  /** Existing area ids removed in this session. */
  deleted: string[];
  /** Local override of `soundscape.enabled` (undefined ⇒ keep canon value). */
  enabled?: boolean;
  /** Local override of `soundscape.masterGain` (undefined ⇒ keep canon value). */
  masterGain?: number;
}

export interface SoundscapeIssue {
  severity: "blocking" | "warning";
  code: string;
  message: string;
  areaId?: string;
}

const EMPTY: SoundscapeDraft = { edits: {}, added: [], deleted: [] };

export interface SoundscapeDraftAPI {
  draft: SoundscapeDraft;
  /** Canon soundscape merged with local edits/adds/deletes — feed the panel and the save merge. */
  effective: SoundscapeConfig;
  /** True when there are any local changes to save. */
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
  /** Returns the new sound-area id if a polygon was created, else null. */
  finishDraw: () => string | null;
  /** Give an existing region a sound: push a ride-on area borrowing its shape. */
  addRideOn: (regionId: string) => string | null;
  patchArea: (id: string, partial: Partial<SoundArea>) => void;
  patchBed: (id: string, partial: Partial<SoundBed>) => void;
  setVisibility: (id: string, v: EntityVisibility) => void;
  setEnabled: (b: boolean) => void;
  setMasterGain: (g: number) => void;
  remove: (id: string) => void;
  reset: () => void;
  issues: SoundscapeIssue[];
}

export function useSoundscapeDraft(
  map: MapDocument | undefined,
  undoStack?: UndoStackAPI,
): SoundscapeDraftAPI {
  const [draft, setDraft] = useState<SoundscapeDraft>(EMPTY);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [draftPoints, setDraftPoints] = useState<Point[]>([]);

  // Synchronous mirror of `draft` so consecutive mutations and undo callbacks
  // can read the latest state without waiting for React to flush.
  const draftRef = useRef(draft);
  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  const applyDraft = useCallback((next: SoundscapeDraft) => {
    draftRef.current = next;
    setDraft(next);
  }, []);

  /**
   * Mutate the draft and (optionally) push an undo entry capturing the
   * snapshot before/after. Use this in place of setDraft for any mutation
   * the DM should be able to Cmd+Z.
   */
  const mutateDraft = useCallback(
    (compute: (prev: SoundscapeDraft) => SoundscapeDraft, label: string) => {
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
    },
    [applyDraft, undoStack],
  );

  const soundscape = map?.soundscape;
  const canon = useMemo<SoundscapeConfig>(() => soundscape ?? {}, [soundscape]);
  const baseAreas = useMemo(() => canon.areas ?? [], [canon]);

  const effectiveAreas: SoundArea[] = useMemo(() => {
    // The editor persistence loop feeds the panel's patched config back into
    // `map.soundscape`, so an area added this session can also appear in
    // canon. The draft copy is the live one — skip the fed-back canon copy so
    // `effective` (and the issues scan) always hold one entry per id.
    const addedIds = new Set(draft.added.map((a) => a.id));
    const out: SoundArea[] = [];
    for (const a of baseAreas) {
      if (draft.deleted.includes(a.id)) continue;
      if (addedIds.has(a.id)) continue;
      const e = draft.edits[a.id];
      out.push(e ? { ...a, ...e } : a);
    }
    out.push(...draft.added);
    return out;
  }, [baseAreas, draft]);

  const effective: SoundscapeConfig = useMemo(() => {
    const out: SoundscapeConfig = { ...canon, areas: effectiveAreas };
    if (draft.enabled !== undefined) out.enabled = draft.enabled;
    if (draft.masterGain !== undefined) out.masterGain = draft.masterGain;
    return out;
  }, [canon, effectiveAreas, draft.enabled, draft.masterGain]);

  const takenIds = useMemo(
    () => new Set(baseAreas.map((a) => a.id).concat(draft.added.map((a) => a.id))),
    [baseAreas, draft.added],
  );

  const dirty =
    draft.added.length > 0 ||
    draft.deleted.length > 0 ||
    Object.keys(draft.edits).length > 0 ||
    draft.enabled !== undefined ||
    draft.masterGain !== undefined;
  const dirtyCount =
    draft.added.length +
    draft.deleted.length +
    Object.keys(draft.edits).length +
    (draft.enabled !== undefined ? 1 : 0) +
    (draft.masterGain !== undefined ? 1 : 0);

  const startDraw = useCallback(() => {
    setDrawing(true);
    setDraftPoints([]);
    setSelectedId(null);
  }, []);
  const cancelDraw = useCallback(() => {
    setDrawing(false);
    setDraftPoints([]);
  }, []);
  const addDraftPoint = useCallback((p: Point) => setDraftPoints((pts) => [...pts, p]), []);
  const removeLastDraftPoint = useCallback(() => setDraftPoints((pts) => pts.slice(0, -1)), []);

  const finishDraw = useCallback((): string | null => {
    if (draftPoints.length < 3 || !map) {
      setDrawing(false);
      setDraftPoints([]);
      return null;
    }
    const id = uniqueId(`s${takenIds.size}`, takenIds);
    // Secrecy-safe default: a newly drawn sound-only zone is DM-only until the
    // DM deliberately marks it player-visible. Never leaks into player builds.
    const area: SoundArea = {
      id,
      points: draftPoints,
      visibility: "dm",
      bed: { src: "" },
    };
    mutateDraft((d) => ({ ...d, added: [...d.added, area] }), `add sound zone ${id}`);
    setDrawing(false);
    setDraftPoints([]);
    setSelectedId(id);
    return id;
  }, [draftPoints, map, takenIds, mutateDraft]);

  const addRideOn = useCallback(
    (regionId: string): string | null => {
      if (!map) return null;
      const id = uniqueId(`s${takenIds.size}`, takenIds);
      // Ride-on areas inherit the region's shape AND visibility (spec §10.1):
      // no `points`, no `visibility` field of their own.
      const area: SoundArea = { id, regionId, bed: { src: "" } };
      mutateDraft((d) => ({ ...d, added: [...d.added, area] }), `add sound for region ${regionId}`);
      setSelectedId(id);
      return id;
    },
    [map, takenIds, mutateDraft],
  );

  const patchArea = useCallback(
    (id: string, partial: Partial<SoundArea>) => {
      mutateDraft((d) => {
        // Added area? mutate it in place.
        const addedIdx = d.added.findIndex((a) => a.id === id);
        if (addedIdx >= 0) {
          const added = d.added.slice();
          added[addedIdx] = { ...added[addedIdx], ...partial };
          return { ...d, added };
        }
        return { ...d, edits: { ...d.edits, [id]: { ...(d.edits[id] ?? {}), ...partial } } };
      }, `patch sound area ${id}`);
    },
    [mutateDraft],
  );

  const getEffective = useCallback(
    (id: string): SoundArea | null => effectiveAreas.find((a) => a.id === id) ?? null,
    [effectiveAreas],
  );

  const patchBed = useCallback(
    (id: string, partial: Partial<SoundBed>) => {
      const cur = getEffective(id);
      if (!cur) return;
      patchArea(id, { bed: { ...cur.bed, ...partial } });
    },
    [getEffective, patchArea],
  );

  const setVisibility = useCallback(
    (id: string, v: EntityVisibility) => patchArea(id, { visibility: v }),
    [patchArea],
  );

  const setEnabled = useCallback(
    (b: boolean) => mutateDraft((d) => ({ ...d, enabled: b }), "toggle soundscape"),
    [mutateDraft],
  );

  const setMasterGain = useCallback(
    (g: number) => mutateDraft((d) => ({ ...d, masterGain: g }), "set volume"),
    [mutateDraft],
  );

  const remove = useCallback(
    (id: string) => {
      mutateDraft((d) => {
        const addedIdx = d.added.findIndex((a) => a.id === id);
        if (addedIdx >= 0) {
          return { ...d, added: d.added.filter((a) => a.id !== id) };
        }
        const { [id]: _drop, ...restEdits } = d.edits;
        void _drop;
        return {
          ...d,
          edits: restEdits,
          deleted: d.deleted.includes(id) ? d.deleted : [...d.deleted, id],
        };
      }, `remove sound area ${id}`);
      setSelectedId((s) => (s === id ? null : s));
    },
    [mutateDraft],
  );

  // reset() is NOT undoable — mirrors useRegionDraft: it runs for save cleanup
  // and map switching, both of which the DM confirms elsewhere.
  const reset = useCallback(() => {
    applyDraft(EMPTY);
    setSelectedId(null);
    cancelDraw();
  }, [applyDraft, cancelDraw]);

  const regionIds = useMemo(() => new Set((map?.regions ?? []).map((r) => r.id)), [map?.regions]);

  const issues = useMemo<SoundscapeIssue[]>(() => {
    const out: SoundscapeIssue[] = [];
    const seen = new Set<string>();
    for (const a of effectiveAreas) {
      const label = a.name ?? a.id;
      if (seen.has(a.id))
        out.push({
          severity: "blocking",
          code: "duplicate-sound-area-id",
          message: `Duplicate sound area id "${a.id}"`,
          areaId: a.id,
        });
      seen.add(a.id);
      if (!a.bed.src)
        out.push({
          severity: "warning",
          code: "sound-area-no-file",
          message: `"${label}" has no sound file yet`,
          areaId: a.id,
        });
      if (a.regionId && !regionIds.has(a.regionId))
        out.push({
          severity: "warning",
          code: "sound-area-missing-region",
          message: `"${label}" is attached to a region that no longer exists`,
          areaId: a.id,
        });
      if (!a.regionId && (a.points?.length ?? 0) < 3)
        out.push({
          severity: "blocking",
          code: "sound-area-too-few-points",
          message: `"${label}" needs a zone of at least 3 points`,
          areaId: a.id,
        });
      if (a.bed.gain != null && (a.bed.gain < 0 || a.bed.gain > 1))
        out.push({
          severity: "warning",
          code: "sound-area-loudness",
          message: `"${label}" Loudness must be 0–100%`,
          areaId: a.id,
        });
    }
    const mg = effective.masterGain;
    if (mg != null && (mg < 0 || mg > 1))
      out.push({
        severity: "warning",
        code: "soundscape-volume",
        message: "Volume must be 0–100%",
      });
    return out;
  }, [effectiveAreas, regionIds, effective.masterGain]);

  return {
    draft,
    effective,
    dirty,
    dirtyCount,
    selectedId,
    setSelectedId,
    drawing,
    draftPoints,
    startDraw,
    cancelDraw,
    addDraftPoint,
    removeLastDraftPoint,
    finishDraw,
    addRideOn,
    patchArea,
    patchBed,
    setVisibility,
    setEnabled,
    setMasterGain,
    remove,
    reset,
    issues,
  };
}
