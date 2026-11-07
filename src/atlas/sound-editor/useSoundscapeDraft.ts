/**
 * The Sound tab's editing API for the active map's soundscape.
 *
 * There is no separate draft: the map's soundscape (its metadata override
 * folded in) is the one source of truth. Every edit writes the next config
 * through the editor's `patchMap({ soundscape })`, so it is kept per map,
 * undone and redone with its map (the entry carries the mapId), persisted and
 * discarded by the editor session with the rest of the map metadata, and saved
 * via `soundscapeToYamlObject`. Only the drawing in progress and the selection
 * live here; they reset when the map changes.
 *
 * EDITOR-ONLY. Reached solely from the DM editor (`AtlasPlacementEditor`);
 * never import this from the player runtime (`src/atlas/sound/`), AtlasViewer,
 * or Landing. Pure of Leaflet — it receives plain `[x, y]` map points.
 */
import { useCallback, useMemo, useState } from "react";
import type {
  EntityVisibility,
  MapDocument,
  Point,
  SoundArea,
  SoundBed,
  SoundscapeConfig,
} from "@/atlas/content/schema";
import { uniqueId } from "@/atlas/content/slugify";
import { soundAreaDraftToConfig } from "./soundAreaDraftToConfig";

export interface SoundscapeIssue {
  severity: "blocking" | "warning";
  code: string;
  message: string;
  areaId?: string;
}

export interface SoundscapeDraftAPI {
  /** The map's soundscape as edited (its metadata override folded in). */
  effective: SoundscapeConfig;
  /** Changes between `canon` and the map's soundscape. */
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
  /** Put the map's saved soundscape back (undoable). */
  reset: () => void;
  issues: SoundscapeIssue[];
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Changes between the saved soundscape and the edited one: one per added,
 *  removed or changed area, plus the map-wide on/off and volume. */
function soundscapeChanges(canon: SoundscapeConfig, next: SoundscapeConfig): number {
  const before = new Map((canon.areas ?? []).map((a) => [a.id, a]));
  const after = new Map((next.areas ?? []).map((a) => [a.id, a]));
  let n = 0;
  for (const [id, a] of after) if (!same(before.get(id), a)) n++;
  for (const id of before.keys()) if (!after.has(id)) n++;
  if (canon.enabled !== next.enabled) n++;
  if (canon.masterGain !== next.masterGain) n++;
  return n;
}

/** The editor's undoable writes to the active map's metadata override. */
export interface MapOverrideEdits {
  /** `patchMap`: merge into the override. */
  patch: (patch: Partial<MapDocument>) => void;
  /** `unpatchMap`: drop one key from the override (back to the saved value). */
  unpatch: (key: keyof MapDocument) => void;
}

/**
 * @param map   the active map with its metadata override folded in.
 * @param canon the map's soundscape before the override (for the change count).
 * @param edits every edit lands in the map's override as `{ soundscape }`; the
 *   editor records the undo entry (with its map).
 */
export function useSoundscapeDraft(
  map: MapDocument | undefined,
  canon: SoundscapeConfig | undefined,
  edits: MapOverrideEdits,
): SoundscapeDraftAPI {
  const { patch: onPatch, unpatch } = edits;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [draftPoints, setDraftPoints] = useState<Point[]>([]);

  // A drawing or selection in progress belongs to the map it started on.
  const mapId = map?.id;
  const [shownMapId, setShownMapId] = useState(mapId);
  if (shownMapId !== mapId) {
    setShownMapId(mapId);
    setSelectedId(null);
    setDrawing(false);
    setDraftPoints([]);
  }

  const soundscape = map?.soundscape;
  const effective = useMemo<SoundscapeConfig>(
    () => ({ ...soundscape, areas: soundscape?.areas ?? [] }),
    [soundscape],
  );
  const effectiveAreas = effective.areas!;

  /** Write the next soundscape into the map's override (one undo entry). */
  const commit = useCallback(
    (next: SoundscapeConfig) => {
      if (!map) return;
      onPatch({ soundscape: soundAreaDraftToConfig(next) });
    },
    [map, onPatch],
  );
  const setAreas = useCallback(
    (areas: SoundArea[]) => commit({ ...effective, areas }),
    [commit, effective],
  );

  // Saved ids too: a saved area removed this session keeps its id, so a new
  // area never takes over a saved area's id (the change count matches by id).
  const takenIds = useMemo(
    () => new Set([...(canon?.areas ?? []), ...effectiveAreas].map((a) => a.id)),
    [canon, effectiveAreas],
  );

  const dirtyCount = useMemo(
    () =>
      soundscapeChanges(
        soundAreaDraftToConfig(canon ?? {}) ?? {},
        soundAreaDraftToConfig(effective) ?? {},
      ),
    [canon, effective],
  );

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
    setAreas([...effectiveAreas, area]);
    setDrawing(false);
    setDraftPoints([]);
    setSelectedId(id);
    return id;
  }, [draftPoints, map, takenIds, setAreas, effectiveAreas]);

  const addRideOn = useCallback(
    (regionId: string): string | null => {
      if (!map) return null;
      const id = uniqueId(`s${takenIds.size}`, takenIds);
      // Ride-on areas inherit the region's shape AND visibility (spec §10.1):
      // no `points`, no `visibility` field of their own.
      setAreas([...effectiveAreas, { id, regionId, bed: { src: "" } }]);
      setSelectedId(id);
      return id;
    },
    [map, takenIds, setAreas, effectiveAreas],
  );

  const patchArea = useCallback(
    (id: string, partial: Partial<SoundArea>) =>
      setAreas(effectiveAreas.map((a) => (a.id === id ? { ...a, ...partial } : a))),
    [setAreas, effectiveAreas],
  );

  const patchBed = useCallback(
    (id: string, partial: Partial<SoundBed>) => {
      const cur = effectiveAreas.find((a) => a.id === id);
      if (cur) patchArea(id, { bed: { ...cur.bed, ...partial } });
    },
    [effectiveAreas, patchArea],
  );

  const setVisibility = useCallback(
    (id: string, v: EntityVisibility) => patchArea(id, { visibility: v }),
    [patchArea],
  );

  const setEnabled = useCallback(
    (b: boolean) => commit({ ...effective, enabled: b }),
    [commit, effective],
  );

  const setMasterGain = useCallback(
    (g: number) => commit({ ...effective, masterGain: g }),
    [commit, effective],
  );

  /** Put the map's saved soundscape back: drop it from the override, so an
   *  untouched map counts as unchanged (one undo entry). */
  const reset = useCallback(() => {
    if (map) unpatch("soundscape");
    setSelectedId(null);
    cancelDraw();
  }, [map, unpatch, cancelDraw]);

  const remove = useCallback(
    (id: string) => {
      setAreas(effectiveAreas.filter((a) => a.id !== id));
      setSelectedId((s) => (s === id ? null : s));
    },
    [setAreas, effectiveAreas],
  );

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
    effective,
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
