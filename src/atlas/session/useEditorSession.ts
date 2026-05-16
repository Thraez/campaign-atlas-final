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
  serializeSession, deserializeSession, sessionHasWork,
  type SessionState,
} from "./sessionSnapshot";

export const SESSION_IDB_KEY = "editor-session-v1";
const PERSIST_DEBOUNCE_MS = 300;

export type SaveLifecycle = "clean" | "unsaved" | "saving" | "saved" | "failed";

type Holder<T> = { snapshot: () => T; applySnapshot: (s: T) => void };

export interface EditorSessionArgs {
  activeMapId: string | null;
  undoStack: Pick<UndoStackAPI, "clear">;
  holders: {
    overrides: { get: () => SessionState["overrides"]; set: (o: SessionState["overrides"]) => void };
    mapOverride: { get: () => Record<string, unknown>; set: (m: Record<string, unknown>) => void };
    region: Holder<unknown>;
    route: Holder<unknown>;
    fog: Holder<unknown>;
    layer: Holder<unknown>;
  };
  /** Sum of every holder's change count for the active map (honest, undo-aware). */
  perMapDirtyCount: () => number;
}

export interface EditorSessionAPI {
  hydrated: boolean;
  status: SaveLifecycle;
  unsavedCount: number;
  failedReason: string | null;
  /** Non-null exactly once after a reload that recovered real work. */
  restoredNotice: { savedAt: number } | null;
  dismissRestoredNotice: () => void;
  /** Call when activeMapId is about to change (before React swaps it). */
  onMapWillChange: (nextMapId: string | null) => void;
  markSaving: () => void;
  markSaved: () => Promise<void>;
  markFailed: (reason: string) => void;
  discardAll: () => Promise<void>;
}

export function useEditorSession(args: EditorSessionArgs): EditorSessionAPI {
  const { activeMapId, undoStack, holders, perMapDirtyCount } = args;

  // Per-map slices live in a ref (synchronous, not render state).
  const slicesRef = useRef<SessionState>({
    overrides: {}, mapOverrideByMap: {}, regionByMap: {},
    routeByMap: {}, fogByMap: {}, layerByMap: {}, savedAt: Date.now(),
  });
  const [hydrated, setHydrated] = useState(false);
  const [status, setStatus] = useState<SaveLifecycle>("clean");
  const [failedReason, setFailedReason] = useState<string | null>(null);
  const [restoredNotice, setRestoredNotice] = useState<{ savedAt: number } | null>(null);
  const mapRef = useRef(activeMapId);

  // ---- collect / apply the active map's holder slices ----
  const collectActiveInto = useCallback((s: SessionState, mapId: string | null) => {
    s.overrides = holders.overrides.get();
    // layer.snapshot() returns the full byMap store — assign wholesale, not per-key
    s.layerByMap = holders.layer.snapshot() as never;
    const mo = holders.mapOverride.get();
    s.mapOverrideByMap = mo as never;
    if (!mapId) return;
    s.regionByMap[mapId] = holders.region.snapshot() as never;
    s.routeByMap[mapId] = holders.route.snapshot() as never;
    s.fogByMap[mapId] = holders.fog.snapshot() as never;
  }, [holders]);

  const applyActiveFrom = useCallback((s: SessionState, mapId: string | null) => {
    holders.overrides.set(s.overrides);
    holders.mapOverride.set(s.mapOverrideByMap as never);
    // layer.applySnapshot() expects the full byMap store
    holders.layer.applySnapshot(s.layerByMap as never);
    if (!mapId) return;
    holders.region.applySnapshot((s.regionByMap[mapId] ?? { edits: {}, added: [], deleted: [] }) as never);
    holders.route.applySnapshot((s.routeByMap[mapId] ?? { edits: {}, added: [], deleted: [] }) as never);
    holders.fog.applySnapshot((s.fogByMap[mapId] ?? null) as never);
  }, [holders]);

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
      }
      setHydrated(true);
    })();
    return () => { alive = false; };
    // mount-only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- non-destructive map switch ----
  const onMapWillChange = useCallback((nextMapId: string | null) => {
    const cur = mapRef.current;
    collectActiveInto(slicesRef.current, cur);          // save outgoing
    mapRef.current = nextMapId;
    applyActiveFrom(slicesRef.current, nextMapId);       // restore incoming
  }, [collectActiveInto, applyActiveFrom]);

  useEffect(() => {
    if (activeMapId !== mapRef.current) onMapWillChange(activeMapId);
  }, [activeMapId, onMapWillChange]);

  // ---- derived count + status (recomputed each render) ----
  const unsavedCount = perMapDirtyCount();
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
  const markSaving = useCallback(() => { setFailedReason(null); setStatus("saving"); }, []);
  const markFailed = useCallback((reason: string) => { setFailedReason(reason); setStatus("failed"); }, []);
  const markSaved = useCallback(async () => {
    slicesRef.current = {
      overrides: {}, mapOverrideByMap: {}, regionByMap: {},
      routeByMap: {}, fogByMap: {}, layerByMap: {}, savedAt: Date.now(),
    };
    await idbDelete(SESSION_IDB_KEY);
    setRestoredNotice(null);
    setStatus("saved");
  }, []);
  const discardAll = useCallback(async () => {
    applyActiveFrom({
      overrides: {}, mapOverrideByMap: {}, regionByMap: {},
      routeByMap: {}, fogByMap: {}, layerByMap: {}, savedAt: Date.now(),
    }, mapRef.current);
    slicesRef.current = {
      overrides: {}, mapOverrideByMap: {}, regionByMap: {},
      routeByMap: {}, fogByMap: {}, layerByMap: {}, savedAt: Date.now(),
    };
    undoStack.clear();
    await idbDelete(SESSION_IDB_KEY);
    setRestoredNotice(null);
    setStatus("clean");
  }, [applyActiveFrom, undoStack]);

  return {
    hydrated, status, unsavedCount, failedReason,
    restoredNotice, dismissRestoredNotice,
    onMapWillChange, markSaving, markSaved, markFailed, discardAll,
  };
}
