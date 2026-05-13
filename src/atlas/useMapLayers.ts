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

export function useMapLayers(map: MapDocument | undefined) {
  const [byMap, setByMap] = useState<Stored>(() => loadStored());
  const [selectedId, setSelectedId] = useState<string | null>(null);

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

  const setLayers = useCallback((updater: (prev: LocalLayer[]) => LocalLayer[]) => {
    if (!map) return;
    setByMap((s) => ({ ...s, [map.id]: updater(s[map.id] ?? []) }));
  }, [map]);

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
    setLayers((prev) => [...prev, ...additions]);
    if (additions[0]) setSelectedId(additions[0].id);
  }, [map, setLayers]);

  const addUrl = useCallback(async (src: string) => {
    if (!map || !src.trim()) return;
    const trimmed = src.trim();
    const id = `url-${Date.now()}`;
    const dims = await readImageSize(trimmed).catch(() => null);
    setLayers((prev) => [...prev, {
      id,
      src: trimmed,
      x: 0,
      y: 0,
      width: dims?.w ?? map.width,
      height: dims?.h ?? map.height,
      opacity: 1,
      zIndex: (map.layers.length + prev.length + 1) * 10,
      origin: "url",
      name: trimmed.split("/").pop() ?? trimmed,
    }]);
    setSelectedId(id);
    if (!dims) {
      // Caller (UI) can show a toast; we still add the layer so the user can fix the URL.
    }
  }, [map, setLayers]);

  const duplicateLayer = useCallback((id: string) => {
    if (!map) return;
    const src = (byMap[map.id] ?? []).find((l) => l.id === id)
      ?? (map.layers.find((l) => l.id === id) ? { ...map.layers.find((l) => l.id === id)!, origin: "edit" as const } : null);
    if (!src) return;
    const newId = `${src.id}-copy-${Date.now().toString(36).slice(-4)}`;
    const dup: LocalLayer = { ...src, id: newId, x: src.x + 200, y: src.y + 200, zIndex: src.zIndex + 1, origin: "upload" === src.origin ? "upload" : (src as LocalLayer).origin ?? "edit" };
    setLayers((prev) => [...prev, dup]);
    setSelectedId(newId);
  }, [map, byMap, setLayers]);

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
