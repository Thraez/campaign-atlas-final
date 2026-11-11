/**
 * What the shared canvas draws itself (R-31): the top-level maps on the ocean,
 * and a map's child frames. Each map or frame is an outline polygon that takes
 * the click and the hover and carries the name label.
 *
 * Top-level maps render through one `SVGOverlay` each, not `ImageOverlay`:
 * Leaflet places and scales the `<svg>` like any image overlay, and inside it
 * a `viewBox` in ocean pixels plus a native SVG `rotate()` turns the map about
 * its centre. So a placement's rotation survives pan and zoom (and Leaflet's
 * zoom animation) with no per-frame code and no new dependency. Why not the
 * others: an `ImageOverlay` can't rotate, and a CSS transform on its `<img>`
 * fights the transform Leaflet itself sets on it; a rotated-image plugin is a
 * new dependency; a canvas layer redraws on every move.
 *
 * PLAYER-SAFE: the player viewer will mount this (R-33). Import nothing
 * editor- or viewer-only.
 */
import { Fragment, useEffect, useRef, useState } from "react";
import { Polygon, SVGOverlay, Tooltip } from "react-leaflet";
import type { PathOptions } from "leaflet";
import type { MapTreeNode } from "../ocean/mapTree";
import { normalizeAtlasAssetUrl } from "../url";
import type { Point } from "../content/schema";
import { boxBounds, childFrame, oceanMapSvg, placementCorners, toLatLng } from "./canvasGeometry";

/** Leaflet pane for the canvas's own images: below every vector and marker a caller adds. */
export const CANVAS_IMAGE_PANE = "tilePane";

const OCEAN_IDLE: PathOptions = {
  color: "#f4ead2",
  weight: 1,
  opacity: 0,
  fill: true,
  fillColor: "#f4ead2",
  fillOpacity: 0,
};
const OCEAN_HOVER: PathOptions = { ...OCEAN_IDLE, opacity: 0.85, weight: 2, fillOpacity: 0.06 };
const FRAME_IDLE: PathOptions = {
  color: "#f4ead2",
  weight: 1.5,
  opacity: 0.6,
  dashArray: "6 6",
  fill: true,
  fillColor: "#f4ead2",
  fillOpacity: 0.04,
};
const FRAME_HOVER: PathOptions = {
  ...FRAME_IDLE,
  weight: 2.5,
  opacity: 1,
  dashArray: undefined,
  fillOpacity: 0.14,
};

export interface FrameHandlers {
  onEnterMap?: (mapId: string) => void;
  onFrameHover?: (mapId: string | null) => void;
}

/** Hover state for one view's outlines; tells the caller, and clears on unmount. */
function useHover(onFrameHover: FrameHandlers["onFrameHover"]) {
  const [hovered, setHovered] = useState<string | null>(null);
  const hoveredRef = useRef<string | null>(null);
  const cbRef = useRef(onFrameHover);
  useEffect(() => {
    cbRef.current = onFrameHover;
  });
  useEffect(
    () => () => {
      // Entering a map unmounts the outline under the pointer with no mouseout.
      if (hoveredRef.current !== null) cbRef.current?.(null);
    },
    [],
  );
  const set = (id: string | null) => {
    hoveredRef.current = id;
    setHovered(id);
    cbRef.current?.(id);
  };
  return [hovered, set] as const;
}

function Outline({
  id,
  name,
  positions,
  idle,
  hover,
  hovered,
  setHovered,
  onEnterMap,
}: {
  id: string;
  name: string;
  positions: [number, number][];
  idle: PathOptions;
  hover: PathOptions;
  hovered: boolean;
  setHovered: (id: string | null) => void;
  onEnterMap?: (mapId: string) => void;
}) {
  return (
    <Polygon
      positions={positions}
      pathOptions={hovered ? hover : idle}
      eventHandlers={{
        click: () => onEnterMap?.(id),
        mouseover: () => setHovered(id),
        mouseout: () => setHovered(null),
      }}
    >
      <Tooltip permanent direction="center" className="atlas-canvas-label" opacity={1}>
        {name}
      </Tooltip>
    </Polygon>
  );
}

/** Every top-level map at its ocean placement, with its name. No pins, regions or routes. */
export function OceanMaps({
  roots,
  oceanHeight,
  onEnterMap,
  onFrameHover,
}: { roots: MapTreeNode[]; oceanHeight: number } & FrameHandlers) {
  const [hovered, setHovered] = useHover(onFrameHover);
  return (
    <>
      {roots.map((node) => {
        const svg = oceanMapSvg(node);
        if (!svg || !node.placement) return null;
        const { box } = svg;
        const corners = placementCorners(node.placement, node.map);
        const id = node.map.id;
        return (
          <Fragment key={id}>
            <SVGOverlay
              // viewBox is set once, when Leaflet creates the <svg>: remount on a new box.
              key={`${box.minX},${box.minY},${box.maxX},${box.maxY}`}
              bounds={boxBounds(oceanHeight, box)}
              attributes={{
                viewBox: `${box.minX} ${box.minY} ${box.maxX - box.minX} ${box.maxY - box.minY}`,
                preserveAspectRatio: "none",
                "data-canvas-map": id,
              }}
              interactive={false}
              pane={CANVAS_IMAGE_PANE}
            >
              <g
                transform={
                  svg.rotation
                    ? `rotate(${svg.rotation} ${svg.centre[0]} ${svg.centre[1]})`
                    : undefined
                }
              >
                {svg.layers.map((l) => (
                  <image
                    key={l.id}
                    href={normalizeAtlasAssetUrl(l.src)}
                    x={l.x}
                    y={l.y}
                    width={l.w}
                    height={l.h}
                    opacity={l.opacity}
                    preserveAspectRatio="none"
                  />
                ))}
              </g>
            </SVGOverlay>
            <Outline
              id={id}
              name={node.map.name}
              positions={corners.map((p) => toLatLng(oceanHeight, p))}
              idle={OCEAN_IDLE}
              hover={OCEAN_HOVER}
              hovered={hovered === id}
              setHovered={setHovered}
              onEnterMap={onEnterMap}
            />
          </Fragment>
        );
      })}
    </>
  );
}

/** Each child's frame on its parent, as a soft outline with the child's name. */
export function ChildFrames({
  node,
  onEnterMap,
  onFrameHover,
}: { node: MapTreeNode } & FrameHandlers) {
  const [hovered, setHovered] = useHover(onFrameHover);
  const H = node.map.height;
  return (
    <>
      {node.children.map((child) => {
        const outline: Point[] | null = childFrame(child);
        if (!outline) return null;
        const id = child.map.id;
        return (
          <Outline
            key={id}
            id={id}
            name={child.map.name}
            positions={outline.map((p) => toLatLng(H, p))}
            idle={FRAME_IDLE}
            hover={FRAME_HOVER}
            hovered={hovered === id}
            setHovered={setHovered}
            onEnterMap={onEnterMap}
          />
        );
      })}
    </>
  );
}
