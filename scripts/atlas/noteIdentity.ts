/**
 * How a note's title and visibility are worked out from its file and
 * frontmatter. The build and the derived-secret scan both use these, so the
 * scan always looks for exactly the names the build ships.
 */
import path from "node:path";
import type { EntityVisibility } from "../../src/atlas/content/schema";
import { PLAYER_VISIBLE_VISIBILITY } from "../../src/atlas/content/visibility";

export function deriveTitle(file: string, fmTitle?: unknown): string {
  if (typeof fmTitle === "string" && fmTitle.trim()) return fmTitle.trim();
  return path
    .basename(file, ".md")
    .replace(/[-_]+/g, " ")
    .trim()
    .replace(/(^|\s)(\p{L})/gu, (_m, sp, ch) => sp + ch.toUpperCase());
}

/** ADR-0001: no visibility means dm. Only an explicit tag, or the legacy
 *  `publish: true`, ships a note. */
export function resolveVisibility(atlas: {
  visibility?: EntityVisibility;
  publish?: boolean;
}): EntityVisibility {
  return atlas.visibility ?? (atlas.publish === true ? "player" : "dm");
}

/** A note players must never see: not player-visible, or `publish: false`. */
export function isSecretNote(atlas: { visibility?: EntityVisibility; publish?: boolean }): boolean {
  return !PLAYER_VISIBLE_VISIBILITY.has(resolveVisibility(atlas)) || atlas.publish === false;
}
