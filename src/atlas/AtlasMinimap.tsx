import { useEffect, useRef, useState } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";
import type { MapDocument, MapLayer } from "@/atlas/content/schema";
import { normalizeAtlasAssetUrl } from "@/atlas/url";

interface Props {
  map: MapDocument;
  layers: MapLayer[];
  width?: number;
  /** Optional class to position the minimap (default: bottom-right). */
  className?: string;
}

/**
 * Lightweight minimap for FlatCRS Leaflet maps. Renders a scaled rectangle of
 * the world with each base layer drawn as an <img>, plus a draggable viewport
 * rectangle synced to the parent map. Click/drag to pan the parent.
 *
 * MUST be rendered as a child of <MapContainer> so useMap() resolves.
 */
export function AtlasMinimap({ map, layers, width = 180, className }: Props) {
  const parent = useMap();
  const ref = useRef<HTMLDivElement>(null);
  const [vp, setVp] = useState<{ x: number; y: number; w: number; h: number }>({ x: 0, y: 0, w: 0, h: 0 });
  const aspect = map.height / map.width;
  const height = Math.max(40, Math.round(width * aspect));
  const sx = width / map.width;
  const sy = height / map.height;

  useEffect(() => {
    const update = () => {
      const b = parent.getBounds();
      // Bounds in flat CRS lat = height - y, lng = x.
      const sw = b.getSouthWest();
      const ne = b.getNorthEast();
      const x = sw.lng;
      const y = map.height - ne.lat;
      const w = ne.lng - sw.lng;
      const h = ne.lat - sw.lat;
      setVp({ x, y, w, h });
    };
    update();
    parent.on("move zoom moveend zoomend", update);
    return () => {
      parent.off("move zoom moveend zoomend", update);
    };
  }, [parent, map.height]);

  const panFromEvent = (clientX: number, clientY: number) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const px = ((clientX - r.left) / r.width) * map.width;
    const py = ((clientY - r.top) / r.height) * map.height;
    parent.panTo([map.height - py, px], { animate: true });
  };

  return (
    <div
      ref={ref}
      onMouseDown={(e) => {
        panFromEvent(e.clientX, e.clientY);
        const onMove = (ev: MouseEvent) => panFromEvent(ev.clientX, ev.clientY);
        const onUp = () => {
          window.removeEventListener("mousemove", onMove);
          window.removeEventListener("mouseup", onUp);
        };
        window.addEventListener("mousemove", onMove);
        window.addEventListener("mouseup", onUp);
      }}
      onWheel={(e) => {
        e.preventDefault();
        const z = parent.getZoom();
        parent.setZoom(z + (e.deltaY < 0 ? 0.5 : -0.5));
      }}
      className={
        className ??
        "absolute bottom-3 right-3 z-[400] rounded-md border border-border shadow-lg cursor-crosshair overflow-hidden bg-card/80 backdrop-blur-sm"
      }
      style={{ width, height, background: map.oceanColor ?? "#18313f" }}
      title="Minimap — click or drag to pan, scroll to zoom"
    >
      {[...layers].sort((a, b) => a.zIndex - b.zIndex).map((layer) => (
        <img
          key={layer.id}
          src={normalizeAtlasAssetUrl(layer.src)}
          alt="" loading="lazy" decoding="async"
          draggable={false}
          style={{
            position: "absolute",
            left: layer.x * sx,
            top: layer.y * sy,
            width: layer.width * sx,
            height: layer.height * sy,
            opacity: layer.opacity,
            pointerEvents: "none",
            objectFit: "fill",
          }}
          onError={(e) => { (e.currentTarget.style.display = "none"); }}
        />
      ))}
      <div
        style={{
          position: "absolute",
          left: Math.max(0, vp.x * sx),
          top: Math.max(0, vp.y * sy),
          width: Math.min(width, vp.w * sx),
          height: Math.min(height, vp.h * sy),
          border: "1.5px solid hsl(var(--primary))",
          background: "hsl(var(--primary) / 0.12)",
          pointerEvents: "none",
          boxShadow: "0 0 0 1px rgba(0,0,0,0.4)",
        }}
      />
    </div>
  );
}
