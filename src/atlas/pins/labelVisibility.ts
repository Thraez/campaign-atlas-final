/**
 * Zoom × priority threshold for pin label de-cluttering.
 *
 * Returns the minimum priority a pin must have for its label to show
 * permanently at the given zoom level (in "auto" labelMode only).
 * Explicit labelMode "always"/"hover"/"never" pins ignore this threshold.
 *
 * Calibrated to match existing preset labelMinZoom values:
 *   capital (priority 9)  → visible at zoom >= -6
 *   settlement (priority 6) → visible at zoom >= -3
 *   npc/item (priority 1-2) → visible at zoom >= 1-2
 *   everything else       → visible at zoom >= 3
 */
export function labelVisibilityThreshold(zoom: number): number {
  return Math.max(0, 3 - zoom);
}

/**
 * A map with fewer pins than this has nothing to de-clutter, so priority
 * thinning is skipped entirely and every label shows.
 *
 * Without this, the threshold quietly emptied sparse maps of all names. The
 * viewer opens at zoom -2, where the threshold is 5, and the common types a
 * young world is made of — events, imported notes, ruins, caves, anything
 * falling through to the `custom` preset — all sit at priority 3 or below. So an
 * atlas with six pins rendered six unlabelled dots and made the reader click
 * each one to find out what it was, to solve a crowding problem it didn't have.
 * Overlap is still prevented by the caller's collision check.
 */
export const DECLUTTER_MIN_PINS = 12;

/**
 * Returns true when an "auto" mode pin label with the given priority should
 * render permanently at this zoom level. False means render hover-only.
 *
 * Governs only "auto" labelMode; callers handle "always"/"hover"/"never".
 *
 * `pinCount` is the number of pins competing for space on the map. Omit it to
 * get the pure zoom × priority decision.
 */
export function shouldShowLabel(zoom: number, priority: number, pinCount?: number): boolean {
  if (pinCount !== undefined && pinCount < DECLUTTER_MIN_PINS) return true;
  return priority >= labelVisibilityThreshold(zoom);
}
