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
