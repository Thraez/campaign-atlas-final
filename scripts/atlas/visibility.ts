/**
 * Single source of truth for which entity visibilities are allowed in
 * player-shipped artifacts. Imported by both the build pipeline
 * (scripts/build-atlas.ts) and the post-build artifact shape checker
 * (scripts/check-artifact-shape.ts) so the literal can never drift.
 */
import type { EntityVisibility } from "../../src/atlas/content/schema";

export const PLAYER_VISIBLE: ReadonlySet<EntityVisibility> = new Set<EntityVisibility>([
  "player",
  "rumor",
]);