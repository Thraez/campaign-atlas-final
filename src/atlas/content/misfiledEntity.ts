// src/atlas/content/misfiledEntity.ts
/**
 * Detect entities that landed in the wrong category on the way in.
 *
 * An Obsidian note imported without an `atlas.type` gets no explicit type, so
 * `categoryForType` drops it into "lore" — the catch-all. That is the right
 * default, but it means a vault full of `#npc`-tagged notes reports the
 * Characters section as empty while the people sit under Lore, and players see
 * no type on them at all (`playerTypeLabel("note")` is deliberately blank).
 *
 * The DM already told us the answer: they tagged the note. So rather than
 * invent a second vocabulary of hints, we reuse the type table itself — a tag
 * that names a known entity type IS the suggestion. `#npc` on a typeless note
 * means "this is an npc", which files under Characters.
 *
 * This module only ever *suggests*. Re-filing rewrites the DM's canon, so it
 * stays behind an explicit click.
 */
import type { Entity } from "./schema";
import { categoryForType, isKnownEntityType, type CategoryId } from "./entityCategory";

export interface MisfiledEntity {
  entity: Entity;
  /** Category the tags point at. */
  category: CategoryId;
  /** Canonical `atlas.type` to write when the DM accepts — the matched tag. */
  suggestedType: string;
}

/**
 * Returns the re-filing suggestion for one entity, or null when there is
 * nothing to suggest. Null covers the common cases: the type is already
 * explicit, or no tag names a type.
 */
export function suggestFiling(entity: Entity): MisfiledEntity | null {
  // An explicit, known type is the DM's decision — never second-guess it.
  if (isKnownEntityType(entity.type)) return null;

  for (const raw of entity.tags ?? []) {
    const tag = raw.trim().toLowerCase();
    if (!isKnownEntityType(tag)) continue;
    const category = categoryForType(tag);
    // A tag that resolves back to where the entity already sits tells us
    // nothing — e.g. a `#lore` tag on a typeless note.
    if (category === categoryForType(entity.type)) continue;
    return { entity, category, suggestedType: tag };
  }
  return null;
}

/** Every suggestion across a set of entities, in input order. */
export function findMisfiled(entities: readonly Entity[]): MisfiledEntity[] {
  return entities.map(suggestFiling).filter((s): s is MisfiledEntity => s !== null);
}

/** Suggestions whose tags point at one specific category. */
export function misfiledForCategory(
  entities: readonly Entity[],
  category: CategoryId,
): MisfiledEntity[] {
  return findMisfiled(entities).filter((m) => m.category === category);
}
