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

/**
 * Phase 1B B2 — corner-handle resize math, in atlas space.
 *
 * `delta` is the pointer movement already converted to atlas units
 * (dx = +east, dy = +south — i.e. dy = -dLat). The result is unrounded and
 * unclamped; the caller rounds and clamps (via clampLayerToCanvas) at commit
 * time. Behaviour by mode:
 *   - default: the corner opposite the dragged one stays put.
 *   - centerAnchored (Alt): the layer's center stays put; all four corners move.
 *   - aspectLocked (Shift or the panel toggle): width/height are held to the
 *     start aspect ratio, driven by the larger of the two deltas.
 * Width/height are floored at 1 so the corner handles can't invert.
 */
export function resizeFromCornerDrag(opts: {
  corner: "nw" | "ne" | "sw" | "se";
  start: { x: number; y: number; width: number; height: number };
  delta: { dx: number; dy: number };
  centerAnchored: boolean;
  aspectLocked: boolean;
}): { x: number; y: number; width: number; height: number } {
  const { corner, start, delta, centerAnchored, aspectLocked } = opts;
  const { x: startX, y: startY, width: startW, height: startH } = start;
  const { dx, dy } = delta;
  const aspect = startH === 0 ? 1 : startW / startH;

  // For non-center modes, the corner that stays put is the *opposite* of the
  // one being dragged.
  const isN = corner === "nw" || corner === "ne";
  const isW = corner === "nw" || corner === "sw";

  let nx = startX;
  let ny = startY;
  let nw = startW;
  let nh = startH;

  if (centerAnchored) {
    // Center-anchored: every corner moves. dx grows width on the dragged side;
    // the symmetric side grows the same, so width changes by 2*|dx|.
    const wScale = isW ? -2 * dx : 2 * dx; // dragging W shrinks when dx>0
    const hScale = isN ? -2 * dy : 2 * dy; // dragging N shrinks when dy>0
    nw = Math.max(1, startW + wScale);
    nh = Math.max(1, startH + hScale);
    if (aspectLocked) {
      if (nw / aspect > nh) nh = nw / aspect;
      else nw = nh * aspect;
    }
    // Reposition top-left so the center is unchanged.
    nx = startX + (startW - nw) / 2;
    ny = startY + (startH - nh) / 2;
  } else {
    // Opposite-corner anchored.
    if (isW) {
      nx = startX + dx;
      nw = Math.max(1, startW - dx);
    } else {
      nw = Math.max(1, startW + dx);
    }
    if (isN) {
      ny = startY + dy;
      nh = Math.max(1, startH - dy);
    } else {
      nh = Math.max(1, startH + dy);
    }
    if (aspectLocked) {
      // Drive the smaller delta off the larger one to hold the aspect ratio.
      const widthDriven = Math.abs(nw - startW) > Math.abs(nh - startH);
      if (widthDriven) {
        const newH = nw / aspect;
        if (isN) ny = startY + (startH - newH);
        nh = newH;
      } else {
        const newW = nh * aspect;
        if (isW) nx = startX + (startW - newW);
        nw = newW;
      }
    }
  }

  return { x: nx, y: ny, width: nw, height: nh };
}
