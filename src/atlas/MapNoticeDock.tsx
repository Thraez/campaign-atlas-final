import type { CSSProperties, ReactNode } from "react";

/** The bottom row's offset from the map edge (Tailwind bottom-3). */
const ROW_OFFSET_PX = 12;
/** Wander plus its "n of m places" meter. */
const WANDER_HEIGHT_PX = 60;
const GAP_PX = 8;

/**
 * Pure: how far above the map's bottom edge the notice dock sits on a phone,
 * clear of the taller of Wander and the minimap (null when no minimap shows,
 * as on the v2 ocean).
 */
export function noticeDockClearancePx(minimapHeight: number | null): number {
  return ROW_OFFSET_PX + Math.max(minimapHeight ?? 0, WANDER_HEIGHT_PX) + GAP_PX;
}

/**
 * The one place map notices go (sound invite and controls, the update toast,
 * the Wander note), so they stack instead of covering the minimap, Wander or
 * each other. Placement lives in `.atlas-notice-dock` (src/index.css).
 * Children are laid out top to bottom, right-aligned.
 */
export function MapNoticeDock({
  minimapHeight,
  children,
}: {
  minimapHeight: number | null;
  children: ReactNode;
}) {
  const style = {
    "--atlas-dock-clear": `${noticeDockClearancePx(minimapHeight)}px`,
  } as CSSProperties;
  return (
    <div className="atlas-notice-dock" data-testid="map-notice-dock" style={style}>
      {children}
    </div>
  );
}
