/**
 * Loads optional content/<world>/_atlas/world.yaml and merges into the project.
 * Supports: maps (with layers, scale, grid), regions, fog, routes.
 * Route waypoints may be `[x, y]` or `{ entityId: "..." }` or `"entity-id"`.
 * Entity-id resolution happens in build-atlas.ts (needs placement data).
 */
import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import type {
  EntityVisibility,
  FogOverlay,
  GridOverlay,
  MapDocument,
  MapLayer,
  MapScale,
  Point,
  Region,
  Route,
  RouteMode,
  WorldCalendar,
} from "../../src/atlas/content/schema";

const VALID_VIS: EntityVisibility[] = ["player", "dm", "hidden", "rumor"];
const VALID_MODES: RouteMode[] = ["foot", "horse", "ship", "cart", "fly", "custom"];

export type WaypointSpec = Point | { entityId: string };

export interface RawRoute extends Omit<Route, "waypoints" | "resolvedPoints"> {
  waypoints: WaypointSpec[];
}

interface WorldYaml {
  maps?: Array<Partial<MapDocument> & {
    layers?: Array<Partial<MapLayer> & { src: string; id: string }>;
    scale?: MapScale;
    grid?: GridOverlay;
  }>;
  regions?: Array<Partial<Region> & { id: string; mapId: string; name: string; points: Point[] }>;
  fog?: Array<Partial<FogOverlay> & { mapId: string; reveals?: Point[][]; enabled?: boolean }>;
  routes?: Array<{
    id: string;
    mapId: string;
    name: string;
    mode?: string;
    speed?: number;
    color?: string;
    weight?: number;
    dashed?: boolean;
    visibility?: string;
    waypoints: Array<Point | { entityId: string } | string>;
  }>;
  calendar?: {
    name?: string;
    epochName?: string;
    daysPerWeek?: number;
    months?: Array<{ name: string; days: number }>;
  };
}

export interface WorldConfig {
  maps: MapDocument[];
  regions: Region[];
  fogs: FogOverlay[];
  routes: RawRoute[];
  calendar?: WorldCalendar;
  warnings: string[];
}

export function loadWorldConfig(contentRoot: string, worldId: string): WorldConfig | null {
  const file = path.join(contentRoot, worldId, "_atlas", "world.yaml");
  if (!fs.existsSync(file)) return null;
  const raw = fs.readFileSync(file, "utf8");
  const data = (yaml.load(raw) ?? {}) as WorldYaml;
  const warnings: string[] = [];

  const maps: MapDocument[] = (data.maps ?? []).map((m, i) => {
    const id = m.id ?? `${worldId}-map-${i}`;
    const scale = sanitizeScale(m.scale, warnings, `map "${id}"`);
    const grid = sanitizeGrid(m.grid, warnings, `map "${id}"`);
    return {
      id,
      worldId,
      name: m.name ?? id,
      width: m.width ?? 200000,
      height: m.height ?? 100000,
      oceanColor: m.oceanColor ?? "#18313f",
      wrapX: m.wrapX ?? false,
      scale,
      grid,
      layers: (m.layers ?? []).map((l, li) => ({
        id: l.id ?? `${id}-layer-${li}`,
        src: l.src,
        x: l.x ?? 0,
        y: l.y ?? 0,
        width: l.width ?? m.width ?? 200000,
        height: l.height ?? m.height ?? 100000,
        opacity: l.opacity ?? 1,
        zIndex: l.zIndex ?? li + 1,
        rotation: l.rotation,
        tileSrc: l.tileSrc,
      })),
    };
  });

  const regions: Region[] = (data.regions ?? []).map((r) => {
    const visibility = normalizeVis(r.visibility, warnings, `region "${r.id}"`);
    if (!Array.isArray(r.points) || r.points.length < 3) {
      warnings.push(`region "${r.id}" has fewer than 3 points — skipping`);
    }
    return {
      id: r.id,
      mapId: r.mapId,
      name: r.name,
      entityId: r.entityId,
      color: r.color,
      fillOpacity: r.fillOpacity ?? 0.18,
      strokeOpacity: r.strokeOpacity ?? 0.85,
      points: (r.points ?? []) as Point[],
      visibility,
    };
  }).filter((r) => r.points.length >= 3);

  const fogs: FogOverlay[] = (data.fog ?? []).map((f) => ({
    mapId: f.mapId,
    enabled: f.enabled !== false,
    color: f.color ?? "rgba(8, 12, 20, 0.55)",
    reveals: (f.reveals ?? []) as Point[][],
  }));

  const routes: RawRoute[] = (data.routes ?? []).map((r) => {
    const visibility = normalizeVis(r.visibility, warnings, `route "${r.id}"`);
    let mode: RouteMode | undefined;
    if (r.mode) {
      if (VALID_MODES.includes(r.mode as RouteMode)) mode = r.mode as RouteMode;
      else warnings.push(`route "${r.id}": invalid mode "${r.mode}", ignoring`);
    }
    const waypoints: WaypointSpec[] = (r.waypoints ?? []).map((w) => {
      if (typeof w === "string") return { entityId: w };
      if (Array.isArray(w) && w.length === 2 && typeof w[0] === "number" && typeof w[1] === "number") return [w[0], w[1]] as Point;
      if (typeof w === "object" && w !== null && typeof (w as { entityId?: string }).entityId === "string") return { entityId: (w as { entityId: string }).entityId };
      warnings.push(`route "${r.id}": skipped invalid waypoint ${JSON.stringify(w)}`);
      return null as unknown as WaypointSpec;
    }).filter(Boolean) as WaypointSpec[];

    return {
      id: r.id,
      mapId: r.mapId,
      name: r.name,
      mode,
      speed: typeof r.speed === "number" ? r.speed : undefined,
      color: r.color,
      weight: r.weight,
      dashed: r.dashed,
      visibility,
      waypoints,
    };
  });

  return { maps, regions, fogs, routes, warnings };
}

function sanitizeScale(s: MapScale | undefined, warnings: string[], where: string): MapScale | undefined {
  if (!s) return undefined;
  if (typeof s.unitsPerPixel !== "number" || s.unitsPerPixel <= 0) {
    warnings.push(`${where}: scale.unitsPerPixel must be a positive number`);
    return undefined;
  }
  return { unitsPerPixel: s.unitsPerPixel, unitLabel: s.unitLabel || "units" };
}

function sanitizeGrid(g: GridOverlay | undefined, warnings: string[], where: string): GridOverlay | undefined {
  if (!g) return undefined;
  if (g.kind !== "square" && g.kind !== "hex") {
    warnings.push(`${where}: grid.kind must be "square" or "hex"`);
    return undefined;
  }
  if (typeof g.size !== "number" || g.size <= 0) {
    warnings.push(`${where}: grid.size must be a positive number`);
    return undefined;
  }
  return { kind: g.kind, size: g.size, color: g.color, enabled: g.enabled !== false };
}

function normalizeVis(v: unknown, warnings: string[], where: string): EntityVisibility {
  if (typeof v === "string" && VALID_VIS.includes(v as EntityVisibility)) return v as EntityVisibility;
  if (v !== undefined) warnings.push(`${where}: invalid visibility "${v}", defaulting to "player"`);
  return "player";
}
