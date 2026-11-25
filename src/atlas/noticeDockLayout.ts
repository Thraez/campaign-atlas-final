// Pure layout numbers for the map's bottom-right corner (P-01): the minimap,
// the layer-credit stack above it, and the notice dock above both.

/** The bottom row's offset from the map edge (Tailwind bottom-3). */
const ROW_OFFSET_PX = 12;
/**
 * Wander plus its "n of m places" meter, on a phone: the 40 px button
 * (Q-03, `.atlas-wander` in src/index.css), a 6 px gap and the 16 px meter.
 */
const WANDER_HEIGHT_PX = 62;
const GAP_PX = 8;
/** The scale bar's box: the bar, its label and the pill's padding and border. */
const SCALE_BAR_HEIGHT_PX = 42;
/** One static credit badge: 9px text at line-height 1.3 plus 1px padding top and bottom. */
const CREDIT_BADGE_PX = 14;
/** The credit stack's flex gap (gap-1). */
const CREDIT_GAP_PX = 4;
/** The credit stack's right-2 offset plus its max-w-[240px]. */
const CREDIT_STACK_RIGHT_EDGE_PX = 8 + 240;

/**
 * Where the layer-credit stack rests: just above the minimap, or at the
 * corner's 0.5rem when no minimap shows (null, as on the v2 ocean).
 */
export function creditOverlayBottomPx(minimapHeight: number | null): number {
  return minimapHeight != null ? ROW_OFFSET_PX + minimapHeight + GAP_PX : GAP_PX;
}

/** Height of a stack of `count` credit badges (0 when there are none). */
export function creditStackHeightPx(count: number): number {
  return count > 0 ? count * CREDIT_BADGE_PX + (count - 1) * CREDIT_GAP_PX : 0;
}

/**
 * Where the scale bar rests on a phone (Q-03): bottom-left, just above
 * Wander, since the gap between Wander and the minimap is too narrow for it.
 * `.atlas-scale-bar` in src/index.css uses the same number.
 */
export const PHONE_SCALE_BAR_BOTTOM_PX = ROW_OFFSET_PX + WANDER_HEIGHT_PX + GAP_PX;

/**
 * How far above the map's bottom edge the notice dock sits on a phone:
 * clear of the taller of the left column (Wander, and the scale bar above it
 * when the map has one) and the minimap, and of the credit stack when the
 * map has active layer credits.
 */
export function noticeDockClearancePx(
  minimapHeight: number | null,
  creditCount = 0,
  scaleBar = false,
): number {
  const left = scaleBar ? WANDER_HEIGHT_PX + GAP_PX + SCALE_BAR_HEIGHT_PX : WANDER_HEIGHT_PX;
  const base = ROW_OFFSET_PX + Math.max(minimapHeight ?? 0, left) + GAP_PX;
  if (creditCount <= 0) return base;
  const creditTop = creditOverlayBottomPx(minimapHeight) + creditStackHeightPx(creditCount);
  return Math.max(base, creditTop + GAP_PX);
}

/**
 * From 640 px the dock sits left of the corner column. With credits that
 * column is the credit stack's full width, not just the minimap's 180 px;
 * null keeps the CSS default.
 */
export function noticeDockRightPx(creditCount: number): number | null {
  return creditCount > 0 ? CREDIT_STACK_RIGHT_EDGE_PX + ROW_OFFSET_PX : null;
}
