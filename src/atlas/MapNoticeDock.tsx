import type { CSSProperties, ReactNode } from "react";
import { noticeDockClearancePx, noticeDockRightPx } from "@/atlas/noticeDockLayout";

/**
 * The one place map notices go (sound invite and controls, the update toast,
 * the Wander note), so they stack instead of covering the minimap, Wander,
 * the layer credits or each other. Placement lives in `.atlas-notice-dock`
 * (src/index.css); the numbers in `noticeDockLayout.ts`.
 * Children are laid out top to bottom, right-aligned.
 */
export function MapNoticeDock({
  minimapHeight,
  creditCount = 0,
  scaleBar = false,
  children,
}: {
  minimapHeight: number | null;
  /** Active layer credits shown in the corner above the minimap. */
  creditCount?: number;
  /** The map shows a scale bar (above Wander on a phone, Q-03). */
  scaleBar?: boolean;
  children: ReactNode;
}) {
  const right = noticeDockRightPx(creditCount);
  const style = {
    "--atlas-dock-clear": `${noticeDockClearancePx(minimapHeight, creditCount, scaleBar)}px`,
    ...(right != null ? { "--atlas-dock-right": `${right}px` } : {}),
  } as CSSProperties;
  return (
    <div className="atlas-notice-dock" data-testid="map-notice-dock" style={style}>
      {children}
    </div>
  );
}
