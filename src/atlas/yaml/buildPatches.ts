/**
 * Shared draft shapes for the editor's Save flow.
 *
 * {@link PlacementOverride} is the placement-draft shape consumed by
 * validateProject and the placement editor. {@link EntityFrontmatterPatch} is
 * the desired `atlas:` block for one entity .md file, consumed by the
 * canonical entity save.
 */

import type { EntityVisibility } from "@/atlas/content/schema";

// --------------------------------------------------------------------------
// PLACEMENT OVERRIDE — contract between the placement editor and
// validateProject. Save writes placements via canonicalPlacementSave.ts.
// --------------------------------------------------------------------------

export interface PlacementOverride {
  entityId: string;
  mapId: string;
  x: number;
  y: number;
  /** Optional label override (defaults to entity.title at render time). */
  label?: string;
  /** Optional pin styling — only diff vs. the type preset is emitted. */
  pin?: import("@/atlas/pins/presets").PinOverride;
}

// --------------------------------------------------------------------------
// ENTITY FRONTMATTER PATCH (full atlas: block, merged by canonicalEntitySave)
// --------------------------------------------------------------------------

export interface EntityFrontmatterPatch {
  /** Source-relative path to the .md file (e.g. "settlements/Sunhaven.md"). */
  sourcePath: string;
  /** Title written to the file's top-level `title:` if missing. */
  title?: string;
  /** Suggested atlas: block. Keys are written in canonical order. */
  atlas: {
    id?: string;
    type?: string;
    visibility?: EntityVisibility;
    publish?: boolean;
    summary?: string;
    aliases?: string[];
    images?: string[];
    tags?: string[];
    profile?: import("@/atlas/profiles/profileTypes").EntityProfile;
    relationships?: import("@/atlas/profiles/profileTypes").EntityRelationship[];
  };
}
