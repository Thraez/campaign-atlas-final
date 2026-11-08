import type { Entity } from "@/atlas/content/schema";

import { isPlayerVisible, isValidVisibility, worldItemVisibility } from "./visibility";

// Entity visibilities arrive as plain strings.
const ships = (v: string) => isValidVisibility(v) && isPlayerVisible(v);
// Region and route visibilities come from world.yaml: missing or invalid is dm.
const worldItemShips = (v: unknown) => isPlayerVisible(worldItemVisibility(v));

interface Placementish { entityId: string; x: number; y: number; mapId?: string; }
interface Visible { visibility?: string; id?: string; }
interface Routeish extends Visible { resolvedPoints?: [number, number][]; }
interface Regionish extends Visible { points?: [number, number][]; }

export interface MapProjectionInput<P extends Placementish, R extends Regionish, T extends Routeish> {
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
  P extends Placementish, R extends Regionish, T extends Routeish,
>(input: MapProjectionInput<P, R, T>): MapProjectionResult<P, R, T> {
  const foggedEntityIds: string[] = [];
  const placements = input.placements.filter((p) => {
    const e = input.entitiesById.get(p.entityId);
    if (!e || !ships(e.visibility)) return false;
    if (input.isFogged(p.x, p.y)) { foggedEntityIds.push(p.entityId); return false; }
    return true;
  });
  const regions = input.regions.filter((r) => {
    if (!worldItemShips(r.visibility)) return false;
    if (r.points?.some(([x, y]) => input.isFogged(x, y))) return false;
    return true;
  });
  const routes = input.routes.filter((t) => {
    if (!worldItemShips(t.visibility)) return false;
    if (t.resolvedPoints?.some(([x, y]) => input.isFogged(x, y))) return false;
    return true;
  });
  return { placements, regions, routes, foggedEntityIds };
}
