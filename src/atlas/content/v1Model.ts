/**
 * The one v1 adapter (ADR-0003, R-12): presents a v1 world (today's single
 * `world.yaml`) as the in-memory atlas model, so the build, the old Publish
 * Check and the resolver read v1 and v2 the same way. This is the only place
 * the v1 rules below are written; `v1Model.test.ts` pins each.
 *
 * v1 rules:
 *   - one world: the input's world id; its name is `world.yaml`'s `name:`,
 *     else the id title-cased ("astrath-deeprealm" -> "Astrath Deeprealm");
 *   - one campaign, `main` ("Main"), with `notes: vault` (the frontmatter
 *     value decides, as today); the world has no `notes:` entries;
 *   - every map is top-level, with visibility `player` (v1 maps have no
 *     visibility and always ship) and the viewer's zoom range (-6 to 4);
 *   - each map is `open` in `main`, or `fogged` with its v1 fog's reveals,
 *     conceals and feather when that fog is enabled; a disabled fog is `open`;
 *   - no maps at all: the build's fallback overview map (`<world>-overview`);
 *   - regions, routes, sound areas and pins move under their map; one whose
 *     map doesn't exist is dropped with a warning (it never shipped); a pin
 *     with no map goes on the first map, as in the v1 build;
 *   - a region or sound-only area with fewer than 3 points, or a sound area
 *     with no id or bed, is dropped with a warning (v1 never drew them);
 *   - per-map `water` becomes the world's `water`; maps that disagree (one
 *     with a block and one without counts) are refused, naming both;
 *   - `soundscape.areas` move to the map's `sound:`; `enabled` and
 *     `masterGain` stay under `soundscape`;
 *   - visibility values are kept as written; a missing one stays missing
 *     (the resolver reads it as `dm`); an unknown string is kept with a
 *     warning naming the item; a value that isn't a string loads as `dm`.
 *   - v1 fog `color` is dropped: v2 has no fog colour (it is DM-only drawing).
 *
 * Pure: no file IO. The input is a minimal v1 shape (`V1WorldInput`) that
 * `scripts/atlas/loadAtlasModel.ts` maps `loadWorldConfig`'s result into, and
 * that `validateProject` can map an `AtlasProject` into.
 */
import type {
  AssetCredit,
  CreditsConfig,
  FogOverlay,
  ImportFolderConfig,
  MapDocument,
  Point,
  Region,
  Route,
  WaterConfig,
  WorldCalendar,
} from "./schema";
import type {
  CampaignFileV2,
  CampaignMapV2,
  LayerV2,
  PinV2,
  RegionV2,
  RouteV2,
  SoundAreaV2,
  SoundscapeSettingsV2,
  VisibilityValue,
  ZoomRangeV2,
} from "./schemaV2";
import type { AtlasModel, LoadedAtlasModel, MapModel, WorldModel } from "./atlasModel";
import { isValidVisibility } from "./visibility";

/** A v1 map without its attached items (they come in their own lists, as in `world.yaml`). */
export type V1Map = Omit<MapDocument, "regions" | "routes" | "fog">;
export type V1Route = Omit<Route, "resolvedPoints">;

/** A note's placement on a map (frontmatter `atlas.placements`). No `mapId`: the first map. */
export interface V1Pin {
  note: string;
  mapId?: string;
  x: number;
  y: number;
  visibility?: string;
}

/** The minimal v1 world the adapter reads. */
export interface V1WorldInput {
  worldId: string;
  /** `world.yaml`'s top-level `name:`. */
  name?: string;
  /** Empty when the world has no `world.yaml`: the fallback map is used. */
  maps: V1Map[];
  regions?: Region[];
  routes?: V1Route[];
  fogs?: FogOverlay[];
  pins?: V1Pin[];
  calendar?: WorldCalendar;
  importConfig?: ImportFolderConfig;
  credits?: CreditsConfig;
  assetCredits?: Record<string, AssetCredit>;
}

export const V1_CAMPAIGN_ID = "main";
export const V1_CAMPAIGN_NAME = "Main";
/** v1 maps always ship: they have no visibility of their own. */
export const V1_MAP_VISIBILITY = "player";
/** The zoom range the viewer gives every v1 map (`AtlasViewer.tsx` `minZoom`/`maxZoom`). */
export const V1_ZOOM: Readonly<ZoomRangeV2> = { min: -6, max: 4 };

/** Refused v1 input (two maps with different water, duplicate map ids). */
export class V1ModelError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "V1ModelError";
  }
}

/** The v1 world name when `world.yaml` has no `name:`: the id, title-cased. */
export function v1WorldName(worldId: string): string {
  return worldId
    .split(/[-_\s]+/)
    .filter((w) => w.length > 0)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
}

/** The build's fallback when a world has no `world.yaml` (`build-atlas.ts`, `fallbackMapId`). */
export function v1FallbackMap(worldId: string): V1Map {
  return {
    id: `${worldId}-overview`,
    worldId,
    name: "Overview",
    width: 200000,
    height: 100000,
    layers: [],
    oceanColor: "#18313f",
    wrapX: true,
  };
}

function compact<T extends object>(o: T): T {
  for (const k of Object.keys(o) as (keyof T)[]) if (o[k] === undefined) delete o[k];
  return o;
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isPoint(v: unknown): v is Point {
  return (
    Array.isArray(v) &&
    v.length === 2 &&
    v.every((n) => typeof n === "number" && Number.isFinite(n))
  );
}

/** A JSON form with sorted keys, so two water blocks compare by content. */
function stableJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stableJson).join(",")}]`;
  if (isObj(v)) {
    const keys = Object.keys(v)
      .filter((k) => v[k] !== undefined)
      .sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stableJson(v[k])}`).join(",")}}`;
  }
  return JSON.stringify(v) ?? "undefined";
}

/**
 * A visibility kept as written. Missing stays missing (the resolver's `dm`);
 * an unknown string is kept with a warning; anything else loads as `dm`.
 */
function keepVisibility(v: unknown, where: string, warnings: string[]): VisibilityValue | undefined {
  if (v === undefined) return undefined;
  if (typeof v === "string") {
    if (!isValidVisibility(v)) {
      warnings.push(`${where}: invalid visibility "${v}" — it resolves to "dm"`);
    }
    return v;
  }
  warnings.push(`${where}: visibility ${JSON.stringify(v)} is not a string — loading as "dm"`);
  return "dm";
}

function liftWater(maps: V1Map[]): WaterConfig | undefined {
  const first = maps[0];
  for (const m of maps.slice(1)) {
    if (stableJson(m.water) !== stableJson(first.water)) {
      throw new V1ModelError(
        `maps "${first.id}" and "${m.id}" have different water settings; v2 has one world-level ` +
          `water block, so give every map the same water (or none) first`,
      );
    }
  }
  return first?.water;
}

function toLayer(l: V1Map["layers"][number]): LayerV2 {
  return compact<LayerV2>({
    id: l.id,
    src: l.src,
    x: l.x,
    y: l.y,
    width: l.width,
    height: l.height,
    opacity: l.opacity,
    zIndex: l.zIndex,
    rotation: l.rotation,
    tileSrc: l.tileSrc,
  });
}

function toSoundArea(a: unknown, mapId: string, i: number, warnings: string[]): SoundAreaV2 | null {
  const where = `map "${mapId}" sound area ${isObj(a) && typeof a.id === "string" ? `"${a.id}"` : `#${i}`}`;
  if (!isObj(a) || typeof a.id !== "string" || a.id.trim() === "") {
    warnings.push(`${where}: no id — skipped`);
    return null;
  }
  const bed = a.bed;
  // A blank src plays nothing and the build drops it, so it gets no verdict.
  if (!isObj(bed) || typeof bed.src !== "string" || bed.src.trim() === "") {
    warnings.push(`${where}: no bed with a src — skipped`);
    return null;
  }
  const rideOn = typeof a.regionId === "string" && a.regionId.trim() !== "";
  let points: Point[] | undefined;
  if (Array.isArray(a.points)) {
    if (a.points.every(isPoint)) points = a.points.map(([x, y]) => [x, y] as Point);
  }
  if (!rideOn && (!points || points.length < 3)) {
    warnings.push(`${where}: sound-only area needs at least 3 valid points — skipped`);
    return null;
  }
  return compact<SoundAreaV2>({
    id: a.id,
    regionId: rideOn ? (a.regionId as string) : undefined,
    points,
    visibility: keepVisibility(a.visibility, where, warnings),
    name: typeof a.name === "string" ? a.name : undefined,
    bed: compact({
      src: bed.src,
      srcFallback: typeof bed.srcFallback === "string" ? bed.srcFallback : undefined,
      gain: typeof bed.gain === "number" ? bed.gain : undefined,
    }),
  });
}

function toRegion(r: Region, warnings: string[]): RegionV2 | null {
  const where = `region "${r.id}"`;
  if (!Array.isArray(r.points) || r.points.length < 3 || !r.points.every(isPoint)) {
    warnings.push(`${where} needs at least 3 valid points — skipped`);
    return null;
  }
  return compact<RegionV2>({
    id: r.id,
    name: r.name,
    entityId: r.entityId,
    color: r.color,
    fillOpacity: r.fillOpacity,
    strokeOpacity: r.strokeOpacity,
    points: r.points,
    visibility: keepVisibility(r.visibility, where, warnings),
  });
}

function toRoute(r: V1Route, warnings: string[]): RouteV2 {
  return compact<RouteV2>({
    id: r.id,
    name: r.name,
    mode: r.mode,
    speed: r.speed,
    color: r.color,
    weight: r.weight,
    dashed: r.dashed,
    waypoints: r.waypoints,
    description: r.description,
    visibility: keepVisibility(r.visibility, `route "${r.id}"`, warnings),
  });
}

/** Group items by map id; an item on a map that doesn't exist is dropped with a warning. */
function byMap<T>(
  items: T[],
  mapIdOf: (t: T) => string | undefined,
  mapIds: ReadonlySet<string>,
  label: (t: T) => string,
  warnings: string[],
): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const t of items) {
    const mapId = mapIdOf(t);
    if (mapId === undefined || !mapIds.has(mapId)) {
      warnings.push(`${label(t)} is on unknown map "${String(mapId)}" — skipped`);
      continue;
    }
    const list = out.get(mapId) ?? [];
    list.push(t);
    out.set(mapId, list);
  }
  return out;
}

/**
 * No fog: open. A fog is on unless it says `enabled: false` (fail closed, as
 * `loadWorldConfig` reads a missing `enabled`).
 */
function campaignMapState(fog: FogOverlay | undefined): CampaignMapV2 {
  if (!fog || fog.enabled === false) return { state: "open" };
  return compact<CampaignMapV2>({
    state: "fogged",
    reveals: fog.reveals ?? [],
    conceals: fog.conceals,
    featherPx: fog.featherPx,
  });
}

/** Present a v1 world as the atlas model: one world, one campaign `main`. */
export function v1Model(input: V1WorldInput): LoadedAtlasModel {
  const warnings: string[] = [];
  const { worldId } = input;
  const v1Maps = input.maps.length > 0 ? input.maps : [v1FallbackMap(worldId)];

  const mapIds = new Set<string>();
  for (const m of v1Maps) {
    if (mapIds.has(m.id)) throw new V1ModelError(`two maps share the id "${m.id}"`);
    mapIds.add(m.id);
  }
  const water = liftWater(v1Maps);

  const regions = byMap(input.regions ?? [], (r) => r.mapId, mapIds, (r) => `region "${r.id}"`, warnings);
  const routes = byMap(input.routes ?? [], (r) => r.mapId, mapIds, (r) => `route "${r.id}"`, warnings);
  const pins = byMap(
    input.pins ?? [],
    (p) => p.mapId ?? v1Maps[0].id,
    mapIds,
    (p) => `pin of note "${p.note}"`,
    warnings,
  );
  const fogs = new Map<string, FogOverlay>();
  for (const f of input.fogs ?? []) {
    if (!mapIds.has(f.mapId)) {
      warnings.push(`fog is on unknown map "${f.mapId}" — skipped`);
      continue;
    }
    if (fogs.has(f.mapId)) {
      warnings.push(`fog defined twice for map "${f.mapId}" — keeping the first`);
      continue;
    }
    fogs.set(f.mapId, f);
  }

  const campaignMaps = Object.create(null) as Record<string, CampaignMapV2>;
  const maps: MapModel[] = v1Maps.map((m) => {
    campaignMaps[m.id] = campaignMapState(fogs.get(m.id));
    const sc = m.soundscape;
    const areas = Array.isArray(sc?.areas) ? sc.areas : [];
    const sound = areas
      .map((a, i) => toSoundArea(a, m.id, i, warnings))
      .filter((a): a is SoundAreaV2 => a !== null);
    const mapRegions = (regions.get(m.id) ?? [])
      .map((r) => toRegion(r, warnings))
      .filter((r): r is RegionV2 => r !== null);
    const mapRoutes = (routes.get(m.id) ?? []).map((r) => toRoute(r, warnings));
    const mapPins = (pins.get(m.id) ?? []).map((p) =>
      compact<PinV2>({
        note: p.note,
        x: p.x,
        y: p.y,
        visibility: keepVisibility(p.visibility, `pin of note "${p.note}"`, warnings),
      }),
    );
    return compact<MapModel>({
      id: m.id,
      name: m.name,
      width: m.width,
      height: m.height,
      visibility: V1_MAP_VISIBILITY,
      layers: (m.layers ?? []).map(toLayer),
      scale: m.scale,
      zoom: { ...V1_ZOOM },
      grid: m.grid,
      oceanColor: m.oceanColor,
      wrapX: m.wrapX,
      soundscape: sc
        ? compact<SoundscapeSettingsV2>({ enabled: sc.enabled, masterGain: sc.masterGain })
        : undefined,
      regions: mapRegions.length > 0 ? mapRegions : undefined,
      routes: mapRoutes.length > 0 ? mapRoutes : undefined,
      pins: mapPins.length > 0 ? mapPins : undefined,
      sound: sound.length > 0 ? sound : undefined,
    });
  });

  const world = compact<WorldModel>({
    world: { id: worldId, name: input.name ?? v1WorldName(worldId) },
    calendar: input.calendar,
    credits: input.credits,
    assetCredits: input.assetCredits,
    import: input.importConfig,
    water,
    maps,
  });
  const campaign: CampaignFileV2 = {
    id: V1_CAMPAIGN_ID,
    name: V1_CAMPAIGN_NAME,
    maps: campaignMaps,
    notes: "vault",
  };
  const model: AtlasModel = {
    schemaVersion: 1,
    ocean: null,
    onOcean: [],
    worlds: [world],
    campaigns: [campaign],
  };
  return { model, warnings };
}
