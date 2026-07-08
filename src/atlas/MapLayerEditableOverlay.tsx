/**
 * Phase 1B B1/B2 — draggable + resizable image overlay.
 *
 * Wraps react-leaflet's <ImageOverlay> with low-level Leaflet event hooks
 * that turn the layer into a manipulable object when "Edit geometry" is on
 * and the layer is selected. Behavior:
 *
 *   B1 — body drag: mousedown on the image starts a drag; map panning is
 *        disabled for the duration; mousemove imperatively updates the
 *        overlay bounds (no React re-render per mouse event); mouseup
 *        commits the new x/y through onCommit (which records an undo
 *        entry via useMapLayers).
 *
 *   B2 — corner handles: four L.Marker handles at the layer corners (only
 *        shown when editGeometry && isSelected). Dragging a handle anchors
 *        the opposite corner. Modifier keys:
 *          • Shift           → force aspect-lock
 *          • Alt / Option    → center-anchored (all four corners move)
 *
 *   Esc — cancels the active drag (body or handle) and reverts the overlay
 *         to its pre-drag bounds. The number fields in the side panel are
 *         not affected (no commit happened).
 *
 * Atlas coordinate convention: layer.x and layer.y are top-left in atlas
 * units. Leaflet (with CRS.Simple) renders lat,lng where lat increases
 * upward and lng increases rightward, so we convert via mapDoc.height — y.
 */
import { useEffect, useMemo, useRef } from "react";
import { ImageOverlay, Marker, useMap } from "react-leaflet";
import L from "leaflet";
import type { MapDocument, MapLayer } from "@/atlas/content/schema";
import { normalizeAtlasAssetUrl } from "@/atlas/url";
import { clampLayerToCanvas, resizeFromCornerDrag } from "@/atlas/layerGeometry";

export function overlayInteractive(editMode: boolean): boolean {
  return editMode;
}

/**
 * Build the Leaflet bounds for an atlas-space layer rect. The single place the
 * `lat = mapHeight - y` coordinate flip lives (drag preview, resize preview,
 * and the declarative overlay bounds all route through here).
 */
function latLngBoundsForRect(
  rect: { x: number; y: number; width: number; height: number },
  mapHeight: number,
): L.LatLngBounds {
  return L.latLngBounds(
    L.latLng(mapHeight - (rect.y + rect.height), rect.x),
    L.latLng(mapHeight - rect.y, rect.x + rect.width),
  );
}

interface Props {
  layer: MapLayer;
  mapDoc: MapDocument;
  editMode: boolean;
  isSelected: boolean;
  /** When true the layer is pinned: no body drag, no resize handles. */
  locked?: boolean;
  /** Force a uniform aspect ratio on corner resize (also forced by Shift). */
  lockAspect?: boolean;
  onSelect: () => void;
  onCommit: (patch: Partial<MapLayer>) => void;
  /**
   * Click-through for pin placement. The image overlay is `interactive` (so
   * it can be selected/edited), which means it absorbs map clicks. When a
   * pin placement is pending the editor needs that click instead: this is
   * called with the clicked lat/lng and returns `true` if it consumed the
   * click (placement happened) — in which case we stop propagation so the
   * map's own click handler doesn't double-fire. Returns `false` to fall
   * back to normal layer selection.
   */
  onBackgroundClick?: (latlng: L.LatLng) => boolean;
}

type Corner = "nw" | "ne" | "sw" | "se";

function handleDivIcon(): L.DivIcon {
  // 14x14 white square with a thin border. Big enough to grab on a tablet,
  // small enough to not occlude the corner pixel-precise.
  return L.divIcon({
    className: "atlas-layer-handle",
    html: '<div style="width:14px;height:14px;background:#fff;border:1px solid #000;border-radius:2px;box-shadow:0 0 2px rgba(0,0,0,0.6);box-sizing:border-box;"></div>',
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  });
}

export function MapLayerEditableOverlay({
  layer,
  mapDoc,
  editMode,
  isSelected,
  locked,
  lockAspect,
  onSelect,
  onCommit,
  onBackgroundClick,
}: Props) {
  const lmap = useMap();
  const overlayRef = useRef<L.ImageOverlay | null>(null);

  const lx = layer.x;
  const ly = layer.y;
  const lw = layer.width;
  const lh = layer.height;
  const bounds = useMemo<L.LatLngBounds>(
    () => latLngBoundsForRect({ x: lx, y: ly, width: lw, height: lh }, mapDoc.height),
    [lx, ly, lw, lh, mapDoc.height],
  );

  // -----------------------------------------------------------------------
  // B1 — body drag.
  // -----------------------------------------------------------------------
  useEffect(() => {
    // A locked layer is not draggable — bail before wiring any mouse handlers.
    if (!editMode || !isSelected || locked) return;
    const overlay = overlayRef.current;
    if (!overlay) return;
    const img = overlay.getElement() as HTMLImageElement | undefined;
    if (!img) return;

    let dragging = false;
    let startLatLng: L.LatLng | null = null;
    let startX = layer.x;
    let startY = layer.y;

    const setBoundsFor = (nx: number, ny: number) => {
      overlay.setBounds(
        latLngBoundsForRect(
          { x: nx, y: ny, width: layer.width, height: layer.height },
          mapDoc.height,
        ),
      );
    };

    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      e.preventDefault();
      dragging = true;
      startLatLng = lmap.mouseEventToLatLng(e);
      startX = layer.x;
      startY = layer.y;
      lmap.dragging.disable();
      L.DomUtil.disableTextSelection();
      img.style.cursor = "grabbing";
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!dragging || !startLatLng) return;
      const ll = lmap.mouseEventToLatLng(e);
      const dLng = ll.lng - startLatLng.lng;
      const dLat = ll.lat - startLatLng.lat;
      setBoundsFor(startX + dLng, startY - dLat);
    };

    const onMouseUp = (e: MouseEvent) => {
      if (!dragging || !startLatLng) return;
      dragging = false;
      lmap.dragging.enable();
      L.DomUtil.enableTextSelection();
      img.style.cursor = "move";
      const ll = lmap.mouseEventToLatLng(e);
      const dLng = ll.lng - startLatLng.lng;
      const dLat = ll.lat - startLatLng.lat;
      const clamped = clampLayerToCanvas(
        { x: startX + dLng, y: startY - dLat, width: layer.width, height: layer.height },
        mapDoc,
      );
      const nx = Math.round(clamped.x);
      const ny = Math.round(clamped.y);
      startLatLng = null;
      if (nx === startX && ny === startY) return; // ignore microscopic drags
      onCommit({ x: nx, y: ny });
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && dragging) {
        dragging = false;
        lmap.dragging.enable();
        L.DomUtil.enableTextSelection();
        img.style.cursor = "move";
        setBoundsFor(startX, startY);
        startLatLng = null;
      }
    };

    img.style.cursor = "move";
    img.addEventListener("mousedown", onMouseDown);
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    document.addEventListener("keydown", onKey);
    return () => {
      img.style.cursor = "";
      img.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      document.removeEventListener("keydown", onKey);
      lmap.dragging.enable();
    };
  }, [editMode, isSelected, locked, lmap, mapDoc, layer.x, layer.y, layer.width, layer.height, onCommit]);

  // -----------------------------------------------------------------------
  // B2 — corner handle positions (in Leaflet lat/lng).
  // -----------------------------------------------------------------------
  const corners = useMemo(() => {
    const left = layer.x;
    const right = layer.x + layer.width;
    const top = mapDoc.height - layer.y; // lat of top (atlas y=0)
    const bottom = mapDoc.height - (layer.y + layer.height); // lat of bottom
    return {
      nw: L.latLng(top, left),
      ne: L.latLng(top, right),
      sw: L.latLng(bottom, left),
      se: L.latLng(bottom, right),
    } as const;
  }, [layer.x, layer.y, layer.width, layer.height, mapDoc.height]);

  return (
    <>
      <ImageOverlay
        ref={overlayRef as React.RefObject<L.ImageOverlay>}
        url={normalizeAtlasAssetUrl(layer.src)}
        bounds={bounds}
        opacity={layer.opacity}
        interactive={overlayInteractive(editMode)}
        eventHandlers={{
          click: (e) => {
            if (!editMode) return;
            const me = e as L.LeafletMouseEvent;
            if (onBackgroundClick && onBackgroundClick(me.latlng)) {
              L.DomEvent.stopPropagation(me.originalEvent);
              return;
            }
            onSelect();
          },
        }}
      />
      {editMode && isSelected && !locked && (
        <>
          {(["nw", "ne", "sw", "se"] as const).map((corner) => (
            <ResizeHandle
              key={corner}
              corner={corner}
              position={corners[corner]}
              layer={layer}
              mapDoc={mapDoc}
              lockAspect={!!lockAspect}
              overlayRef={overlayRef}
              onCommit={onCommit}
            />
          ))}
        </>
      )}
    </>
  );
}

interface HandleProps {
  corner: Corner;
  position: L.LatLng;
  layer: MapLayer;
  mapDoc: MapDocument;
  lockAspect: boolean;
  overlayRef: React.MutableRefObject<L.ImageOverlay | null>;
  onCommit: (patch: Partial<MapLayer>) => void;
}

/**
 * Single corner handle. Uses a draggable L.Marker; we hook into its native
 * Leaflet drag events directly so we can read modifier keys (Shift/Alt) via
 * the underlying mouse event, which the React onDrag handler does not
 * expose cleanly.
 */
function ResizeHandle({
  corner,
  position,
  layer,
  mapDoc,
  lockAspect,
  overlayRef,
  onCommit,
}: HandleProps) {
  const lmap = useMap();
  const markerRef = useRef<L.Marker | null>(null);

  useEffect(() => {
    const marker = markerRef.current;
    if (!marker) return;

    // Capture the geometry that was current when drag started; we use this
    // both for computing the resize math and for the Esc-revert path.
    let startX = layer.x;
    let startY = layer.y;
    let startW = layer.width;
    let startH = layer.height;
    let startMouse: L.LatLng | null = null;
    let modShift = false;
    let modAlt = false;

    const setBoundsFor = (nx: number, ny: number, nw: number, nh: number) => {
      const overlay = overlayRef.current;
      if (!overlay) return;
      overlay.setBounds(latLngBoundsForRect({ x: nx, y: ny, width: nw, height: nh }, mapDoc.height));
    };

    const computeFromDrag = (
      current: L.LatLng,
    ): { x: number; y: number; width: number; height: number } => {
      if (!startMouse) return { x: startX, y: startY, width: startW, height: startH };
      // Convert the Leaflet delta to an atlas delta (atlas y is measured
      // downward, lat upward) and defer to the pure resize math.
      const dx = current.lng - startMouse.lng;
      const dy = -(current.lat - startMouse.lat);
      return resizeFromCornerDrag({
        corner,
        start: { x: startX, y: startY, width: startW, height: startH },
        delta: { dx, dy },
        centerAnchored: modAlt,
        aspectLocked: modShift || lockAspect,
      });
    };

    const onDragStart = (ev: L.LeafletEvent) => {
      const originalEvent = (ev as L.LeafletMouseEvent).originalEvent as MouseEvent | undefined;
      modShift = !!originalEvent?.shiftKey;
      modAlt = !!originalEvent?.altKey;
      startX = layer.x;
      startY = layer.y;
      startW = layer.width;
      startH = layer.height;
      startMouse = marker.getLatLng();
      lmap.dragging.disable();
    };

    const onDrag = (ev: L.LeafletEvent) => {
      const originalEvent = (ev as L.LeafletMouseEvent).originalEvent as MouseEvent | undefined;
      if (originalEvent) {
        modShift = !!originalEvent.shiftKey;
        modAlt = !!originalEvent.altKey;
      }
      const current = marker.getLatLng();
      const { x, y, width, height } = computeFromDrag(current);
      setBoundsFor(x, y, width, height);
    };

    const onDragEnd = () => {
      lmap.dragging.enable();
      if (!startMouse) return;
      const current = marker.getLatLng();
      const raw = computeFromDrag(current);
      startMouse = null;
      const clamped = clampLayerToCanvas(raw, mapDoc);
      // Snap to integers — atlas coords are whole-map-units.
      const rx = Math.round(clamped.x);
      const ry = Math.round(clamped.y);
      const rw = Math.max(1, Math.round(clamped.width));
      const rh = Math.max(1, Math.round(clamped.height));
      if (rx === startX && ry === startY && rw === startW && rh === startH) return;
      onCommit({ x: rx, y: ry, width: rw, height: rh });
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && startMouse) {
        // Revert to start. Reset the marker latlng so it doesn't visually
        // freeze at the canceled drag point.
        startMouse = null;
        lmap.dragging.enable();
        setBoundsFor(startX, startY, startW, startH);
        marker.setLatLng(position);
      }
    };

    marker.on("dragstart", onDragStart);
    marker.on("drag", onDrag);
    marker.on("dragend", onDragEnd);
    document.addEventListener("keydown", onKey);
    return () => {
      marker.off("dragstart", onDragStart);
      marker.off("drag", onDrag);
      marker.off("dragend", onDragEnd);
      document.removeEventListener("keydown", onKey);
    };
  }, [
    corner,
    layer.x,
    layer.y,
    layer.width,
    layer.height,
    lmap,
    lockAspect,
    mapDoc,
    onCommit,
    overlayRef,
    position,
  ]);

  return (
    <Marker
      ref={markerRef as React.RefObject<L.Marker>}
      position={position}
      icon={handleDivIcon()}
      draggable
      // Bubble click through to the underlying layer so selection survives.
      eventHandlers={{
        click: (e) => {
          L.DomEvent.stopPropagation(e.originalEvent);
        },
      }}
    />
  );
}
