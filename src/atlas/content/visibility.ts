/**
 * Single source of truth for the entity-visibility vocabulary.
 *
 * `visibility` decides what ships to players, so every place that validates,
 * filters, or gates on it must agree on the exact same value set. Rather than
 * re-listing `["player", "dm", "hidden", "rumor"]` (or the `dm | hidden` secret
 * subset) in a dozen files where one could silently drift from another, they
 * all import from here.
 *
 * Lives in `src/` (not `scripts/`) because the app cannot import from the build
 * tooling, but the build tooling can — and does — import from `src/`. The
 * `scripts/atlas/visibility.ts` shim re-exports these under their historical
 * names so the build pipeline's import paths never had to change.
 */
import type { EntityVisibility } from "./schema";

/** Every accepted `atlas.visibility` value, in canonical order. */
export const ALL_VISIBILITY: readonly EntityVisibility[] = ["player", "dm", "hidden", "rumor"];

/** The same values as a Set, for O(1) membership checks. */
export const VALID_VISIBILITY: ReadonlySet<EntityVisibility> = new Set(ALL_VISIBILITY);

/**
 * Visibilities that MAY appear in player-shipped artifacts. Everything not in
 * this set is DM-only. `rumor` is player-visible — the players have heard the
 * rumour even if it turns out false.
 */
export const PLAYER_VISIBLE_VISIBILITY: ReadonlySet<EntityVisibility> = new Set<EntityVisibility>([
  "player",
  "rumor",
]);

/** True when `v` may ship to players. */
export function isPlayerVisible(v: EntityVisibility): boolean {
  return PLAYER_VISIBLE_VISIBILITY.has(v);
}

/** True when `v` must never reach players (DM-only: `dm` | `hidden`). */
export function isSecretVisibility(v: EntityVisibility): boolean {
  return !isPlayerVisible(v);
}

/** Narrowing guard: is an arbitrary value one of the accepted visibilities? */
export function isValidVisibility(v: unknown): v is EntityVisibility {
  return typeof v === "string" && (VALID_VISIBILITY as ReadonlySet<string>).has(v);
}
