import type { MapPlacement } from "../content/schema";

export interface WanderTarget {
  entityId: string;
  mapId: string;
  x: number;
  y: number;
}

/**
 * Pick a random place the player can already see (present in player data =
 * visible within fog) but has not opened yet. De-duplicates by entity so an
 * entity pinned on overlapping maps counts once. Returns null when nothing is
 * left to discover.
 */
export function selectWanderTarget(
  placements: MapPlacement[],
  visited: Set<string>,
  rand: () => number = Math.random,
): WanderTarget | null {
  const byEntity = new Map<string, MapPlacement>();
  for (const p of placements) {
    if (!byEntity.has(p.entityId)) byEntity.set(p.entityId, p);
  }
  const candidates: WanderTarget[] = [];
  for (const [entityId, p] of byEntity) {
    if (visited.has(entityId)) continue;
    candidates.push({ entityId, mapId: p.mapId, x: p.x, y: p.y });
  }
  if (candidates.length === 0) return null;
  const idx = Math.min(candidates.length - 1, Math.floor(rand() * candidates.length));
  return candidates[idx];
}
