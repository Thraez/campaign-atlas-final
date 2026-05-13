import { useCallback, useEffect, useMemo, useState } from "react";
import type { MapDocument, MapLayer } from "@/atlas/content/schema";

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
    return JSON.parse(raw) as Stored;
  } catch { return {}; }
}

function safeFilename(name: string): string {
  return name
    .toLowerCase()
    .replace(/\.[^.]+$/, (ext) => ext) // keep extension
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function useMapLayers(map: MapDocument | undefined) {
  const [byMap, setByMap] = useState<Stored>(() => loadStored());
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Persist (without object URLs — those don't survive a reload anyway).
  useEffect(() => {
    const persisted: Stored = {};
    for (const [m, layers] of Object.entries(byMap)) {
      persisted[m] = layers
        .filter((l) => !l.isObjectUrl)
        .map((l) => ({ ...l }));
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(persisted));
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

  const setLayers = useCallback((updater: (prev: LocalLayer[]) => LocalLayer[]) => {
    if (!map) return;
    setByMap((s) => ({ ...s, [map.id]: updater(s[map.id] ?? []) }));
  }, [map]);

  const addUploaded = useCallback((files: File[]) => {
    if (!map) return;
    const additions: LocalLayer[] = files.map((file, i) => {
      const url = URL.createObjectURL(file);
      const id = `upload-${Date.now()}-${i}-${safeFilename(file.name).slice(0, 24)}`;
      const sf = safeFilename(file.name);
      return {
        id,
        src: url,
        x: 0,
        y: 0,
        width: map.width,
        height: map.height,
        opacity: 1,
        zIndex: (map.layers.length + i + 1) * 10,
        origin: "upload",
        filename: file.name,
        targetPath: `public/atlas/assets/maps/${sf}`,
        isObjectUrl: true,
      };
    });
    setLayers((prev) => [...prev, ...additions]);
    if (additions[0]) setSelectedId(additions[0].id);
  }, [map, setLayers]);

  const addUrl = useCallback((src: string) => {
    if (!map || !src.trim()) return;
    const id = `url-${Date.now()}`;
    setLayers((prev) => [...prev, {
      id,
      src: src.trim(),
      x: 0,
      y: 0,
      width: map.width,
      height: map.height,
      opacity: 1,
      zIndex: (map.layers.length + prev.length + 1) * 10,
      origin: /^(https?:|data:)/i.test(src.trim()) ? "url" : "url",
    }]);
    setSelectedId(id);
  }, [map, setLayers]);

  const editBuiltinLayer = useCallback((layerId: string) => {
    if (!map) return;
    const builtin = map.layers.find((l) => l.id === layerId);
    if (!builtin) return;
    setLayers((prev) => {
      if (prev.some((l) => l.id === layerId)) return prev;
      return [...prev, { ...builtin, origin: "edit" }];
    });
    setSelectedId(layerId);
  }, [map, setLayers]);

  const updateLayer = useCallback((id: string, patch: Partial<MapLayer>) => {
    setLayers((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  }, [setLayers]);

  const removeLayer = useCallback((id: string) => {
    setLayers((prev) => {
      const target = prev.find((l) => l.id === id);
      if (target?.isObjectUrl) URL.revokeObjectURL(target.src);
      return prev.filter((l) => l.id !== id);
    });
    setSelectedId((s) => (s === id ? null : s));
  }, [setLayers]);

  const clearForMap = useCallback(() => {
    setLayers((prev) => {
      prev.forEach((l) => l.isObjectUrl && URL.revokeObjectURL(l.src));
      return [];
    });
    setSelectedId(null);
  }, [setLayers]);

  return {
    localLayers,
    mergedLayers,
    selectedId,
    setSelectedId,
    addUploaded,
    addUrl,
    editBuiltinLayer,
    updateLayer,
    removeLayer,
    clearForMap,
  };
}
