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
  const { soundEnabled, audioUnlocked, engine, setMapMasterGain, setAmbiencePlaying } =
    useSoundSettings();
  const prepared = useMemo(() => prepareAreas(mapDoc), [mapDoc]);
  const activeId = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (mapDoc.soundscape?.enabled === false) return;
    setMapMasterGain(mapDoc.soundscape?.masterGain ?? 0.6);
  }, [setMapMasterGain, mapDoc.soundscape?.enabled, mapDoc.soundscape?.masterGain]);

  useEffect(() => {
    // Before unlock there is no AudioContext and nothing can play, so don't
    // pick a bed (and don't claim one is playing) until the gesture arrives.
    if (
      !soundEnabled ||
      !audioUnlocked ||
      mapDoc.soundscape?.enabled === false ||
      prepared.length === 0
    )
      return;

    let cancelled = false;
    // The first settle of each run always reaches the engine, so the playing
    // state is reported again (crossfadeTo the bed already playing resolves
    // true at once, and to null stops a stale bed).
    let reported = false;
    const settle = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        const next = computeActiveId(
          prepared,
          leaflet as unknown as LeafletViewLike,
          mapDoc.height,
          activeId.current,
        );
        if (reported && next === activeId.current) return;
        reported = true;
        activeId.current = next;
        if (next === null) setAmbiencePlaying(false);
        // Announce playback only once the bed has really started.
        void engine.crossfadeTo(prepared.find((a) => a.id === next) ?? null).then((playing) => {
          if (!cancelled && activeId.current === next) setAmbiencePlaying(playing);
        });
      }, DEBOUNCE_MS);
    };

    settle();
    leaflet.on("moveend", settle);
    leaflet.on("zoomend", settle);
    return () => {
      cancelled = true;
      leaflet.off("moveend", settle);
      leaflet.off("zoomend", settle);
      if (timer.current) clearTimeout(timer.current);
      setAmbiencePlaying(false);
    };
  }, [
    leaflet,
    soundEnabled,
    audioUnlocked,
    prepared,
    engine,
    mapDoc.height,
    mapDoc.soundscape?.enabled,
    setAmbiencePlaying,
  ]);

  // Stop sound when switching maps.
  useEffect(() => {
    return () => {
      activeId.current = null;
      setAmbiencePlaying(false);
      void engine.crossfadeTo(null);
    };
  }, [engine, mapDoc.id, setAmbiencePlaying]);

  return null;
}
