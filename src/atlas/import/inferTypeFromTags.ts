const TAG_TYPE_MAP: Record<string, string> = {
  npc: "npc", character: "npc", person: "npc",
  faction: "faction", guild: "faction", organization: "faction", organisation: "faction",
  item: "item", artifact: "item", weapon: "item", armor: "item", armour: "item",
  event: "event",
  settlement: "settlement", city: "city", town: "town", village: "village",
  capital: "capital", port: "port", region: "region", ruin: "ruin",
  dungeon: "dungeon", cave: "cave", temple: "temple", shop: "shop",
  hazard: "hazard", landmark: "location", location: "location",
  lore: "lore",
};

export function inferTypeFromTags(tags: unknown): string | null {
  if (!Array.isArray(tags)) return null;
  for (const t of tags) {
    if (typeof t !== "string") continue;
    const hit = TAG_TYPE_MAP[t.trim().toLowerCase()];
    if (hit) return hit;
  }
  return null;
}
