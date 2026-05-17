import type { Entity } from "@/atlas/content/schema";
import type { ViewMode } from "@/atlas/view/ViewModeProvider";

const PLAYER_VISIBLE = new Set(["player", "rumor"]);

export function filterEntitiesForLens(entities: Entity[], mode: ViewMode): Entity[] {
  if (mode === "dm") return entities;
  return entities.filter((e) => PLAYER_VISIBLE.has(e.visibility));
}
