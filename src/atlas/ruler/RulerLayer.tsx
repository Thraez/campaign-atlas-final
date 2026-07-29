import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useMapEvents, useMap, CircleMarker, Polyline, Tooltip } from "react-leaflet";
import type { MapScale } from "@/atlas/content/schema";
import { mapClickToAtlasCoord } from "@/atlas/editor/mapClickCoord";
import { measureDistance } from "./measureDistance";

interface RulerLayerProps {
  active: boolean;
  mapId: string;
  mapHeight: number;
  scale?: MapScale;
  wrapX?: boolean;
  mapWidth?: number;
  onClear?: () => void;
}

type RulerPoints = null | { p1: { x: number; y: number }; p2?: { x: number; y: number } };

export function RulerLayer({
  active,
  mapId,
  mapHeight,
  scale,
  wrapX,
  mapWidth,
  onClear,
}: RulerLayerProps) {
  const [points, setPoints] = useState<RulerPoints>(null);
  const map = useMap();

  const prevActiveRef = useRef(active);
  useEffect(() => {
    if (!active && prevActiveRef.current) {
      setPoints(null);
    }
    prevActiveRef.current = active;
  }, [active]);

  // Switching the active map leaves stale points at meaningless coordinates
  // on the new map, so reset any in-progress measurement.
  const prevMapIdRef = useRef(mapId);
  useEffect(() => {
    if (prevMapIdRef.current !== mapId) {
      setPoints(null);
      prevMapIdRef.current = mapId;
    }
  }, [mapId]);

  // onClear ref so click handler doesn't become stale
  const onClearRef = useRef(onClear);
  useEffect(() => {
    onClearRef.current = onClear;
  }, [onClear]);

  // Escape clears the current measurement
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setPoints(null);
        onClearRef.current?.();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active]);

  useMapEvents({
    click(e) {
      if (!active) return;
      let lng = e.latlng.lng;
      if (wrapX && mapWidth) {
        lng = ((lng % mapWidth) + mapWidth) % mapWidth;
      }
      const { x, y } = mapClickToAtlasCoord(lng, e.latlng.lat, mapHeight);
      setPoints((prev) => {
        if (!prev) return { p1: { x, y } };
        if (!prev.p2) {
          onClearRef.current?.();
          return { ...prev, p2: { x, y } };
        }
        // Third click: start a fresh measurement
        return { p1: { x, y } };
      });
    },
  });

  // Hint overlay: show while active and fewer than two points are placed
  const showHint = active && (!points || !points.p2);
  const hint = showHint
    ? createPortal(
        <div
          data-testid="ruler-hint"
          style={{
            position: "absolute",
            bottom: "2.5rem",
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 500,
            pointerEvents: "none",
          }}
          className="text-xs bg-black/60 text-white px-3 py-1.5 rounded-full whitespace-nowrap"
        >
          Click two points to measure
        </div>,
        map.getContainer()
      )
    : null;

  if (!points) return hint;

  const toLatLng = (p: { x: number; y: number }): [number, number] => [mapHeight - p.y, p.x];
  const { p1, p2 } = points;
  const measurement = p2 ? measureDistance(p1, p2, scale) : null;

  return (
    <>
      {hint}
      <CircleMarker
        center={toLatLng(p1)}
        radius={5}
        pathOptions={{ color: "#fbbf24", fillColor: "#fbbf24", fillOpacity: 0.8, weight: 2 }}
        interactive={false}
      />
      {p2 && (
        <CircleMarker
          center={toLatLng(p2)}
          radius={5}
          pathOptions={{ color: "#fbbf24", fillColor: "#fbbf24", fillOpacity: 0.8, weight: 2 }}
          interactive={false}
        />
      )}
      {p2 && (
        <Polyline
          positions={[toLatLng(p1), toLatLng(p2)]}
          pathOptions={{ color: "#fbbf24", weight: 2, dashArray: "6 4", opacity: 0.9 }}
          interactive={false}
        >
          {measurement && (
            <Tooltip permanent direction="center" className="text-xs font-medium" opacity={0.95}>
              {measurement.label}
            </Tooltip>
          )}
        </Polyline>
      )}
    </>
  );
}
