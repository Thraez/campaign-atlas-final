import type { Entity } from "@/atlas/content/schema";

const PLAYER_VISIBLE = new Set(["player", "rumor"]);

interface Placementish { entityId: string; x: number; y: number; mapId?: string; }
interface Visible { visibility?: string; id?: string; }

export interface MapProjectionInput<P extends Placementish, R extends Visible, T extends Visible> {
  placements: P[];
  regions: R[];
  routes: T[];
  entitiesById: Map<string, Entity>;
  isFogged: (x: number, y: number) => boolean;
}

export interface MapProjectionResult<P, R, T> {
  placements: P[];
  regions: R[];
  routes: T[];
  foggedEntityIds: string[];
}

export function projectMapForPlayer<
  P extends Placementish, R extends Visible, T extends Visible,
>(input: MapProjectionInput<P, R, T>): MapProjectionResult<P, R, T> {
  const foggedEntityIds: string[] = [];
  const placements = input.placements.filter((p) => {
    const e = input.entitiesById.get(p.entityId);
    if (!e || !PLAYER_VISIBLE.has(e.visibility)) return false;
    if (input.isFogged(p.x, p.y)) { foggedEntityIds.push(p.entityId); return false; }
    return true;
  });
  const regions = input.regions.filter((r) => PLAYER_VISIBLE.has(r.visibility ?? "dm"));
  const routes = input.routes.filter((t) => PLAYER_VISIBLE.has(t.visibility ?? "dm"));
  return { placements, regions, routes, foggedEntityIds };
}
