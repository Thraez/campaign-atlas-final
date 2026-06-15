import type { MapScale } from "@/atlas/content/schema";

export function measureDistance(
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  scale: MapScale | undefined
): { distPx: number; label: string } {
  const distPx = Math.hypot(p2.x - p1.x, p2.y - p1.y);
  const label = scale
    ? `${(distPx * scale.unitsPerPixel).toFixed(1)} ${scale.unitLabel}`
    : `${Math.round(distPx)} px`;
  return { distPx, label };
}
