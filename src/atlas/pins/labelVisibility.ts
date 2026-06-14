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
 * Returns true when an "auto" mode pin label with the given priority should
 * render permanently at this zoom level. False means render hover-only.
 *
 * Governs only "auto" labelMode; callers handle "always"/"hover"/"never".
 */
export function shouldShowLabel(zoom: number, priority: number): boolean {
  return priority >= labelVisibilityThreshold(zoom);
}
