// src/atlas/content/entityCategory.ts
export type CategoryId =
  | "characters" | "locations" | "factions" | "events" | "items" | "lore";

export interface CategoryMeta {
  id: CategoryId;
  /** Plural nav label. */ label: string;
  /** Singular, used in "＋ New {singular}". */ singular: string;
  /** Default content sub-folder a new entity of this category is written into. */
  folder: string;
}

export const CATEGORIES: CategoryMeta[] = [
  { id: "characters", label: "Characters", singular: "Character", folder: "npcs" },
  { id: "locations",  label: "Locations",  singular: "Location",  folder: "settlements" },
  { id: "factions",   label: "Factions",   singular: "Faction",   folder: "factions" },
  { id: "events",     label: "Events",     singular: "Event",     folder: "events" },
  { id: "items",      label: "Items",      singular: "Item",      folder: "items" },
  { id: "lore",       label: "Lore",       singular: "Lore entry", folder: "lore" },
];

const TYPE_TO_CATEGORY: Record<string, CategoryId> = {
  npc: "characters", character: "characters", person: "characters",
  settlement: "locations", capital: "locations", city: "locations",
  town: "locations", village: "locations", port: "locations",
  region: "locations", ruin: "locations", dungeon: "locations",
  cave: "locations", temple: "locations", divine_site: "locations",
  shop: "locations", black_market: "locations", hazard: "locations",
  wilderness_landmark: "locations", mystery: "locations",
  resonance_site: "locations", player_base: "locations",
  faction: "factions",
  event: "events",
  item: "items",
};

/** Total: any unknown/empty/undefined type resolves to "lore". */
export function categoryForType(type: string | undefined | null): CategoryId {
  const t = (type ?? "").trim().toLowerCase();
  return TYPE_TO_CATEGORY[t] ?? "lore";
}
