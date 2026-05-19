import type { InsertResult } from "./textareaInsert";

export type AutocompleteContext =
  | { type: "entity"; query: string; triggerStart: number }
  | { type: "image"; query: string; triggerStart: number };

export interface EntitySuggestion {
  id: string;
  title: string;
  type: string;
}

const DEFAULT_LIMIT = 8;

// Matches ![[query at end of string (image trigger)
// Character class [^[\]\n]: `[` needs no escape inside [], only `]` does
const IMAGE_TRIGGER = /!\[\[([^[\]\n]*)$/;
// Matches [[query at end of string, NOT preceded by ! (entity trigger)
const ENTITY_TRIGGER = /(?<!!)\[\[([^[\]\n]*)$/;

/**
 * Returns the active autocomplete context at `selStart`, or null if the
 * cursor is not inside an open `![[` or `[[` trigger.
 */
export function getAutocompleteContext(value: string, selStart: number): AutocompleteContext | null {
  const before = value.slice(0, selStart);

  // Check image trigger (![[) first — it contains [[ as a substring
  const imageMatch = IMAGE_TRIGGER.exec(before);
  if (imageMatch) {
    return {
      type: "image",
      query: imageMatch[1],
      triggerStart: selStart - imageMatch[0].length,
    };
  }

  // Check entity trigger ([[) that is NOT preceded by !
  const entityMatch = ENTITY_TRIGGER.exec(before);
  if (entityMatch) {
    return {
      type: "entity",
      query: entityMatch[1],
      triggerStart: selStart - entityMatch[0].length,
    };
  }

  return null;
}

/**
 * Filters entities by query matching id, title, or aliases (case-insensitive
 * substring). Empty query returns the first `limit` entities sorted by title.
 */
export function filterEntities(
  entities: Array<{ id: string; title: string; type: string; aliases: string[] }>,
  query: string,
  limit = DEFAULT_LIMIT,
): EntitySuggestion[] {
  const q = query.toLowerCase().trim();
  if (!q) {
    return [...entities]
      .sort((a, b) => a.title.localeCompare(b.title))
      .slice(0, limit)
      .map(({ id, title, type }) => ({ id, title, type }));
  }
  return entities
    .filter(
      (e) =>
        e.id.toLowerCase().includes(q) ||
        e.title.toLowerCase().includes(q) ||
        e.aliases.some((a) => a.toLowerCase().includes(q)),
    )
    .slice(0, limit)
    .map(({ id, title, type }) => ({ id, title, type }));
}

/**
 * Filters image filenames by query (case-insensitive substring).
 * Empty query returns the first `limit` images.
 */
export function filterImages(images: string[], query: string, limit = DEFAULT_LIMIT): string[] {
  const q = query.toLowerCase().trim();
  if (!q) return images.slice(0, limit);
  return images.filter((img) => img.toLowerCase().includes(q)).slice(0, limit);
}

/**
 * Replaces the open trigger+query in `value` with the completed wikilink
 * (`[[id]]` or `![[filename]]`) and places the cursor immediately after `]]`.
 */
export function applyCompletion(
  value: string,
  ctx: AutocompleteContext,
  selStart: number,
  label: string,
): InsertResult {
  const completion = ctx.type === "image" ? `![[${label}]]` : `[[${label}]]`;
  const newValue = value.slice(0, ctx.triggerStart) + completion + value.slice(selStart);
  const newCursor = ctx.triggerStart + completion.length;
  return { value: newValue, selStart: newCursor, selEnd: newCursor };
}
