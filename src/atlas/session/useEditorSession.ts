/**
 * The single editor-session coordinator.
 *
 * Owns per-map slices for every draft holder, persists ONE versioned blob to
 * IndexedDB on a debounce, rehydrates on mount (raising a one-shot restore
 * notice when the snapshot represents real work), drives non-destructive
 * map switching by snapshotting the outgoing map and applying the incoming
 * map's slice, and derives the single save status + honest unsaved count.
 *
 * Holders keep their existing public APIs; this hook only uses each holder's
 * snapshot()/applySnapshot() seam plus a perMapDirtyCount() probe.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { UndoStackAPI } from "@/atlas/useUndoStack";
import { idbGet, idbSet, idbDelete } from "./idbStore";
import {
  serializeSession,
  deserializeSession,
  sessionHasWork,
  type CalendarDraft,
  type SessionState,
} from "./sessionSnapshot";
import type { EntityEditSnapshot } from "@/atlas/categories/useEntityEditDraft";

export const SESSION_IDB_KEY = "editor-session-v1";
const PERSIST_DEBOUNCE_MS = 300;

export type SaveLifecycle = "clean" | "unsaved" | "saving" | "saved" | "failed";

type Holder<T> = { snapshot: () => T; applySnapshot: (s: T) => void };

/** The region/route/fog drafts the session swaps in and out per map. */
export interface MapSlices {
  region: SessionState["regionByMap"][string];
  route: SessionState["routeByMap"][string];
  fog: SessionState["fogByMap"][string];
}

const EMPTY_COLLECTION = { edits: {}, added: [], deleted: [] };

/** A session with no drafts in any holder. */
function emptySession(): SessionState {
  return {
    overrides: {},
    mapOverrideByMap: {},
    regionByMap: {},
    routeByMap: {},
    fogByMap: {},
    layerByMap: {},
    worldOverride: {},
    calendar: null,
    entityEdit: null,
    savedAt: Date.now(),
  };
}

export function slicesDirtyCount(sl: Partial<MapSlices>): number {
  const n = (d?: { edits: object; added: unknown[]; deleted: unknown[] }) =>
    d ? Object.keys(d.edits).length + d.added.length + d.deleted.length : 0;
  return n(sl.region) + n(sl.route) + (sl.fog ? 1 : 0);
}

/** Region/route/fog changes parked on every map except `activeMapId`. With
 *  `projectMapIds`, drafts kept for a map the project no longer has (renamed or
 *  removed) are left out: nothing can save or clear them. */
export function otherMapsCount(
  s: Pick<SessionState, "regionByMap" | "routeByMap" | "fogByMap">,
  activeMapId: string | null,
  projectMapIds?: readonly string[],
): number {
  const ids = new Set([
    ...Object.keys(s.regionByMap),
    ...Object.keys(s.routeByMap),
    ...Object.keys(s.fogByMap),
  ]);
  let n = 0;
  for (const id of ids) {
    if (id === activeMapId) continue;
    if (projectMapIds && !projectMapIds.includes(id)) continue;
    n += slicesDirtyCount({
      region: s.regionByMap[id],
      route: s.routeByMap[id],
      fog: s.fogByMap[id],
    });
  }
  return n;
}

export interface EditorSessionArgs {
  activeMapId: string | null;
  /** The project's maps. Drafts kept for any other id (an orphan) are not
   *  counted as unsaved; they are kept, not deleted. Omitted: count them all. */
  projectMapIds?: readonly string[];
  undoStack: Pick<UndoStackAPI, "clear">;
  holders: {
    overrides: {
      get: () => SessionState["overrides"];
      set: (o: SessionState["overrides"]) => void;
    };
    mapOverride: { get: () => Record<string, unknown>; set: (m: Record<string, unknown>) => void };
    region: Holder<unknown>;
    route: Holder<unknown>;
    fog: Holder<unknown>;
    layer: Holder<unknown>;
    editorEntity: { get: () => EntityEditSnapshot; set: (v: EntityEditSnapshot) => void };
    world: {
      get: () => SessionState["worldOverride"];
      set: (w: SessionState["worldOverride"]) => void;
    };
    calendar: { get: () => CalendarDraft; set: (c: CalendarDraft) => void };
  };
  /** Sum of every holder's change count that is not a swapped region/route/fog
   *  slice: the active map's region/route/fog plus everything kept for all maps
   *  at once (pins, layers, map metadata, world settings). The session adds the
   *  other maps' region/route/fog slices itself. */
  perMapDirtyCount: () => number;
}

export interface EditorSessionAPI {
  hydrated: boolean;
  status: SaveLifecycle;
  /** The one unsaved count across every map: drives the chip, beforeunload
   *  and whether Save writes world.yaml. */
  unsavedCount: number;
  /** Region/route/fog changes parked on maps other than the active one. */
  otherMapsDirtyCount: number;
  /** Every map's region/route/fog drafts, the active map's read live. */
  mapDrafts: () => Record<string, MapSlices>;
  /** Put back other maps' drafts (the save-boundary undo). The active map's
   *  entry, if any, is ignored: its holders are restored by the caller. */
  restoreOtherMapDrafts: (drafts: Record<string, MapSlices>) => void;
  failedReason: string | null;
  /** Non-null exactly once after a reload that recovered real work. */
  restoredNotice: { savedAt: number } | null;
  dismissRestoredNotice: () => void;
  /** Call when activeMapId is about to change (before React swaps it).
   *  Returns false (and does nothing) when `nextMapId` is already active. */
  onMapWillChange: (nextMapId: string | null) => boolean;
  markSaving: () => void;
  /** A save landed. `writtenMapIds`: the maps whose region/route/fog drafts it
   *  wrote (every map when world.yaml was in the batch, none otherwise); only
   *  their parked slices are dropped. */
  markSaved: (writtenMapIds?: readonly string[]) => Promise<void>;
  markFailed: (reason: string) => void;
  /** Drop a non-terminal "saving"/"failed" status back to the true dirty
   *  state (unsaved/clean). Used when the DM cancels the save-review modal:
   *  no write happened, so "saving" must not stick. Not a failure path. */
  markIdle: () => void;
  discardAll: () => Promise<void>;
}

export function useEditorSession(args: EditorSessionArgs): EditorSessionAPI {
  const { activeMapId, undoStack, holders, perMapDirtyCount, projectMapIds } = args;

  // Per-map slices live in a ref (synchronous, not render state).
  const slicesRef = useRef<SessionState>(emptySession());
  const [hydrated, setHydrated] = useState(false);
  const [status, setStatus] = useState<SaveLifecycle>("clean");
  const [failedReason, setFailedReason] = useState<string | null>(null);
  const [restoredNotice, setRestoredNotice] = useState<{ savedAt: number } | null>(null);
  const mapRef = useRef(activeMapId);
  // Mirrors otherMapsCount(slicesRef.current, mapRef.current); refreshed at
  // every point the parked slices or the active map change.
  const [otherMapsDirtyCount, setOtherMapsDirtyCount] = useState(0);
  const projectMapIdsRef = useRef(projectMapIds);
  const refreshOtherMaps = useCallback(
    () =>
      setOtherMapsDirtyCount(
        otherMapsCount(slicesRef.current, mapRef.current, projectMapIdsRef.current),
      ),
    [],
  );
  // The project's map list arrives (or changes) after mount: recount.
  const projectMapIdsKey = projectMapIds?.join("\n");
  useEffect(() => {
    projectMapIdsRef.current = projectMapIds;
    refreshOtherMaps();
    // projectMapIdsKey stands for projectMapIds' contents.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectMapIdsKey, refreshOtherMaps]);

  // ---- collect / apply the active map's holder slices ----
  const collectActiveInto = useCallback(
    (s: SessionState, mapId: string | null) => {
      s.overrides = holders.overrides.get();
      // layer.snapshot() returns the full byMap store — assign wholesale, not per-key
      s.layerByMap = holders.layer.snapshot() as never;
      const mo = holders.mapOverride.get();
      s.mapOverrideByMap = mo as never;
      s.entityEdit = holders.editorEntity.get();
      s.worldOverride = holders.world.get();
      s.calendar = holders.calendar.get();
      if (!mapId) return;
      s.regionByMap[mapId] = holders.region.snapshot() as never;
      s.routeByMap[mapId] = holders.route.snapshot() as never;
      s.fogByMap[mapId] = holders.fog.snapshot() as never;
    },
    [holders],
  );

  const applyActiveFrom = useCallback(
    (s: SessionState, mapId: string | null) => {
      holders.overrides.set(s.overrides);
      holders.mapOverride.set(s.mapOverrideByMap as never);
      // layer.applySnapshot() expects the full byMap store
      holders.layer.applySnapshot(s.layerByMap as never);
      holders.editorEntity.set(s.entityEdit);
      holders.world.set(s.worldOverride);
      holders.calendar.set(s.calendar);
      if (!mapId) return;
      holders.region.applySnapshot(
        (s.regionByMap[mapId] ?? { edits: {}, added: [], deleted: [] }) as never,
      );
      holders.route.applySnapshot(
        (s.routeByMap[mapId] ?? { edits: {}, added: [], deleted: [] }) as never,
      );
      holders.fog.applySnapshot((s.fogByMap[mapId] ?? null) as never);
    },
    [holders],
  );

  // ---- mount hydrate + restore detection ----
  useEffect(() => {
    let alive = true;
    (async () => {
      const blob = await idbGet<unknown>(SESSION_IDB_KEY);
      if (!alive) return;
      const restored = blob ? deserializeSession(blob) : null;
      if (restored && sessionHasWork(restored)) {
        slicesRef.current = restored;
        applyActiveFrom(restored, mapRef.current);
        setRestoredNotice({ savedAt: restored.savedAt });
        refreshOtherMaps();
      }
      setHydrated(true);
    })();
    return () => {
      alive = false;
    };
    // mount-only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- non-destructive map switch ----
  const onMapWillChange = useCallback(
    (nextMapId: string | null) => {
      const cur = mapRef.current;
      if (nextMapId === cur) return false;
      collectActiveInto(slicesRef.current, cur); // save outgoing
      mapRef.current = nextMapId;
      applyActiveFrom(slicesRef.current, nextMapId); // restore incoming
      refreshOtherMaps();
      return true;
    },
    [collectActiveInto, applyActiveFrom, refreshOtherMaps],
  );

  useEffect(() => {
    if (activeMapId !== mapRef.current) onMapWillChange(activeMapId);
  }, [activeMapId, onMapWillChange]);

  // ---- derived count + status (recomputed each render) ----
  const unsavedCount = perMapDirtyCount() + otherMapsDirtyCount;
  useEffect(() => {
    if (!hydrated) return;
    setStatus((prev) => {
      if (prev === "saving" || prev === "failed") return prev;
      if (prev === "saved" && unsavedCount === 0) return prev; // hold "saved" until next edit
      return unsavedCount > 0 ? "unsaved" : "clean";
    });
  }, [unsavedCount, hydrated]);

  // ---- debounced persist ----
  useEffect(() => {
    if (!hydrated) return;
    const t = window.setTimeout(() => {
      const s = slicesRef.current;
      collectActiveInto(s, mapRef.current);
      s.savedAt = Date.now();
      if (sessionHasWork(s)) void idbSet(SESSION_IDB_KEY, serializeSession(s));
      else void idbDelete(SESSION_IDB_KEY);
    }, PERSIST_DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [unsavedCount, hydrated, collectActiveInto]);

  const dismissRestoredNotice = useCallback(() => setRestoredNotice(null), []);
  const markSaving = useCallback(() => {
    setFailedReason(null);
    setStatus("saving");
  }, []);
  const markFailed = useCallback((reason: string) => {
    setFailedReason(reason);
    setStatus("failed");
  }, []);
  // Recompute from the live dirty count rather than blindly setting "unsaved":
  // a cancelled save that had already cleared everything must land on "clean".
  const markIdle = useCallback(() => {
    setFailedReason(null);
    setStatus(perMapDirtyCount() + otherMapsDirtyCount > 0 ? "unsaved" : "clean");
  }, [perMapDirtyCount, otherMapsDirtyCount]);

  const mapDrafts = useCallback((): Record<string, MapSlices> => {
    const s = slicesRef.current;
    const out: Record<string, MapSlices> = {};
    const ids = new Set([
      ...Object.keys(s.regionByMap),
      ...Object.keys(s.routeByMap),
      ...Object.keys(s.fogByMap),
    ]);
    for (const id of ids) {
      out[id] = {
        region: s.regionByMap[id] ?? EMPTY_COLLECTION,
        route: s.routeByMap[id] ?? EMPTY_COLLECTION,
        fog: s.fogByMap[id] ?? null,
      };
    }
    const active = mapRef.current;
    if (active) {
      out[active] = {
        region: holders.region.snapshot() as MapSlices["region"],
        route: holders.route.snapshot() as MapSlices["route"],
        fog: holders.fog.snapshot() as MapSlices["fog"],
      };
    }
    return out;
  }, [holders]);

  const restoreOtherMapDrafts = useCallback(
    (drafts: Record<string, MapSlices>) => {
      const s = slicesRef.current;
      let restored = 0;
      for (const [id, d] of Object.entries(drafts)) {
        if (id === mapRef.current) continue;
        s.regionByMap[id] = d.region;
        s.routeByMap[id] = d.route;
        s.fogByMap[id] = d.fog;
        restored += slicesDirtyCount(d);
      }
      refreshOtherMaps();
      if (restored > 0)
        setStatus((prev) => (prev === "saved" || prev === "clean" ? "unsaved" : prev));
    },
    [refreshOtherMaps],
  );

  const markSaved = useCallback(
    async (writtenMapIds: readonly string[] = []) => {
      // Only the written maps' parked slices are clean now; every other map
      // keeps its draft. The active map's holders are cleared by the caller.
      const prev = slicesRef.current;
      const keep = <V>(byMap: Record<string, V>): Record<string, V> =>
        Object.fromEntries(Object.entries(byMap).filter(([id]) => !writtenMapIds.includes(id)));
      slicesRef.current = {
        ...emptySession(),
        regionByMap: keep(prev.regionByMap),
        routeByMap: keep(prev.routeByMap),
        fogByMap: keep(prev.fogByMap),
      };
      refreshOtherMaps();
      await idbDelete(SESSION_IDB_KEY);
      setRestoredNotice(null);
      setStatus("saved");
    },
    [refreshOtherMaps],
  );
  const discardAll = useCallback(async () => {
    slicesRef.current = emptySession();
    applyActiveFrom(slicesRef.current, mapRef.current);
    refreshOtherMaps();
    undoStack.clear();
    await idbDelete(SESSION_IDB_KEY);
    setRestoredNotice(null);
    setStatus("clean");
  }, [applyActiveFrom, undoStack, refreshOtherMaps]);

  return {
    hydrated,
    status,
    unsavedCount,
    otherMapsDirtyCount,
    mapDrafts,
    restoreOtherMapDrafts,
    failedReason,
    restoredNotice,
    dismissRestoredNotice,
    onMapWillChange,
    markSaving,
    markSaved,
    markFailed,
    markIdle,
    discardAll,
  };
}
