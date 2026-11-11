/**
 * The shared canvas (R-31, ADR-0002): one Leaflet map over R-30's map tree,
 * showing either the ocean or one map. The viewer (R-33) and the new editor
 * (phase 4) both mount it and add their own layers as `children`.
 *
 * - Ocean view: the sea (`ocean.sea`, looked up in `seaStyle.ts`), every
 *   top-level map's images at its placement (position, scale, rotation about
 *   the centre) and its name. No pins, regions or routes. Opens fitted to the
 *   placed maps, not the whole ocean.
 * - Map view: the map's images (as the viewer draws them) and each child's
 *   frame as a soft outline with its name.
 * - Clicking a map or a frame calls `onEnterMap`; hovering one calls
 *   `onFrameHover` (null when it leaves).
 * - A view the tree can't show (a map id that isn't a tree node, the ocean of
 *   a v1 atlas) draws nothing, and no children.
 *
 * Coordinates: each view is its own pixel space, top-left origin (ocean
 * pixels, or the map's pixels). `camera` and `onCameraChange` use that space
 * and Leaflet's zoom (log2 of screen px per view px).
 *
 * PLAYER-SAFE and editor-ready: imports nothing from `src/pages/`, the editor,
 * or viewer-only modules (search, entity panel, sound). Pinned by
 * src/test/canvas/canvas-imports.test.ts.
 */
import { useState, type ReactNode } from "react";
import { MapContainer } from "react-leaflet";
import { useReduceMotion } from "@/hooks/use-reduce-motion";
import { FlatCRS } from "../map/flatCRS";
import { FitMapOnOpen } from "../map/FitMapOnOpen";
import { MapImageLayers } from "../map/MapImageLayers";
import { OceanBackground } from "../ocean/OceanBackground";
import type { MapTree, MapTreeNode } from "../ocean/mapTree";
import { boxBounds, oceanFitBox, type Box } from "./canvasGeometry";
import { CanvasCamera, type CanvasCameraState } from "./CanvasCamera";
import { CANVAS_IMAGE_PANE, ChildFrames, OceanMaps } from "./CanvasLayers";
import { seaStyle, type SeaStyle } from "./seaStyle";

export type { CanvasCameraState } from "./CanvasCamera";

export type CanvasView = { kind: "ocean" } | { kind: "map"; mapId: string };
export type CanvasCamera = "fit" | CanvasCameraState;

export interface AtlasCanvasProps {
  tree: MapTree;
  view: CanvasView;
  camera: CanvasCamera;
  onCameraChange?: (camera: CanvasCameraState) => void;
  onEnterMap?: (mapId: string) => void;
  onFrameHover?: (mapId: string | null) => void;
  /** Caller layers, drawn inside the map pane above the canvas's own. */
  children?: ReactNode;
  className?: string;
}

type Resolved =
  | { kind: "ocean"; key: string; height: number; fit: Box; water: SeaStyle; label: string }
  | {
      kind: "map";
      key: string;
      height: number;
      fit: Box;
      water: SeaStyle;
      label: string;
      node: MapTreeNode;
    };

function resolveView(tree: MapTree, view: CanvasView): Resolved | null {
  if (view.kind === "ocean") {
    if (!tree.ocean) return null;
    const { width, height } = tree.ocean;
    return {
      kind: "ocean",
      key: "ocean",
      height,
      fit: oceanFitBox(tree) ?? { minX: 0, minY: 0, maxX: width, maxY: height },
      water: seaStyle(tree.ocean.sea),
      label: "Ocean",
    };
  }
  const node = tree.byId.get(view.mapId);
  if (!node) return null;
  const { width, height } = node.map;
  return {
    kind: "map",
    key: `map:${node.map.id}`,
    height,
    fit: { minX: 0, minY: 0, maxX: width, maxY: height },
    water: { oceanColor: node.map.oceanColor, water: node.map.water },
    label: node.map.name,
    node,
  };
}

const DEFAULT_SEA = "#18313f";

/** Label look: a name on the map, not a card. Leaflet's tooltip box is turned off. */
const LABEL_CSS = `
.atlas-canvas .atlas-canvas-label{background:transparent;border:0;box-shadow:none;padding:0;
color:#f8f1df;font-weight:600;font-size:13px;letter-spacing:.02em;white-space:nowrap;
text-shadow:0 0 3px rgba(0,0,0,.9),0 1px 2px rgba(0,0,0,.8)}
.atlas-canvas .atlas-canvas-label::before{display:none}
`;

export function AtlasCanvas({
  tree,
  view,
  camera,
  onCameraChange,
  onEnterMap,
  onFrameHover,
  children,
  className,
}: AtlasCanvasProps) {
  const reduceMotion = useReduceMotion();
  const resolved = resolveView(tree, view);

  // A new "fit" request (camera turning to "fit") re-fits the same view.
  const isFit = camera === "fit";
  const [fit, setFit] = useState({ gen: 0, on: isFit });
  if (fit.on !== isFit) setFit({ gen: fit.gen + (isFit ? 1 : 0), on: isFit });

  const water = resolved?.water ?? {};
  const waterOff = water.water?.enabled === false;

  return (
    <div
      className={`atlas-canvas ${className ?? ""}`}
      style={{ position: "relative", width: "100%", height: "100%" }}
      data-canvas-view={resolved ? resolved.key : "none"}
      role="region"
      aria-label={resolved ? `Map canvas: ${resolved.label}` : "Map canvas"}
    >
      <style>{LABEL_CSS}</style>
      <OceanBackground map={water} reduceMotion={reduceMotion} />
      <MapContainer
        crs={FlatCRS}
        center={[0, 0]}
        zoom={-2}
        minZoom={-6}
        maxZoom={4}
        zoomControl
        keyboard
        keyboardPanDelta={80}
        attributionControl={false}
        style={{
          width: "100%",
          height: "100%",
          background: waterOff ? (water.oceanColor ?? DEFAULT_SEA) : "transparent",
        }}
      >
        {resolved && (
          <>
            {/* CanvasCamera before FitMapOnOpen: sibling effects run in order (after
                every cleanup), so its moveend listener for this view is attached
                before the fit's synchronous fitBounds fires moveend, and the
                caller hears the fitted camera. */}
            <CanvasCamera
              viewKey={resolved.key}
              viewHeight={resolved.height}
              camera={isFit ? null : camera}
              onCameraChange={onCameraChange}
              reduceMotion={reduceMotion}
            />
            <FitMapOnOpen
              mapId={`${resolved.key}#${fit.gen}`}
              mapWidth={resolved.fit.maxX - resolved.fit.minX}
              mapHeight={resolved.fit.maxY - resolved.fit.minY}
              bounds={boxBounds(resolved.height, resolved.fit)}
              skip={!isFit}
            />
            {resolved.kind === "ocean" ? (
              <OceanMaps
                key={resolved.key}
                roots={tree.roots}
                oceanHeight={resolved.height}
                onEnterMap={onEnterMap}
                onFrameHover={onFrameHover}
              />
            ) : (
              <MapView
                key={resolved.key}
                node={resolved.node}
                onEnterMap={onEnterMap}
                onFrameHover={onFrameHover}
              />
            )}
            {children}
          </>
        )}
      </MapContainer>
    </div>
  );
}

function MapView({
  node,
  onEnterMap,
  onFrameHover,
}: {
  node: MapTreeNode;
  onEnterMap?: (mapId: string) => void;
  onFrameHover?: (mapId: string | null) => void;
}) {
  const { map } = node;
  return (
    <>
      {(map.wrapX ? [-map.width, 0, map.width] : [0]).map((dx) => (
        <MapImageLayers key={`wrap-${dx}`} map={map} dx={dx} pane={CANVAS_IMAGE_PANE} />
      ))}
      <ChildFrames node={node} onEnterMap={onEnterMap} onFrameHover={onFrameHover} />
    </>
  );
}
