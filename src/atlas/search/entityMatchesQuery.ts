import type { Entity } from "@/atlas/content/schema";

/**
 * Returns true if the entity matches the query string across all text fields:
 * title, aliases, summary, and tags (case-insensitive substring match).
 * An empty query always matches.
 */
export function entityMatchesQuery(entity: Entity, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  if (entity.title.toLowerCase().includes(q)) return true;
  if (entity.aliases.some((a) => a.toLowerCase().includes(q))) return true;
  if ((entity.summary ?? "").toLowerCase().includes(q)) return true;
  if (entity.tags.some((t) => t.toLowerCase().includes(q))) return true;
  return false;
}
