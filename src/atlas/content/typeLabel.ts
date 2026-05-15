/**
 * Player-facing display label for an entity's `type`.
 *
 * `entity.type` doubles as a URL slug (e.g. /atlas/type/npc), a filter key,
 * and the pin-preset lookup. So we keep its raw value as-is — but at display
 * time, we translate jargon into something a player can read in-world.
 *
 * "NPC" is the canonical offender: it's TTRPG meta-language that breaks
 * immersion. "note" is a catch-all category that means nothing to a player.
 * Unknown types pass through with a leading capital so a DM adding their
 * own type (e.g. "monster", "deity") gets sensible output without us
 * maintaining a huge whitelist.
 *
 * Returns "" when the type should not be shown at all — callers must
 * suppress the surrounding element.
 */
const TYPE_LABELS: Record<string, string> = {
  npc: "Person",
  person: "Person",
  note: "",
};

export function playerTypeLabel(type: string | undefined): string {
  if (!type) return "";
  const lower = type.toLowerCase();
  if (lower in TYPE_LABELS) return TYPE_LABELS[lower];
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}
