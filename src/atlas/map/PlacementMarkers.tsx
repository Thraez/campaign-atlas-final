/**
 * The player map's pins: one Marker per placement, styled from its pin preset,
 * with a permanent or hover label.
 *
 * Built so a viewer change that doesn't touch a pin doesn't touch its Leaflet
 * marker: icons come from the `pinIcon` cache, each pin is a memoised
 * `PinMarker` with stable position and handlers, and the label decisions (an
 * O(n²) collision pass) are worked out once per placement list and zoom, shared
 * by the wrap copies.
 *
 * PLAYER-SAFE: the player bundle imports this file. Import nothing editor-only.
 */
import { memo, useEffect, useMemo, useState } from "react";
import { Marker, Tooltip, useMap } from "react-leaflet";
import type L from "leaflet";
import type { Entity, MapPlacement } from "@/atlas/content/schema";
import { playerTypeLabel } from "@/atlas/content/typeLabel";
import { resolvePinStyle, type PinOverride, type PinPreset } from "@/atlas/pins/presets";
import { shouldShowLabel } from "@/atlas/pins/labelVisibility";
import { pinDiscoveryClass } from "@/atlas/wander/pinDiscoveryClass";
import { pinIcon } from "./pinIcon";

export type PinLabelDecision = "always" | "hover" | "none";

interface EnrichedPin {
  p: MapPlacement;
  ent: Entity;
  style: PinPreset;
}

/** Labels closer than this (screen px) to a higher-priority shown label go hover-only. */
const LABEL_CLEARANCE_PX = 70;

interface PinModel {
  entityById: Map<string, Entity>;
  /** Placed pins with a known entity, highest priority first. */
  pins: EnrichedPin[];
  /** Label decisions by placement id, per `${zoom}|${H}`. */
  labels: Map<string, Map<string, PinLabelDecision>>;
}

// Keyed by the page's memoised placement list, so the three wrap copies (and
// every re-render) share one model until the atlas data changes.
const models = new WeakMap<MapPlacement[], PinModel>();

function pinModel(placements: MapPlacement[], entityById: Map<string, Entity>): PinModel {
  const cached = models.get(placements);
  if (cached && cached.entityById === entityById) return cached;
  const pins = placements
    .map((p) => {
      const ent = entityById.get(p.entityId);
      if (!ent) return null;
      const style = resolvePinStyle(ent.type, p.pin as PinOverride | undefined);
      return { p, ent, style };
    })
    .filter((x): x is EnrichedPin => !!x)
    .sort((a, b) => b.style.priority - a.style.priority);
  const model: PinModel = { entityById, pins, labels: new Map() };
  models.set(placements, model);
  return model;
}

/**
 * Which labels show permanently at this zoom: per-pin labelMode, the
 * zoom × priority threshold, then a screen-space collision pass where the
 * higher priority wins. Distances are measured in projected pixels at `zoom`,
 * which match on-screen distances whatever the pan or wrap copy.
 */
function labelDecisions(
  model: PinModel,
  map: L.Map,
  zoom: number,
  H: number,
): Map<string, PinLabelDecision> {
  const key = `${zoom}|${H}`;
  const cached = model.labels.get(key);
  if (cached) return cached;
  const out = new Map<string, PinLabelDecision>();
  const taken: { x: number; y: number }[] = [];
  const count = model.pins.length;
  for (const { p, style } of model.pins) {
    let mode: PinLabelDecision;
    if (style.labelMode === "never") mode = "none";
    else if (style.labelMode === "hover") mode = "hover";
    else if (style.labelMode === "always") mode = "always";
    else mode = shouldShowLabel(zoom, style.priority, count) ? "always" : "hover";
    if (mode === "always") {
      // Rounded like Leaflet's own latLngToLayerPoint.
      const raw = map.project([H - p.y, p.x], zoom);
      const pt = { x: Math.round(raw.x), y: Math.round(raw.y) };
      const collides = taken.some((t) => Math.hypot(t.x - pt.x, t.y - pt.y) < LABEL_CLEARANCE_PX);
      if (collides) mode = "hover";
      else taken.push(pt);
    }
    out.set(p.id, mode);
  }
  model.labels.set(key, out);
  return out;
}

interface PlacementMarkersProps {
  dx: number;
  H: number;
  placements: MapPlacement[];
  entityById: Map<string, Entity>;
  onOpenEntity: (id: string, fly?: boolean) => void;
  visited: Set<string>;
  openId: string | null;
  onPinPeek?: (id: string, ev: MouseEvent) => void;
  onPinPeekLeave?: () => void;
}

export function PlacementMarkers({
  dx,
  H,
  placements,
  entityById,
  onOpenEntity,
  visited,
  openId,
  onPinPeek,
  onPinPeekLeave,
}: PlacementMarkersProps) {
  const map = useMap();
  const [zoom, setZoom] = useState(map.getZoom());
  useEffect(() => {
    const h = () => setZoom(map.getZoom());
    map.on("zoomend", h);
    return () => {
      map.off("zoomend", h);
    };
  }, [map]);

  const model = pinModel(placements, entityById);
  const labels = useMemo(() => labelDecisions(model, map, zoom, H), [model, map, zoom, H]);

  return (
    <>
      {model.pins.map(({ p, ent, style }) => (
        <PinMarker
          key={`${p.id}-${dx}`}
          placement={p}
          entity={ent}
          style={style}
          dx={dx}
          H={H}
          labelMode={labels.get(p.id) ?? "none"}
          discoveryClass={pinDiscoveryClass(p.entityId, visited)}
          active={p.entityId === openId}
          onOpenEntity={onOpenEntity}
          onPinPeek={onPinPeek}
          onPinPeekLeave={onPinPeekLeave}
        />
      ))}
    </>
  );
}

interface PinMarkerProps {
  placement: MapPlacement;
  entity: Entity;
  style: PinPreset;
  dx: number;
  H: number;
  labelMode: PinLabelDecision;
  discoveryClass: string;
  active: boolean;
  onOpenEntity: (id: string, fly?: boolean) => void;
  onPinPeek?: (id: string, ev: MouseEvent) => void;
  onPinPeekLeave?: () => void;
}

const PinMarker = memo(function PinMarker({
  placement: p,
  entity: ent,
  style,
  dx,
  H,
  labelMode,
  discoveryClass,
  active,
  onOpenEntity,
  onPinPeek,
  onPinPeekLeave,
}: PinMarkerProps) {
  const dim = ent.visibility === "rumor";
  const typeLabel = playerTypeLabel(ent.type);
  const a11yLabel = typeLabel ? `${ent.title}, ${typeLabel}` : ent.title;
  const icon = pinIcon(style, {
    dim,
    extraClass: active ? `${discoveryClass} atlas-viewer-pin--active` : discoveryClass,
    ariaLabel: a11yLabel,
  });
  const position = useMemo<[number, number]>(() => [H - p.y, p.x + dx], [H, p.y, p.x, dx]);
  const entityId = p.entityId;
  const eventHandlers = useMemo<L.LeafletEventHandlerFnMap>(
    () => ({
      click: () => onOpenEntity(entityId, false),
      mouseover: (e) => onPinPeek?.(entityId, e.originalEvent as MouseEvent),
      mouseout: () => onPinPeekLeave?.(),
    }),
    [entityId, onOpenEntity, onPinPeek, onPinPeekLeave],
  );
  return (
    <Marker
      position={position}
      icon={icon}
      riseOnHover
      riseOffset={250}
      title={a11yLabel}
      eventHandlers={eventHandlers}
    >
      {labelMode !== "none" && (
        <Tooltip
          permanent={labelMode === "always"}
          direction="top"
          offset={[0, -12]}
          opacity={dim ? 0.7 : 0.95}
          className={`atlas-pin-label atlas-pin-label--${ent.visibility}`}
        >
          {p.label ?? ent.title}
        </Tooltip>
      )}
    </Marker>
  );
});
