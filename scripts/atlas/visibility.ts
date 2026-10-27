/**
 * Re-export shim: the canonical entity-visibility vocabulary lives in
 * `src/atlas/content/visibility.ts` so the app and the build tooling share ONE
 * definition and it can never drift. Same names as the source: no aliases.
 */
export {
  ALL_VISIBILITY,
  VALID_VISIBILITY,
  PLAYER_VISIBLE_VISIBILITY,
  isPlayerVisible,
  isSecretVisibility,
  isValidVisibility,
} from "../../src/atlas/content/visibility";
