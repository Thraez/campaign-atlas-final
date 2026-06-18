import type { SoundscapeConfig, SoundArea } from "../../src/atlas/content/schema";
import { PLAYER_VISIBLE } from "./visibility";

/**
 * Strip DM-visible areas and neutralise identifying metadata for player builds.
 *
 * - Drops areas where visibility is "dm" or "hidden".
 * - Replaces area IDs with positional indices (area-0, area-1, ...) so DM
 *   location names never reach the player artifact.
 * - Strips the `name` field (DM labeling).
 * - Preserves all other fields (bed src, gain, points, regionId, etc.).
 *   Audio filename content-hashing is handled separately (Task 14).
 */
export function filterSoundscapeForPlayer(sc: SoundscapeConfig | undefined): SoundscapeConfig | undefined {
  if (!sc) return undefined;

  const kept: SoundArea[] = (sc.areas ?? [])
    .filter((a) => !a.visibility || PLAYER_VISIBLE.has(a.visibility))
    .map((a, i): SoundArea => {
      const { name: _name, ...rest } = a;
      return { ...rest, id: `area-${i}` };
    });

  return { ...sc, areas: kept };
}
