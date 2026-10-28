/**
 * How a region and a route look on the map: stroke, fill and hover tooltip.
 *
 * One module for both the player viewer (`WrappedWorld.tsx`) and the
 * editor layers (RegionLayer, RouteLayer), so what the DM checks in the editor
 * is what players see. The editor only adds its own click handling, a
 * selection highlight, edit handles and draft shapes on top.
 *
 * PLAYER-SAFE: the player bundle imports this file. Import nothing
 * editor-only here (no editor pages, draft hooks, save endpoints).
 */
import type { ReactNode } from "react";
import { Polygon, Polyline, Tooltip } from "react-leaflet";
import type { LeafletEventHandlerFnMap } from "leaflet";
import type { MapScale, Point, Region, Route } from "@/atlas/content/schema";
import {
  regionColor,
  regionPathOptions,
  routePathOptions,
  routeTooltipLines,
} from "./featureStyle";

type LatLng = [number, number];

interface RegionShapeProps {
  region: Region;
  /** Linked entity's type, for the default colour. */
  entityType?: string;
  positions: LatLng[];
  /** Editor: draw the selection emphasis. */
  selected?: boolean;
  /** Editor: hide the hover tooltip (the shape is being edited). */
  hideTooltip?: boolean;
  eventHandlers?: LeafletEventHandlerFnMap;
  /** Extra layer children, e.g. the viewer's click popup. */
  children?: ReactNode;
}

export function RegionShape({
  region,
  entityType,
  positions,
  selected,
  hideTooltip,
  eventHandlers,
  children,
}: RegionShapeProps) {
  const color = regionColor(region, entityType);
  return (
    <Polygon
      positions={positions}
      pathOptions={regionPathOptions(region, color, { selected })}
      eventHandlers={eventHandlers}
    >
      {/* Hover label so users don't rely on fill color alone to identify
          a region (WCAG 1.4.1). */}
      {!hideTooltip && (
        <Tooltip sticky direction="top" opacity={0.95}>
          <div className="text-xs font-medium">{region.name}</div>
        </Tooltip>
      )}
      {children}
    </Polygon>
  );
}

interface RouteShapeProps {
  route: Route;
  /** Resolved route points in map coordinates (for the distance label). */
  points: Point[];
  positions: LatLng[];
  scale: MapScale | undefined;
  selected?: boolean;
  hideTooltip?: boolean;
  eventHandlers?: LeafletEventHandlerFnMap;
}

export function RouteShape({
  route,
  points,
  positions,
  scale,
  selected,
  hideTooltip,
  eventHandlers,
}: RouteShapeProps) {
  const { name, detail } = routeTooltipLines(route, points, scale);
  return (
    <Polyline
      positions={positions}
      pathOptions={routePathOptions(route, { selected })}
      eventHandlers={eventHandlers}
    >
      {!hideTooltip && (
        <Tooltip sticky direction="top" opacity={0.95}>
          <div className="text-xs">
            <div className="font-medium">{name}</div>
            <div className="opacity-80">{detail}</div>
          </div>
        </Tooltip>
      )}
    </Polyline>
  );
}
