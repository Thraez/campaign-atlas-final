import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MapDocument, MapLayer } from "@/atlas/content/schema";
import type { UndoStackAPI } from "@/atlas/useUndoStack";

/** A layer authored locally in the editor. Either a freshly uploaded image
 *  (object URL preview) or a URL/path the user typed. */
export interface LocalLayer extends MapLayer {
  /** "upload" = comes from a File the user dragged in (preview only),
   *  "url"    = external/URL or local path the user typed,
   *  "edit"   = a copy/override of a layer that already exists in world.yaml. */
  origin: "upload" | "url" | "edit";
  name?: string;
  locked?: boolean;
  /** For uploads: original filename + suggested target path on disk. */
  filename?: string;
  targetPath?: string;
  /** True for object URLs we own and need to revoke. */
  isObjectUrl?: boolean;
  /** Cached image bytes (data URL) so a refresh of /atlas/edit can still preview
   *  the upload — object URLs do NOT survive a reload. */
  dataUrl?: string;
}

const STORAGE_KEY = "atlas-local-map-layers-v1";

interface Stored {
  // mapId -> layers (object URLs are NOT persisted; we strip them on save)
  [mapId: string]: LocalLayer[];
}

function loadStored(): Stored {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Stored;
    // For uploads, we persist a dataUrl rather than the (now-dead) object URL.
    // Restore src from dataUrl so previews survive a page reload.
    for (const m of Object.keys(parsed)) {
      parsed[m] = parsed[m].map((l) => l.dataUrl ? { ...l, src: l.dataUrl, isObjectUrl: false } : l);
    }
    return parsed;
  } catch { return {}; }
}

function safeFilename(name: string): string {
  return name
    .toLowerCase()
    .replace(/\.[^.]+$/, (ext) => ext) // keep extension
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function readImageSize(src: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => reject(new Error("image load failed"));
    img.src = src;
  });
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error ?? new Error("read failed"));
    r.readAsDataURL(file);
  });
}

/**
 * Manages per-map local layer overrides (uploads, URL adds, edits of built-in
 * layers). When an `undoStack` is supplied, every mutation pushes a
 * snapshot-based undo entry so Cmd+Z reverts the geometry change.
 *
 * The hook keeps a synchronous `byMapRef` mirror of the latest state. Mutation
 * helpers compute the next state explicitly (before/after) rather than using
 * an updater function — this lets undo capture the exact pair without
 * relying on React batching timing.
 */
export function useMapLayers(map: MapDocument | undefined, undoStack?: UndoStackAPI) {
  const [byMap, setByMap] = useState<Stored>(() => loadStored());
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const byMapRef = useRef(byMap);
  useEffect(() => { byMapRef.current = byMap; }, [byMap]);

  /** Bypass-undo setter used by undo/redo callbacks themselves. */
  const applyByMap = useCallback((next: Stored) => {
    byMapRef.current = next;
    setByMap(next);
  }, []);

  /** Snapshot-driven mutation: computes the next state explicitly so undo can
   *  pair before/after without depending on React state batching. */
  const mutateByMap = useCallback((compute: (prev: Stored) => Stored, label: string) => {
    const before = byMapRef.current;
    const after = compute(before);
    if (after === before) return;
    applyByMap(after);
    if (undoStack) {
      undoStack.push({
        undo: () => applyByMap(before),
        redo: () => applyByMap(after),
        label,
      });
    }
  }, [applyByMap, undoStack]);

  // Persist. Uploads now carry a dataUrl (set when the user uploaded the file)
  // so previews survive a reload. Object URLs are still stripped — they're dead
  // after refresh anyway, dataUrl takes their place.
  useEffect(() => {
    const persisted: Stored = {};
    for (const [m, layers] of Object.entries(byMap)) {
      persisted[m] = layers.map((l) => {
        const copy = { ...l };
        if (copy.isObjectUrl) {
          // src is an object URL — replace with dataUrl (if we have one) so the
          // entry can survive a reload, or strip src entirely if we don't.
          if (copy.dataUrl) copy.src = copy.dataUrl;
          else return null;
        }
        return copy;
      }).filter(Boolean) as LocalLayer[];
    }
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(persisted)); }
    catch { /* quota — skip */ }
  }, [byMap]);

  const localLayers = useMemo<LocalLayer[]>(
    () => (map ? byMap[map.id] ?? [] : []),
    [byMap, map]
  );

  const mergedLayers = useMemo<MapLayer[]>(() => {
    if (!map) return [];
    // Local "edit" entries override built-in by id; "upload"/"url" are added.
    const overriddenIds = new Set(localLayers.filter((l) => l.origin === "edit").map((l) => l.id));
    const base = map.layers.filter((l) => !overriddenIds.has(l.id));
    return [...base, ...localLayers].sort((a, b) => a.zIndex - b.zIndex);
  }, [map, localLayers]);

  const addUploaded = useCallback(async (files: File[]) => {
    if (!map) return;
    const additions: LocalLayer[] = await Promise.all(files.map(async (file, i) => {
      const url = URL.createObjectURL(file);
      const id = `upload-${Date.now()}-${i}-${safeFilename(file.name).slice(0, 24)}`;
      const sf = safeFilename(file.name);
      // Sniff natural size so the layer doesn't default to "stretch over the whole map".
      const dims = await readImageSize(url).catch(() => null);
      const dataUrl = await fileToDataUrl(file).catch(() => undefined);
      return {
        id,
        src: url,
        x: 0,
        y: 0,
        width: dims?.w ?? map.width,
        height: dims?.h ?? map.height,
        opacity: 1,
        zIndex: (map.layers.length + i + 1) * 10,
        origin: "upload",
        name: file.name,
        filename: file.name,
        targetPath: `public/atlas/assets/maps/${sf}`,
        isObjectUrl: true,
        dataUrl,
      };
    }));
    mutateByMap((s) => ({ ...s, [map.id]: [...(s[map.id] ?? []), ...additions] }), "add uploaded layers");
    if (additions[0]) setSelectedId(additions[0].id);
  }, [map, mutateByMap]);

  const addUrl = useCallback(async (src: string) => {
    if (!map || !src.trim()) return;
    const trimmed = src.trim();
    const id = `url-${Date.now()}`;
    const dims = await readImageSize(trimmed).catch(() => null);
    const existing = byMapRef.current[map.id] ?? [];
    const additions: LocalLayer = {
      id,
      src: trimmed,
      x: 0,
      y: 0,
      width: dims?.w ?? map.width,
      height: dims?.h ?? map.height,
      opacity: 1,
      zIndex: (map.layers.length + existing.length + 1) * 10,
      origin: "url",
      name: trimmed.split("/").pop() ?? trimmed,
    };
    mutateByMap((s) => ({ ...s, [map.id]: [...(s[map.id] ?? []), additions] }), "add URL layer");
    setSelectedId(id);
    if (!dims) {
      // Caller (UI) can show a toast; we still add the layer so the user can fix the URL.
    }
  }, [map, mutateByMap]);

  const duplicateLayer = useCallback((id: string) => {
    if (!map) return;
    const src = (byMapRef.current[map.id] ?? []).find((l) => l.id === id)
      ?? (map.layers.find((l) => l.id === id) ? { ...map.layers.find((l) => l.id === id)!, origin: "edit" as const } : null);
    if (!src) return;
    const newId = `${src.id}-copy-${Date.now().toString(36).slice(-4)}`;
    const dup: LocalLayer = { ...src, id: newId, x: src.x + 200, y: src.y + 200, zIndex: src.zIndex + 1, origin: "upload" === src.origin ? "upload" : (src as LocalLayer).origin ?? "edit" };
    mutateByMap((s) => ({ ...s, [map.id]: [...(s[map.id] ?? []), dup] }), `duplicate layer ${id}`);
    setSelectedId(newId);
  }, [map, mutateByMap]);

  const editBuiltinLayer = useCallback((layerId: string) => {
    if (!map) return;
    const builtin = map.layers.find((l) => l.id === layerId);
    if (!builtin) return;
    mutateByMap((s) => {
      const cur = s[map.id] ?? [];
      if (cur.some((l) => l.id === layerId)) return s;
      return { ...s, [map.id]: [...cur, { ...builtin, origin: "edit" }] };
    }, `edit built-in layer ${layerId}`);
    setSelectedId(layerId);
  }, [map, mutateByMap]);

  const updateLayer = useCallback((id: string, patch: Partial<MapLayer>) => {
    if (!map) return;
    mutateByMap((s) => {
      const cur = s[map.id] ?? [];
      const next = cur.map((l) => (l.id === id ? { ...l, ...patch } : l));
      // No-op if nothing actually changed — avoid recording empty undo entries
      // when the user clicks a no-op nudge step.
      if (next === cur || cur.every((l, i) => l === next[i])) return s;
      return { ...s, [map.id]: next };
    }, `update layer ${id}`);
  }, [map, mutateByMap]);

  const removeLayer = useCallback((id: string) => {
    if (!map) return;
    mutateByMap((s) => {
      const cur = s[map.id] ?? [];
      const target = cur.find((l) => l.id === id);
      if (!target) return s;
      if (target.isObjectUrl) URL.revokeObjectURL(target.src);
      return { ...s, [map.id]: cur.filter((l) => l.id !== id) };
    }, `remove layer ${id}`);
    setSelectedId((s) => (s === id ? null : s));
  }, [map, mutateByMap]);

  const clearForMap = useCallback(() => {
    if (!map) return;
    mutateByMap((s) => {
      const cur = s[map.id] ?? [];
      if (cur.length === 0) return s;
      cur.forEach((l) => l.isObjectUrl && URL.revokeObjectURL(l.src));
      return { ...s, [map.id]: [] };
    }, "clear local layers (this map)");
    setSelectedId(null);
  }, [map, mutateByMap]);

  const clearAll = useCallback(() => {
    mutateByMap((s) => {
      const empty: Stored = {};
      const hadAny = Object.keys(s).length > 0;
      if (!hadAny) return s;
      Object.values(s).forEach((arr) => arr.forEach((l) => l.isObjectUrl && URL.revokeObjectURL(l.src)));
      return empty;
    }, "clear all local layers");
    setSelectedId(null);
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* noop */ }
  }, [mutateByMap]);

  /**
   * Phase 1B B0 — full-state snapshot, for the save-boundary undo entry.
   * The editor captures this before the post-save cleanup so undo across
   * a save restores the dirty local-layer drafts.
   */
  const snapshot = useCallback((): Stored => byMapRef.current, []);

  /** Restore a snapshot WITHOUT recording an undo entry. The save-boundary
   *  entry orchestrates its own undo/redo pair; this is its setter. */
  const applySnapshot = useCallback((snap: Stored) => {
    applyByMap(snap);
  }, [applyByMap]);

  return {
    localLayers,
    mergedLayers,
    selectedId,
    setSelectedId,
    addUploaded,
    addUrl,
    editBuiltinLayer,
    updateLayer,
    duplicateLayer,
    removeLayer,
    clearForMap,
    clearAll,
    snapshot,
    applySnapshot,
  };
}
