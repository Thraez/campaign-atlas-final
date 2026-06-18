import type { MapPlacement } from "../content/schema";

export interface MeterCounts { discovered: number; total: number }

/** "X of Y places" — Y = distinct placed entities, X = those the player has opened. */
export function discoveryMeter(placements: MapPlacement[], visited: Set<string>): MeterCounts {
  const placed = new Set<string>();
  for (const p of placements) placed.add(p.entityId);
  let discovered = 0;
  for (const id of placed) if (visited.has(id)) discovered += 1;
  return { discovered, total: placed.size };
}
