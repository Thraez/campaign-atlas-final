/**
 * Pure geometry helpers for the map-layer editor. Kept in their own file
 * (not MapLayerPanel.tsx) so Fast Refresh works cleanly — Vite's component
 * refresh treats non-component exports from a TSX file as side effects.
 */

/**
 * Phase 1B B3. Returns the new `{ x, y, width, height }` so the layer's
 * center stays fixed when its size changes. Used by the scale presets
 * (50/75/.../Fit) so they no longer drift the layer toward the top-left.
 */
export function centerAnchoredResize(
  current: { x: number; y: number; width: number; height: number },
  nextWidth: number,
  nextHeight: number,
): { x: number; y: number; width: number; height: number } {
  const nw = Math.max(1, Math.round(nextWidth));
  const nh = Math.max(1, Math.round(nextHeight));
  const cx = current.x + current.width / 2;
  const cy = current.y + current.height / 2;
  return {
    x: Math.round(cx - nw / 2),
    y: Math.round(cy - nh / 2),
    width: nw,
    height: nh,
  };
}

/**
 * Clamp a layer rectangle to the map canvas. Used at the drag/resize commit
 * point so a layer can never persist with coordinates that put it (partially
 * or fully) outside the authored canvas. The drag preview still shows the
 * raw pointer position; only the committed snapshot is clamped — that keeps
 * the interaction feel-good while making the saved YAML clean.
 *
 * Width/height are clamped to the map canvas first so a layer can never
 * commit larger than the map, then x/y so the top-left sits in
 * [0, canvas - dim]. Width/height are floored at 1 so resize math stays
 * well-defined (a 0-size layer would invert the corner handles).
 */
export function clampLayerToCanvas(
  rect: { x: number; y: number; width: number; height: number },
  mapDoc: { width: number; height: number },
): { x: number; y: number; width: number; height: number } {
  const w = Math.max(1, Math.min(rect.width, mapDoc.width));
  const h = Math.max(1, Math.min(rect.height, mapDoc.height));
  const x = Math.max(0, Math.min(rect.x, mapDoc.width - w));
  const y = Math.max(0, Math.min(rect.y, mapDoc.height - h));
  return { x, y, width: w, height: h };
}
