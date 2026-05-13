import { useCallback, useEffect, useState } from "react";
import { useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import { useAtlas } from "@/atlas/store";
import { w2ll, ll2w } from "@/atlas/coords";

type Viewport = { swLat: number; swLng: number; neLat: number; neLng: number; centerX: number; centerY: number; zoom: number };

// Lives INSIDE MapContainer. Bridges map state out via window events.
export function MinimapBridge() {
  const map = useMap();
  const emit = useCallback(() => {
    const b = map.getBounds();
    const world = useAtlas.getState().atlas.world;
    const center = map.getCenter();
    const [centerX, centerY] = ll2w(world, center.lat, center.lng);
    const vp: Viewport = {
      swLat: b.getSouthWest().lat, swLng: b.getSouthWest().lng,
      neLat: b.getNorthEast().lat, neLng: b.getNorthEast().lng,
      centerX, centerY, zoom: map.getZoom(),
    };
    window.dispatchEvent(new CustomEvent("atlas-viewport", { detail: vp }));
  }, [map]);
  useMapEvents({ move: emit, zoom: emit, resize: emit });
  useEffect(() => { emit(); }, [emit]);
  useEffect(() => {
    const h = (e: any) => {
      const { x, y } = e.detail;
      const [lat, lng] = w2ll(useAtlas.getState().atlas.world, x, y);
      map.panTo(L.latLng(lat, lng));
    };
    const fly = (e: any) => {
      const world = useAtlas.getState().atlas.world;
      const d = e.detail || {};
      // Fit-to-bounds variant: { bounds: { x, y, w, h } }
      if (d.bounds) {
        const { x, y, w, h } = d.bounds;
        const sw = w2ll(world, x, y + h);
        const ne = w2ll(world, x + w, y);
        map.flyToBounds(L.latLngBounds(sw, ne), { duration: 0.65, padding: [56, 56] });
        return;
      }
      const { x, y, zoom } = d;
      const [lat, lng] = w2ll(world, x, y);
      const min = map.getMinZoom(), max = map.getMaxZoom();
      // Default fly zoom: 75% between current and max — feels like a meaningful zoom-in.
      const fallback = Math.min(max, Math.max(map.getZoom() + 1.5, min + 2));
      const target = Math.min(max, Math.max(min, typeof zoom === "number" ? zoom : fallback));
      map.flyTo(L.latLng(lat, lng), target, { duration: 0.65 });
    };
    window.addEventListener("atlas-jump", h);
    window.addEventListener("atlas-flyto", fly);
    return () => {
      window.removeEventListener("atlas-jump", h);
      window.removeEventListener("atlas-flyto", fly);
    };
  }, [map]);
  return null;
}

// Lives OUTSIDE MapContainer (regular DOM).
export function Minimap() {
  const atlas = useAtlas((s) => s.atlas);
  const view = useAtlas((s) => s.view);
  const { world } = atlas;
  const [vp, setVp] = useState<Viewport | null>(null);

  useEffect(() => {
    const h = (e: any) => setVp(e.detail);
    window.addEventListener("atlas-viewport", h);
    return () => window.removeEventListener("atlas-viewport", h);
  }, []);

  const W = 200, H = Math.max(60, (200 * world.height) / world.width);
  const sx = W / world.width;
  const sy = H / world.height;

  const layers = atlas.layers.filter((l) => view === "dm" || (l.visibility !== "hidden" && l.visibility !== "dm"));
  const pins = atlas.pins.filter((p) => view === "dm" || (p.visibility !== "hidden" && p.visibility !== "dm"));

  let viewBox: { x: number; y: number; w: number; h: number } | null = null;
  if (vp) {
    const [sx1, sy1] = ll2w(world, vp.swLat, vp.swLng);
    const [sx2, sy2] = ll2w(world, vp.neLat, vp.neLng);
    const x = Math.min(sx1, sx2) * sx;
    const y = Math.min(sy1, sy2) * sy;
    viewBox = { x, y, w: Math.abs(sx2 - sx1) * sx, h: Math.abs(sy2 - sy1) * sy };
  }

  const jump = (e: React.MouseEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * world.width;
    const y = ((e.clientY - r.top) / r.height) * world.height;
    window.dispatchEvent(new CustomEvent("atlas-jump", { detail: { x, y } }));
  };

  return (
    <div className="atlas-minimap absolute bottom-4 right-4 z-[1000]">
      <svg
        width={W} height={H}
        style={{ background: world.oceanColor, cursor: "crosshair", display: "block" }}
        onClick={jump}
      >
        {layers.map((l) => (
          <rect key={l.id} x={l.x * sx} y={l.y * sy} width={l.width * sx} height={l.height * sy}
            fill="hsl(36 60% 55% / 0.35)" stroke="hsl(36 70% 58%)" strokeWidth={0.5} />
        ))}
        {pins.map((p) => (
          <circle key={p.id} cx={p.x * sx} cy={p.y * sy} r={1.5} fill="hsl(36 70% 70%)" />
        ))}
        <circle cx={atlas.party.x * sx} cy={atlas.party.y * sy} r={2.5} fill="hsl(18 80% 55%)" stroke="black" strokeWidth={0.5} />
        {viewBox && (
          <rect x={viewBox.x} y={viewBox.y} width={viewBox.w} height={viewBox.h}
            fill="none" stroke="hsl(var(--foreground))" strokeWidth={1} pointerEvents="none" />
        )}
      </svg>
    </div>
  );
}
