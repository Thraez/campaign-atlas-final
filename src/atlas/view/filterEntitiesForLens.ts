import type { Entity } from "@/atlas/content/schema";
import type { ViewMode } from "@/atlas/view/ViewModeProvider";

import { PLAYER_VISIBLE_VISIBILITY as PLAYER_VISIBLE } from "@/atlas/content/visibility";

export function filterEntitiesForLens(entities: Entity[], mode: ViewMode): Entity[] {
  if (mode === "dm") return entities;
  return entities.filter((e) => PLAYER_VISIBLE.has(e.visibility));
}
