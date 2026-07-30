import type { Entity } from "@/atlas/content/schema";

/** How many entries the reading-panel welcome offers as starting points. */
export const STARTER_COUNT = 3;

/**
 * Pick a few entries worth opening first.
 *
 * Prefers entries that have a summary — a starting point that opens onto an
 * empty page is worse than no starting point — and, among those, ones already
 * on the map and ones with an image. Ties break on title so the panel doesn't
 * reshuffle between loads.
 */
export function pickStarters(
  entities: readonly Entity[],
  isPlaced: (id: string) => boolean,
  count = STARTER_COUNT,
): Entity[] {
  const scored = entities
    .filter((e) => !!e.summary?.trim())
    .map((e) => ({ e, score: (isPlaced(e.id) ? 2 : 0) + (e.images.length > 0 ? 1 : 0) }));
  scored.sort((a, b) => b.score - a.score || a.e.title.localeCompare(b.e.title));
  return scored.slice(0, count).map((s) => s.e);
}
