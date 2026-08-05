import { useEffect, useRef } from "react";
import { useMap } from "react-leaflet";
import type { MapScale } from "@/atlas/content/schema";
import { niceScaleNumber } from "./scaleBarUtils";

export interface ScaleBarState {
  barWidth: number;
  label: string;
}

/**
 * Mounts inside <MapContainer>. Listens to zoomend and calls onChange with
 * the computed bar width (px) and label. Returns null — the visual is
 * rendered outside the MapContainer by the caller.
 */
export function ScaleBarController({
  scale,
  onChange,
}: {
  scale: MapScale | undefined;
  onChange: (state: ScaleBarState | null) => void;
}) {
  const map = useMap();

  // Keep onChange in a ref so the event handler is never stale without
  // adding onChange to the effect's dep array (mirrors RulerLayer pattern).
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });

  useEffect(() => {
    if (!scale || scale.unitsPerPixel <= 0) {
      onChangeRef.current(null);
      return;
    }

    const TARGET_PX = 80;

    const compute = () => {
      const size = map.getSize();
      const p1 = map.containerPointToLatLng([0, size.y / 2]);
      const p2 = map.containerPointToLatLng([TARGET_PX, size.y / 2]);
      const rawMapPx = Math.abs(p2.lng - p1.lng);
      if (rawMapPx <= 0) return;
      const rawDist = rawMapPx * scale.unitsPerPixel;
      const niceDist = niceScaleNumber(rawDist);
      const barPx = (niceDist / rawDist) * TARGET_PX;
      const niceFmt = niceDist >= 1 ? String(Math.round(niceDist)) : niceDist.toPrecision(1);
      onChangeRef.current({ barWidth: barPx, label: `${niceFmt} ${scale.unitLabel}` });
    };

    compute();
    map.on("zoomend", compute);
    return () => {
      map.off("zoomend", compute);
    };
  }, [map, scale]);

  return null;
}
