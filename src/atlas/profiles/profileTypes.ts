/**
 * Profile + relationship types stored under `atlas:` in entity frontmatter.
 *
 * The build pipeline is responsible for stripping `profile.dm` and DM-only
 * relationships from player builds — see scripts/build-atlas.ts and the
 * helpers in `./profileBuild.ts`.
 */
import type { EntityVisibility } from "@/atlas/content/schema";

/** Player-safe half of a profile. Always shipped to player builds. */
export interface PlayerProfile {
  known_for?: string;
  visible_traits?: string[];
  rumors?: string[];
}

/** DM-only half. Free-form keys per entity type. NEVER shipped to players. */
export type DmProfile = Record<string, string | undefined>;

export interface EntityProfile {
  player?: PlayerProfile;
  dm?: DmProfile;
}

export interface EntityRelationship {
  /** Target entity id (slug). May be unresolved at author time. */
  entity: string;
  /** Verb — see RELATIONSHIP_TYPES for common values, but free-form is allowed. */
  type: string;
  /** Optional human label shown in UI. */
  label?: string;
  /** Optional longer description (DM notes for dm-visibility). */
  description?: string;
  visibility: EntityVisibility;
}
