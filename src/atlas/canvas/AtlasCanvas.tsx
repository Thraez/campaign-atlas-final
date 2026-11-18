/**
 * The shared canvas (R-31, ADR-0002): one Leaflet map over R-30's map tree,
 * showing either the ocean or one map. The viewer (R-33) and the new editor
 * (phase 4) both mount it and add their own layers as `children`.
 *
 * - Ocean view: the sea (`ocean.sea`, looked up in `seaStyle.ts`), every
 *   top-level map's images at its placement (position, scale, rotation about
 *   the centre) and its name. No pins, regions or routes. Opens fitted to the
 *   placed maps plus a margin of sea (`OCEAN_FIT_MARGIN`, R-37), not the
 *   whole ocean. The canvas is only as wide as the space the caller gives it,
 *   so the viewer's side panel (a sibling of the canvas) is already outside
 *   the fit. A map view fits edge to edge.
 * - Map view: the map's images (as the viewer draws them) and each child's
 *   frame as a soft outline with its name.
 * - Clicking a map or a frame calls `onEnterMap`; hovering one calls
 *   `onFrameHover` (null when it leaves). The caller lands a click enter
 *   fitted (`camera: "fit"`).
 * - Zoom handoff (R-32): when a user zoom settles past a threshold
 *   (`src/atlas/ocean/zoomHandoff.ts`), `onViewChange` gets the new view and
 *   the camera showing the same ground; the caller renders them. No page
 *   load, no refetch: only the view swaps. Fractional zoom (`zoomSnap` 0)
 *   keeps that camera exact. The old view's pictures fade out over the new
 *   one's on the same ground (P-05, `HandoffCrossfade`); a plain cut with
 *   reduced motion.
 * - Feel (P-06): a wheel notch zooms about half a level on any platform
 *   (`canvasMotion.ts`), and hands off one level at most. Bumping `glide` in
 *   the same update as a camera or view change glides there (`CanvasGlide`):
 *   the viewer's breadcrumb and Reset. A jump with reduced motion.
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
import { useRef, useState, type ReactNode } from "react";
import L from "leaflet";
import { MapContainer } from "react-leaflet";
import { useReduceMotion } from "@/hooks/use-reduce-motion";
import { FlatCRS } from "../map/flatCRS";
import { FitMapOnOpen } from "../map/FitMapOnOpen";
import { OceanBackground } from "../ocean/OceanBackground";
import type { MapTree, MapTreeNode } from "../ocean/mapTree";
import type { TreeView } from "../ocean/zoomHandoff";
import { CANVAS_MIN_ZOOM, OceanZoomLimit } from "./OceanZoomLimit";
import { boxBounds, oceanFitBox, type Box } from "./canvasGeometry";
import { CanvasCamera, type CanvasCameraState } from "./CanvasCamera";
import { KeepCanvasSized } from "./KeepCanvasSized";
import { ChildFrames, MapPictures, OceanMaps } from "./CanvasLayers";
import { seaStyle, type SeaStyle } from "./seaStyle";
import { ZoomHandoff } from "./ZoomHandoff";
import { HandoffCrossfade, type CrossfadeControl } from "./HandoffCrossfade";
import { GlideRequest } from "./CanvasGlide";
import {
  GLIDE_SECONDS,
  canvasWheelPxPerZoomLevel,
  leafletWheelPxFactor,
  newGlideControl,
  runGlide,
  takeGlide,
  type GlideControl,
} from "./canvasMotion";

export type { CanvasCameraState } from "./CanvasCamera";

export type CanvasView = TreeView;
export type CanvasCamera = "fit" | CanvasCameraState;

export interface AtlasCanvasProps {
  tree: MapTree;
  view: CanvasView;
  camera: CanvasCamera;
  onCameraChange?: (camera: CanvasCameraState) => void;
  onEnterMap?: (mapId: string) => void;
  onFrameHover?: (mapId: string | null) => void;
  /** A zoom handoff: show `view` at `camera` (R-32). Without it the canvas never hands off. */
  onViewChange?: (view: CanvasView, camera: CanvasCameraState) => void;
  /** Caller layers, drawn inside the map pane above the canvas's own. */
  /**
   * P-06: bump in the same update as a camera or view change to glide there
   * (a breadcrumb, Reset) instead of jumping. A view change glides only up
   * the tree. Ignored under reduced motion.
   */
  glide?: number;
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

export function AtlasCanvas({
  tree,
  view,
  camera,
  onCameraChange,
  onEnterMap,
  onFrameHover,
  onViewChange,
  glide = 0,
  children,
  className,
}: AtlasCanvasProps) {
  const reduceMotion = useReduceMotion();
  const resolved = resolveView(tree, view);

  // A new "fit" request (camera turning to "fit") re-fits the same view.
  const isFit = camera === "fit";
  const [fit, setFit] = useState({ gen: 0, on: isFit });
  if (fit.on !== isFit) setFit({ gen: fit.gen + (isFit ? 1 : 0), on: isFit });

  // A handoff is decided on zoomend, and Leaflet fires that move's moveend
  // right after, in the same dispatch and still in the old view's pixels.
  // Drop camera reports until the dispatch ends, so the caller keeps the
  // handed-over camera.
  const handingOff = useRef(false);
  // User input waiting for its zoom (ZoomHandoff); cleared by the canvas's own moves.
  const armed = useRef(false);
  // The soft handoff's copy of the old view (HandoffCrossfade).
  const crossfade = useRef<CrossfadeControl | null>(null);
  // This commit's glide request (P-06).
  const glideControl = useRef<GlideControl>(newGlideControl());
  // Wheel speed for this platform, set once: Leaflet reads it at creation.
  const [wheelPxPerZoomLevel] = useState(() =>
    canvasWheelPxPerZoomLevel(
      leafletWheelPxFactor(
        L.Browser as { linux?: boolean; chrome?: boolean; mac?: boolean },
        typeof window === "undefined" ? 1 : window.devicePixelRatio || 1,
      ),
    ),
  );
  const reportView =
    onViewChange &&
    ((v: CanvasView, c: CanvasCameraState) => {
      handingOff.current = true;
      queueMicrotask(() => {
        handingOff.current = false;
      });
      // P-05: copy the old view's pictures to fade out over the new one. The
      // copy is only a nicety: if it fails, the handoff is a plain cut and
      // still reaches the caller (R-32).
      try {
        const to = resolveView(tree, v);
        if (to) crossfade.current?.capture(to.key, to.height, c);
      } catch {
        // A plain cut.
      }
      onViewChange(v, c);
    });
  const reportCamera =
    onCameraChange &&
    ((c: CanvasCameraState) => {
      if (!handingOff.current) onCameraChange(c);
    });

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
      <OceanBackground map={water} reduceMotion={reduceMotion} />
      <MapContainer
        crs={FlatCRS}
        center={[0, 0]}
        zoom={-2}
        minZoom={CANVAS_MIN_ZOOM}
        maxZoom={4}
        zoomSnap={0}
        wheelPxPerZoomLevel={wheelPxPerZoomLevel}
        zoomAnimation={!reduceMotion}
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
        <KeepCanvasSized />
        {resolved && (
          <>
            {/* First: reads the camera still on screen before any other effect moves it. */}
            <GlideRequest
              tree={tree}
              view={view}
              viewKey={resolved.key}
              viewHeight={resolved.height}
              glide={glide}
              reduceMotion={reduceMotion}
              control={glideControl}
            />
            {/* CanvasCamera before FitMapOnOpen: sibling effects run in order (after
                every cleanup), so its moveend listener for this view is attached
                before the fit's synchronous fitBounds fires moveend, and the
                caller hears the fitted camera. */}
            {/* ZoomHandoff first: its zoomend listener for the new view is attached
                before CanvasCamera applies the handed-over camera. */}
            <ZoomHandoff
              tree={tree}
              view={view}
              viewKey={resolved.key}
              viewHeight={resolved.height}
              fitKey={`${resolved.key}#${fit.gen}`}
              armed={armed}
              glide={glideControl}
              onViewChange={reportView}
            />
            <OceanZoomLimit
              ocean={resolved.kind === "ocean"}
              fitWidth={resolved.fit.maxX - resolved.fit.minX}
              fitHeight={resolved.fit.maxY - resolved.fit.minY}
              viewKey={resolved.key}
            />
            <CanvasCamera
              viewKey={resolved.key}
              viewHeight={resolved.height}
              camera={isFit ? null : camera}
              onCameraChange={reportCamera}
              onApply={() => {
                armed.current = false;
              }}
              reduceMotion={reduceMotion}
              glide={glideControl}
            />
            <FitMapOnOpen
              mapId={`${resolved.key}#${fit.gen}`}
              mapWidth={resolved.fit.maxX - resolved.fit.minX}
              mapHeight={resolved.fit.maxY - resolved.fit.minY}
              bounds={boxBounds(resolved.height, resolved.fit)}
              skip={!isFit}
              fit={(map, b) => {
                const g = takeGlide(glideControl);
                if (!g) map.fitBounds(b, { animate: false });
                else
                  runGlide(map, glideControl, resolved.height, g, () =>
                    map.flyToBounds(b, { duration: GLIDE_SECONDS }),
                  );
              }}
            />
            {/* After CanvasCamera: the ghost goes on once the handed-over camera is applied. */}
            <HandoffCrossfade
              viewKey={resolved.key}
              reduceMotion={reduceMotion}
              control={crossfade}
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
  return (
    <>
      <MapPictures node={node} />
      <ChildFrames node={node} onEnterMap={onEnterMap} onFrameHover={onFrameHover} />
    </>
  );
}
