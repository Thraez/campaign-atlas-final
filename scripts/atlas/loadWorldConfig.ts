/**
 * Loads optional content/<world>/_atlas/world.yaml and merges into the project.
 * Supports: maps (with layers, scale, grid), regions, fog, routes.
 * Route waypoints may be `[x, y]` or `{ entityId: "..." }` or `"entity-id"`.
 * Entity-id resolution happens in build-atlas.ts (needs placement data).
 */
import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import { resolveAndMigrate, SchemaVersionError } from "./schemaVersion";
import type {
  CreditsConfig,
  EntityVisibility,
  FogOverlay,
  GridOverlay,
  ImportFolderConfig,
  MapDocument,
  MapLayer,
  MapScale,
  Point,
  Region,
  Route,
  RouteMode,
  SoundscapeConfig,
  WaterConfig,
  WorldCalendar,
} from "../../src/atlas/content/schema";

/** Pure helper: coerce a raw `credits` block to a CreditsConfig, defaulting both flags to true. */
export function resolveCredits(raw: unknown): CreditsConfig {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return { badges: true, page: true };
  }
  const r = raw as Record<string, unknown>;
  return {
    badges: r.badges === false ? false : true,
    page: r.page === false ? false : true,
  };
}

const VALID_VIS: EntityVisibility[] = ["player", "dm", "hidden", "rumor"];
const VALID_MODES: RouteMode[] = ["foot", "horse", "ship", "cart", "fly", "custom"];

export type WaypointSpec = Point | { entityId: string };

export interface RawRoute extends Omit<Route, "waypoints" | "resolvedPoints"> {
  waypoints: WaypointSpec[];
}

interface WorldYaml {
  schemaVersion?: number;
  maps?: Array<Partial<MapDocument> & {
    layers?: Array<Partial<MapLayer> & { src: string; id: string }>;
    scale?: MapScale;
    grid?: GridOverlay;
    /** Editor-friendly nested geometry. mapId may be omitted (inferred from parent). */
    regions?: Array<Partial<Region> & { id: string; name: string; points: Point[]; mapId?: string }>;
    routes?: Array<{
      id: string;
      mapId?: string;
      name: string;
      mode?: string;
      speed?: number;
      color?: string;
      weight?: number;
      dashed?: boolean;
      visibility?: string;
      waypoints: Array<Point | { entityId: string } | string>;
    }>;
    fog?: Partial<FogOverlay> & { mapId?: string; reveals?: Point[][]; enabled?: boolean };
    soundscape?: SoundscapeConfig;
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
  import?: {
    folders?: Record<string, unknown>;
    defaultFolder?: unknown;
  };
  credits?: unknown;
}

export interface WorldConfig {
  maps: MapDocument[];
  regions: Region[];
  fogs: FogOverlay[];
  routes: RawRoute[];
  calendar?: WorldCalendar;
  schemaVersion: number;
  warnings: string[];
  importConfig: ImportFolderConfig; // always present — defaults applied here
  credits: CreditsConfig;           // always present — both default true
}

export class WorldConfigError extends Error {}

export function loadWorldConfig(contentRoot: string, worldId: string): WorldConfig | null {
  const file = path.join(contentRoot, worldId, "_atlas", "world.yaml");
  if (!fs.existsSync(file)) return null;
  const raw = fs.readFileSync(file, "utf8");
  const rel = path.relative(process.cwd(), file).replace(/\\/g, "/");

  // Hard-fail guard: the most common authoring mistake is pasting an exported
  // patch's full markdown (with ```yaml fences) into world.yaml instead of just
  // the YAML inside the fence. Catch it before yaml.load() throws something
  // cryptic.
  if (/^\s*```/m.test(raw)) {
    throw new WorldConfigError(
      `${rel}: contains markdown code fences (\`\`\`). world.yaml must be PURE YAML — paste only the YAML inside any patch fence, not the wrapper.`
    );
  }

  let data: WorldYaml;
  try {
    data = (yaml.load(raw) ?? {}) as WorldYaml;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new WorldConfigError(`${rel}: invalid YAML — ${msg}`);
  }

  if (data === null || typeof data !== "object" || Array.isArray(data)) {
    throw new WorldConfigError(`${rel}: top-level must be a YAML mapping (object).`);
  }

  const warnings: string[] = [];

  // Schema version gate. Run before any other shape checks so a clearly-
  // wrong version fails fast with an actionable message.
  let resolvedVersion: number;
  try {
    const resolved = resolveAndMigrate(data as Record<string, unknown>, rel, warnings);
    data = resolved.data as WorldYaml;
    resolvedVersion = resolved.version;
  } catch (e) {
    if (e instanceof SchemaVersionError) {
      throw new WorldConfigError(e.message);
    }
    throw e;
  }

  if (data.maps !== undefined && !Array.isArray(data.maps)) {
    throw new WorldConfigError(`${rel}: "maps" must be an array.`);
  }
  if (!data.maps || data.maps.length === 0) {
    throw new WorldConfigError(`${rel}: no maps defined. Add at least one entry under "maps:".`);
  }

  const maps: MapDocument[] = (data.maps ?? []).map((m, i) => {
    const id = m.id ?? `${worldId}-map-${i}`;
    const scale = sanitizeScale(m.scale, warnings, `map "${id}"`);
    const grid = sanitizeGrid(m.grid, warnings, `map "${id}"`);
    const water = sanitizeWater(m.water as WaterConfig | undefined, warnings, `map "${id}"`);
    return {
      id,
      worldId,
      name: m.name ?? id,
      width: m.width ?? 200000,
      height: m.height ?? 100000,
      oceanColor: m.oceanColor ?? "#18313f",
      ...(water !== undefined ? { water } : {}),
      ...(m.soundscape ? { soundscape: m.soundscape } : {}),
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

  // Collect regions from BOTH formats:
  //   • top-level `regions:` (legacy, canonical)
  //   • nested `maps[].regions:` (Creator Cockpit exports)
  // Nested entries inherit `mapId` from the parent map. If a nested entry
  // explicitly sets a different mapId, we warn (likely a paste mistake).
  type RawRegion = Partial<Region> & { id: string; name: string; points: Point[]; mapId?: string };
  const rawRegions: RawRegion[] = [];
  for (const r of (data.regions ?? [])) rawRegions.push(r as RawRegion);
  for (const m of (data.maps ?? [])) {
    const parentId = m.id ?? "";
    for (const r of (m.regions ?? [])) {
      if (r.mapId && parentId && r.mapId !== parentId) {
        warnings.push(`region "${r.id}" nested under map "${parentId}" but declares mapId "${r.mapId}" — using "${parentId}"`);
      }
      rawRegions.push({ ...r, mapId: parentId || r.mapId });
    }
  }
  const seenRegionIds = new Set<string>();
  const regions: Region[] = rawRegions.map((r) => {
    if (seenRegionIds.has(r.id)) {
      warnings.push(`duplicate region id "${r.id}" — keeping first definition`);
    }
    seenRegionIds.add(r.id);
    const visibility = normalizeVis(r.visibility, warnings, `region "${r.id}"`);
    if (!Array.isArray(r.points) || r.points.length < 3) {
      warnings.push(`region "${r.id}" has fewer than 3 points — skipping`);
    }
    return {
      id: r.id,
      mapId: r.mapId ?? "",
      name: r.name,
      entityId: r.entityId,
      color: r.color,
      fillOpacity: r.fillOpacity ?? 0.18,
      strokeOpacity: r.strokeOpacity ?? 0.85,
      points: (r.points ?? []) as Point[],
      visibility,
    };
  })
    // Drop duplicates (keep first) and invalid geometry.
    .filter((r, idx, arr) => arr.findIndex((x) => x.id === r.id) === idx)
    .filter((r) => r.points.length >= 3);

  // Fog: top-level array + nested per-map block. Warn on duplicate mapId.
  const rawFogs: Array<Partial<FogOverlay> & { mapId: string; reveals?: Point[][]; enabled?: boolean }> = [];
  for (const f of (data.fog ?? [])) rawFogs.push(f);
  for (const m of (data.maps ?? [])) {
    if (!m.fog) continue;
    const parentId = m.id ?? "";
    const f = m.fog;
    if (f.mapId && parentId && f.mapId !== parentId) {
      warnings.push(`fog nested under map "${parentId}" but declares mapId "${f.mapId}" — using "${parentId}"`);
    }
    rawFogs.push({ ...f, mapId: parentId || (f.mapId ?? "") });
  }
  const seenFogMaps = new Set<string>();
  const fogs: FogOverlay[] = rawFogs.flatMap((f) => {
    if (seenFogMaps.has(f.mapId)) {
      warnings.push(`fog defined twice for map "${f.mapId}" — keeping first definition`);
      return [];
    }
    seenFogMaps.add(f.mapId);
    return [{
      mapId: f.mapId,
      enabled: f.enabled !== false,
      color: f.color ?? "rgba(8, 12, 20, 0.55)",
      reveals: (f.reveals ?? []) as Point[][],
    }];
  });

  // Routes: top-level + nested under maps[].routes.
  type RawRouteSpec = {
    id: string; mapId?: string; name: string; mode?: string; speed?: number;
    color?: string; weight?: number; dashed?: boolean; visibility?: string;
    waypoints: Array<Point | { entityId: string } | string>;
  };
  const rawRoutes: RawRouteSpec[] = [];
  for (const r of (data.routes ?? [])) rawRoutes.push(r);
  for (const m of (data.maps ?? [])) {
    const parentId = m.id ?? "";
    for (const r of (m.routes ?? [])) {
      if (r.mapId && parentId && r.mapId !== parentId) {
        warnings.push(`route "${r.id}" nested under map "${parentId}" but declares mapId "${r.mapId}" — using "${parentId}"`);
      }
      rawRoutes.push({ ...r, mapId: parentId || r.mapId });
    }
  }
  const seenRouteIds = new Set<string>();
  const routes: RawRoute[] = rawRoutes.flatMap((r) => {
    if (seenRouteIds.has(r.id)) {
      warnings.push(`duplicate route id "${r.id}" — keeping first definition`);
      return [];
    }
    seenRouteIds.add(r.id);
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

    return [{
      id: r.id,
      mapId: r.mapId ?? "",
      name: r.name,
      mode,
      speed: typeof r.speed === "number" ? r.speed : undefined,
      color: r.color,
      weight: r.weight,
      dashed: r.dashed,
      visibility,
      waypoints,
    }];
  });

  let calendar: WorldCalendar | undefined;
  if (data.calendar) {
    const months = (data.calendar.months ?? []).filter(
      (m) => m && typeof m.name === "string" && typeof m.days === "number" && m.days > 0
    );
    if (months.length === 0) {
      warnings.push(`calendar: no valid months defined — calendar ignored`);
    } else {
      calendar = {
        name: data.calendar.name,
        epochName: data.calendar.epochName,
        daysPerWeek: typeof data.calendar.daysPerWeek === "number" ? data.calendar.daysPerWeek : undefined,
        months,
      };
    }
  }

  const importConfig = sanitizeImportConfig(data.import, warnings);
  const credits = resolveCredits(data.credits);

  return { maps, regions, fogs, routes, calendar, schemaVersion: resolvedVersion, warnings, importConfig, credits };
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

function sanitizeWater(w: WaterConfig | undefined, _warnings: string[], _where: string): WaterConfig | undefined {
  if (!w) return undefined;
  const out: WaterConfig = {};
  if (w.enabled === false) out.enabled = false;
  else if (w.enabled === true) out.enabled = true;
  if (typeof w.intensity === "number") out.intensity = Math.min(1, Math.max(0, w.intensity));
  if (typeof w.speed === "number") out.speed = Math.min(1, Math.max(0, w.speed));
  if (typeof w.crestColor === "string" && /^#[0-9a-fA-F]{6}$/.test(w.crestColor)) {
    out.crestColor = w.crestColor;
  }
  return out;
}

function normalizeVis(v: unknown, warnings: string[], where: string): EntityVisibility {
  if (typeof v === "string" && VALID_VIS.includes(v as EntityVisibility)) return v as EntityVisibility;
  if (v !== undefined) warnings.push(`${where}: invalid visibility "${v}", defaulting to "player"`);
  return "player";
}

const SAFE_SEGMENT = /^[A-Za-z0-9_\-. ]+$/;

function sanitizeImportConfig(
  raw: WorldYaml["import"],
  warnings: string[]
): ImportFolderConfig {
  const folders: Record<string, string> = {};
  for (const [type, val] of Object.entries(raw?.folders ?? {})) {
    if (typeof type !== "string" || type.length === 0) continue;
    const seg = typeof val === "string" ? val : null;
    if (
      seg !== null &&
      seg !== "." &&
      seg !== ".." &&
      seg !== "_atlas" &&
      SAFE_SEGMENT.test(seg)
    ) {
      folders[type] = seg;
    } else {
      warnings.push(
        `world.yaml import.folders["${type}"]: invalid folder "${String(val)}" — ignored`
      );
    }
  }
  const defRaw = raw?.defaultFolder;
  const defSeg =
    typeof defRaw === "string" &&
    defRaw !== "." &&
    defRaw !== ".." &&
    defRaw !== "_atlas" &&
    SAFE_SEGMENT.test(defRaw)
      ? defRaw
      : null;
  if (defRaw !== undefined && defSeg === null) {
    warnings.push(
      `world.yaml import.defaultFolder: invalid "${String(defRaw)}" — using "imports"`
    );
  }
  return { folders, defaultFolder: defSeg ?? "imports" };
}
