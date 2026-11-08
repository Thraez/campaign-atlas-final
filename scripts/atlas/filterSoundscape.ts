import type { SoundscapeConfig, SoundArea } from "../../src/atlas/content/schema";

/**
 * Keep the sound areas a player build ships and neutralise identifying
 * metadata.
 *
 * - `ships` decides each area: the build passes the per-campaign resolver's
 *   verdict (ADR-0004). A ride-on area (regionId set) follows its region; a
 *   sound-only area ships only if its own visibility does and no point of it
 *   is under fog (arch-02).
 * - Drops areas with no file chosen yet (blank/whitespace bed.src) — a
 *   half-configured sound zone must never reach hashAudioAssets, which
 *   would otherwise try to read the public dir itself and crash the build.
 * - Replaces area IDs with positional indices (area-0, area-1, ...) so DM
 *   location names never reach the player artifact.
 * - Strips the `name` field (DM labeling).
 * - Preserves all other fields (bed src, gain, points, regionId, etc.).
 *   Audio filename content-hashing is handled separately (Task 14).
 */
export function filterSoundscapeForPlayer(
  sc: SoundscapeConfig | undefined,
  ships: (area: SoundArea) => boolean,
): SoundscapeConfig | undefined {
  if (!sc) return undefined;

  const kept: SoundArea[] = (sc.areas ?? [])
    .filter((a) => ships(a))
    .filter((a) => a.bed.src.trim().length > 0)
    .map((a, i): SoundArea => {
      const { name: _name, ...rest } = a;
      return { ...rest, id: `area-${i}` };
    });

  return { ...sc, areas: kept };
}
