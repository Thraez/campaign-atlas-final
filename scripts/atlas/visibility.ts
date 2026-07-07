/**
 * Re-export shim: the canonical entity-visibility vocabulary lives in
 * `src/atlas/content/visibility.ts` so the app and the build tooling share ONE
 * definition and it can never drift. Kept here (with the historical
 * `PLAYER_VISIBLE` name) so `build-atlas.ts` and `check-artifact-shape.ts` —
 * which import the player-visible set from this path — did not have to change.
 */
export {
  ALL_VISIBILITY,
  VALID_VISIBILITY,
  PLAYER_VISIBLE_VISIBILITY,
  PLAYER_VISIBLE_VISIBILITY as PLAYER_VISIBLE,
  isPlayerVisible,
  isSecretVisibility,
  isValidVisibility,
} from "../../src/atlas/content/visibility";
