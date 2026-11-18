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
 * Feel (P-07): an outline eases into its hover look (`OUTLINE_EASE_MS`) and
 * shows a pressed look from pointer-down to release; its name is set in the
 * display font. Both looks live in `src/index.css` ("Shared canvas"), keyed
 * by the classes here: `is-hover`, `is-pressed`, and `atlas-canvas-eased`
 * (the transitions), which is never set under reduced motion. Each map
 * picture sits on a drawn chart paper until it has loaded, then fades in
 * (`pictureReveal.ts`, which also holds the rule with P-05's handoff fade).
 *
 * PLAYER-SAFE: the player viewer will mount this (R-33). Import nothing
 * editor- or viewer-only.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Polygon, SVGOverlay, Tooltip, useMap } from "react-leaflet";
import type L from "leaflet";
import type { PathOptions } from "leaflet";
import { useReduceMotion } from "@/hooks/use-reduce-motion";
import type { MapTreeNode } from "../ocean/mapTree";
import { MapImageLayers } from "../map/MapImageLayers";
import { normalizeAtlasAssetUrl } from "../url";
import type { Point } from "../content/schema";
import { boxBounds, childFrame, oceanMapSvg, placementCorners, toLatLng } from "./canvasGeometry";
import { PICTURE_START_CLASS, showLoadedPicture } from "./pictureReveal";

/** Leaflet pane for the canvas's own images: below every vector and marker a caller adds. */
export const CANVAS_IMAGE_PANE = "tilePane";

/** Hover and press ease (see `src/index.css`). */
export const OUTLINE_EASE_MS = 150;
/** On an outline, its label and a chart paper: animate state changes. Never under reduced motion. */
export const EASED_CLASS = "atlas-canvas-eased";
export const HOVER_CLASS = "is-hover";
export const PRESSED_CLASS = "is-pressed";
/** The label (Leaflet tooltip) class; its look is in `src/index.css`. */
export const LABEL_CLASS = "atlas-canvas-label";

// The attributes Leaflet sets; the stylesheet's frame rules (P-07) draw over
// them with eased transitions, and these stay as the look without it.
const OCEAN_IDLE: PathOptions = {
  className: "atlas-canvas-frame atlas-canvas-frame--ocean",
  color: "#f4ead2",
  weight: 1,
  opacity: 0,
  fill: true,
  fillColor: "#f4ead2",
  fillOpacity: 0,
};
const OCEAN_HOVER: PathOptions = { ...OCEAN_IDLE, opacity: 0.85, weight: 2, fillOpacity: 0.06 };
const FRAME_IDLE: PathOptions = {
  className: "atlas-canvas-frame atlas-canvas-frame--child",
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

/** The outline's path and its label: what the state classes go on. */
function outlineElements(layer: L.Polygon | null): HTMLElement[] {
  if (!layer) return [];
  const els = [layer.getElement(), layer.getTooltip()?.getElement()];
  return els.filter((e): e is HTMLElement => e instanceof Element);
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
  motion,
}: {
  id: string;
  name: string;
  positions: [number, number][];
  idle: PathOptions;
  hover: PathOptions;
  hovered: boolean;
  setHovered: (id: string | null) => void;
  onEnterMap?: (mapId: string) => void;
  motion: boolean;
}) {
  const map = useMap();
  // The Leaflet layer, from its `add` event (no ref: the test mocks of Polygon take none).
  const layer = useRef<L.Polygon | null>(null);
  const [pressed, setPressed] = useState(false);

  // Hover, press and the ease, as classes on the outline and its label.
  useEffect(() => {
    for (const el of outlineElements(layer.current)) {
      el.classList.toggle(HOVER_CLASS, hovered);
      el.classList.toggle(PRESSED_CLASS, pressed);
      el.classList.toggle(EASED_CLASS, motion);
    }
  }, [hovered, pressed, motion]);

  // Pressed: from a pointer-down on the outline until it is released anywhere,
  // or the press turns into a map drag.
  useEffect(() => {
    const el = layer.current?.getElement();
    if (!el) return;
    const release = () => {
      window.removeEventListener("pointerup", release);
      window.removeEventListener("pointercancel", release);
      setPressed(false);
    };
    const down = () => {
      setPressed(true);
      window.addEventListener("pointerup", release);
      window.addEventListener("pointercancel", release);
    };
    el.addEventListener("pointerdown", down);
    map.on("dragstart", release);
    return () => {
      el.removeEventListener("pointerdown", down);
      window.removeEventListener("pointerup", release);
      window.removeEventListener("pointercancel", release);
      map.off("dragstart", release);
    };
  }, [map]);

  // Leaflet centres a label by its width when it opens; the display font may
  // land after that, so centre it again once the page's fonts are in.
  useEffect(() => {
    let alive = true;
    const fonts = typeof document === "undefined" ? undefined : document.fonts;
    fonts?.ready.then(() => {
      if (alive) layer.current?.getTooltip()?.update();
    });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <Polygon
      positions={positions}
      pathOptions={hovered ? hover : idle}
      // A creation option: Leaflet sets a path's class once and `pathOptions`
      // (setStyle) never touches it.
      className={idle.className}
      eventHandlers={{
        add: (e) => {
          layer.current = e.target as L.Polygon;
        },
        click: () => onEnterMap?.(id),
        mouseover: () => setHovered(id),
        mouseout: () => setHovered(null),
      }}
    >
      <Tooltip permanent direction="center" className={LABEL_CLASS} opacity={1}>
        {name}
      </Tooltip>
    </Polygon>
  );
}

/**
 * Pictures that show once loaded (P-07): `onLoad` takes each loaded picture's
 * element; `done` once all `total` have shown (an error keeps its paper).
 */
function usePictureReveal(total: number) {
  const motion = !useReduceMotion();
  // Read when a picture loads, outside React's render.
  const motionRef = useRef(motion);
  useLayoutEffect(() => {
    motionRef.current = motion;
  }, [motion]);
  const seen = useRef(new WeakSet<Element>());
  const [shown, setShown] = useState(0);
  const onLoad = useCallback((el: Element | null | undefined) => {
    if (!el || seen.current.has(el)) return;
    seen.current.add(el);
    showLoadedPicture(
      el,
      () => motionRef.current,
      () => setShown((n) => n + 1),
    );
  }, []);
  return { motion, done: shown >= total, onLoad };
}

/**
 * A blank chart sheet under a map's pictures while they load: a flat tone, a
 * faint grid and a neat line, drawn in SVG and coloured by `src/index.css`.
 * Never a stand-in image. In `x y w h` of the SVG it sits in.
 */
function PaperSheet({
  x,
  y,
  w,
  h,
  done,
  motion,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  done: boolean;
  motion: boolean;
}) {
  const step = Math.max(w, h) / 12;
  const lines: string[] = [];
  for (let gx = x + step; gx < x + w - step / 4; gx += step) lines.push(`M${gx} ${y}V${y + h}`);
  for (let gy = y + step; gy < y + h - step / 4; gy += step) lines.push(`M${x} ${gy}H${x + w}`);
  const inset = step / 4;
  return (
    <g
      className={`atlas-chart-paper${done ? " is-done" : ""}${motion ? ` ${EASED_CLASS}` : ""}`}
      aria-hidden="true"
    >
      <rect className="atlas-chart-paper__sheet" x={x} y={y} width={w} height={h} />
      <path
        className="atlas-chart-paper__grid"
        d={lines.join("")}
        vectorEffect="non-scaling-stroke"
      />
      <rect
        className="atlas-chart-paper__border"
        x={x + inset}
        y={y + inset}
        width={Math.max(0, w - 2 * inset)}
        height={Math.max(0, h - 2 * inset)}
        vectorEffect="non-scaling-stroke"
      />
    </g>
  );
}

/** One top-level map on the ocean: its paper, pictures and outline. */
function OceanMap({
  node,
  oceanHeight,
  hovered,
  setHovered,
  onEnterMap,
}: {
  node: MapTreeNode;
  oceanHeight: number;
  hovered: boolean;
  setHovered: (id: string | null) => void;
  onEnterMap?: (mapId: string) => void;
}) {
  const svg = oceanMapSvg(node);
  const { motion, done, onLoad } = usePictureReveal(svg?.layers.length ?? 0);
  if (!svg || !node.placement) return null;
  const { box } = svg;
  const p = node.placement;
  const corners = placementCorners(p, node.map);
  const id = node.map.id;
  return (
    <>
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
            svg.rotation ? `rotate(${svg.rotation} ${svg.centre[0]} ${svg.centre[1]})` : undefined
          }
        >
          <PaperSheet
            x={p.x}
            y={p.y}
            w={node.map.width * p.scale}
            h={node.map.height * p.scale}
            done={done}
            motion={motion}
          />
          {svg.layers.map((l) => (
            <image
              key={l.id}
              // Set once; pictureReveal changes the classes on the element.
              className={PICTURE_START_CLASS}
              onLoad={(e) => onLoad(e.currentTarget)}
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
        positions={corners.map((pt) => toLatLng(oceanHeight, pt))}
        idle={OCEAN_IDLE}
        hover={OCEAN_HOVER}
        hovered={hovered}
        setHovered={setHovered}
        onEnterMap={onEnterMap}
        motion={motion}
      />
    </>
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
      {roots.map((node) => (
        <OceanMap
          key={node.map.id}
          node={node}
          oceanHeight={oceanHeight}
          hovered={hovered === node.map.id}
          setHovered={setHovered}
          onEnterMap={onEnterMap}
        />
      ))}
    </>
  );
}

/**
 * A map's own pictures in the map view, drawn as the viewer draws them
 * (`MapImageLayers`), each copy (`wrapX`) on its chart paper until loaded.
 */
export function MapPictures({ node }: { node: MapTreeNode }) {
  const { map } = node;
  const offsets = map.wrapX ? [-map.width, 0, map.width] : [0];
  const { motion, done, onLoad } = usePictureReveal(map.layers.length * offsets.length);
  const handlers = useMemo<L.LeafletEventHandlerFnMap>(
    () => ({ load: (e) => onLoad((e.target as L.ImageOverlay).getElement()) }),
    [onLoad],
  );
  const paperHandlers = useMemo<L.LeafletEventHandlerFnMap>(
    // Under the pictures, whatever order Leaflet added them in.
    () => ({ add: (e) => (e.target as L.SVGOverlay).bringToBack() }),
    [],
  );
  return (
    <>
      {offsets.map((dx) => (
        <SVGOverlay
          key={`paper-${dx}`}
          bounds={boxBounds(map.height, {
            minX: dx,
            minY: 0,
            maxX: dx + map.width,
            maxY: map.height,
          })}
          attributes={{
            viewBox: `0 0 ${map.width} ${map.height}`,
            preserveAspectRatio: "none",
          }}
          interactive={false}
          pane={CANVAS_IMAGE_PANE}
          eventHandlers={paperHandlers}
        >
          <PaperSheet x={0} y={0} w={map.width} h={map.height} done={done} motion={motion} />
        </SVGOverlay>
      ))}
      {offsets.map((dx) => (
        <MapImageLayers
          key={`wrap-${dx}`}
          map={map}
          dx={dx}
          pane={CANVAS_IMAGE_PANE}
          className={PICTURE_START_CLASS}
          eventHandlers={handlers}
        />
      ))}
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
  const motion = !useReduceMotion();
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
            motion={motion}
          />
        );
      })}
    </>
  );
}
