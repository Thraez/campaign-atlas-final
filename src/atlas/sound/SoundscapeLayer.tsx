import { useEffect, useMemo, useRef } from "react";
import { useMap } from "react-leaflet";
import type { MapDocument } from "@/atlas/content/schema";
import { prepareAreas, selectActiveBed, type PreparedArea } from "@/atlas/sound/resolveSoundscape";
import { readViewport, type LeafletViewLike } from "@/atlas/sound/readViewport";
import { useSoundSettings } from "@/atlas/sound/SoundSettingsProvider";

const DEBOUNCE_MS = 150;

/** Pure: read the current view and pick the active area id. Exported for tests. */
export function computeActiveId(
  prepared: PreparedArea[],
  map: LeafletViewLike,
  mapHeight: number,
  prevId: string | null,
): string | null {
  const { cx, cy, view } = readViewport(map, mapHeight);
  return selectActiveBed(prepared, cx, cy, view, prevId);
}

export function SoundscapeLayer({ map: mapDoc }: { map: MapDocument }) {
  const leaflet = useMap();
  const { soundEnabled, engine } = useSoundSettings();
  const prepared = useMemo(() => prepareAreas(mapDoc), [mapDoc]);
  const activeId = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (mapDoc.soundscape?.enabled === false) return;
    engine.setMasterGain(mapDoc.soundscape?.masterGain ?? 0.6);
  }, [engine, mapDoc.soundscape?.enabled, mapDoc.soundscape?.masterGain]);

  useEffect(() => {
    if (!soundEnabled || mapDoc.soundscape?.enabled === false || prepared.length === 0) return;

    const settle = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        const next = computeActiveId(prepared, leaflet as unknown as LeafletViewLike, mapDoc.height, activeId.current);
        if (next === activeId.current) return;
        activeId.current = next;
        void engine.crossfadeTo(prepared.find((a) => a.id === next) ?? null);
      }, DEBOUNCE_MS);
    };

    settle();
    leaflet.on("moveend", settle);
    leaflet.on("zoomend", settle);
    return () => {
      leaflet.off("moveend", settle);
      leaflet.off("zoomend", settle);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [leaflet, soundEnabled, prepared, engine, mapDoc.height, mapDoc.soundscape?.enabled]);

  // Stop sound when switching maps.
  useEffect(() => {
    return () => {
      activeId.current = null;
      void engine.crossfadeTo(null);
    };
  }, [engine, mapDoc.id]);

  return null;
}
