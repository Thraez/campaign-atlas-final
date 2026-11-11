/**
 * Build stage, assemble maps and items per world (R-13): every world of the
 * model as the build assembles it, before any campaign verdict is applied.
 *
 * - v1: the world file as `loadWorldConfig` read it (`BuildModel.v1Source`),
 *   because the model is lossy for v1 output (fog colour, per-map water,
 *   items the adapter skipped but the DM build lists, key order). Pins come
 *   from note frontmatter, as before. Deleted with v1 at retire.
 * - v2: the model's maps, each with its nested regions, routes, pins and
 *   sound, and the tree fields `parent`, `frame`, `enterZoom` (ADR-0003),
 *   plus each map's `zoom` range (R-32).
 *
 * Visibility of v2 items is read for the build's campaign
 * (`visibilityFor`), so a per-campaign mapping naming other campaigns never
 * reaches the output. A DM build keeps it as written.
 */
import path from "node:path";
import type { MapModel, WorldModel } from "../../../src/atlas/content/atlasModel";
import { visibilityFor } from "../../../src/atlas/content/resolveCampaign";
import type {
  AssetCredit,
  CreditsConfig,
  EntityVisibility,
  FogOverlay,
  ImportFolderConfig,
  MapDocument,
  MapLayer,
  Region,
  SoundArea,
  SoundscapeConfig,
  WorldCalendar,
} from "../../../src/atlas/content/schema";
import { v1FallbackMap } from "../../../src/atlas/content/v1Model";
import type { RawRoute } from "../loadWorldConfig";
import type { BuildModel } from "./loadBuildModel";

/** A v2 pin, on its map. v1 pins come from note frontmatter instead. */
export interface PinSource {
  note: string;
  mapId: string;
  x: number;
  y: number;
}

export interface WorldSource {
  id: string;
  name: string;
  /** Maps without regions, routes or fog (attached once verdicts are applied). */
  maps: MapDocument[];
  regions: Region[];
  fogs: FogOverlay[];
  routes: RawRoute[];
  /** v2 pins; `null` for v1, whose pins are note frontmatter. */
  pins: PinSource[] | null;
  /** The folder map layer and audio srcs resolve against (absolute). */
  assetDir: string;
  /** v1's map when a world has none (also the last-resort `defaultMapId`). */
  fallbackMapId: string;
  calendar?: WorldCalendar;
  credits: CreditsConfig;
  assetCredits?: Record<string, AssetCredit>;
  importConfig: ImportFolderConfig;
}

const DEFAULT_CREDITS: CreditsConfig = { badges: true, page: true };
const DEFAULT_IMPORT: ImportFolderConfig = { folders: {}, defaultFolder: "imports" };

function compact<T extends object>(o: T): T {
  for (const k of Object.keys(o) as (keyof T)[]) if (o[k] === undefined) delete o[k];
  return o;
}

/** Every world of the model, in model order. `campaign` is `null` in a DM build. */
export function worldSources(
  bm: BuildModel,
  contentDir: string,
  root: string,
  campaign: string | null,
): WorldSource[] {
  return bm.model.worlds.map((w) =>
    bm.model.schemaVersion === 1
      ? v1World(w, bm, root)
      : v2World(w, path.join(contentDir, w.world.id, "_atlas"), campaign),
  );
}

function worldFields(w: WorldModel) {
  return {
    id: w.world.id,
    name: w.world.name,
    calendar: w.calendar,
    credits: w.credits ?? DEFAULT_CREDITS,
    assetCredits: w.assetCredits,
    importConfig: w.import ?? DEFAULT_IMPORT,
  };
}

function v1World(w: WorldModel, bm: BuildModel, root: string): WorldSource {
  const src = bm.v1Source;
  const fallback = v1FallbackMap(w.world.id);
  return {
    ...worldFields(w),
    maps: src?.maps.length ? src.maps : [fallback],
    regions: src?.regions ?? [],
    fogs: src?.fogs ?? [],
    routes: src?.routes ?? [],
    pins: null,
    assetDir: path.join(root, "public"),
    fallbackMapId: fallback.id,
  };
}

function v2World(w: WorldModel, assetDir: string, campaign: string | null): WorldSource {
  const vis = (value: unknown): EntityVisibility =>
    campaign !== null
      ? visibilityFor(value, campaign)
      : value === undefined
        ? "dm"
        : (value as EntityVisibility);
  const maps: MapDocument[] = [];
  const regions: Region[] = [];
  const routes: RawRoute[] = [];
  const pins: PinSource[] = [];
  for (const m of w.maps) {
    maps.push(v2Map(m, w, vis));
    for (const r of m.regions ?? []) {
      regions.push(
        compact<Region>({
          id: r.id,
          mapId: m.id,
          name: r.name,
          entityId: r.entityId,
          color: r.color,
          fillOpacity: r.fillOpacity,
          strokeOpacity: r.strokeOpacity,
          points: r.points,
          visibility: vis(r.visibility),
        }),
      );
    }
    for (const r of m.routes ?? []) {
      routes.push(
        compact<RawRoute>({
          id: r.id,
          mapId: m.id,
          name: r.name,
          mode: r.mode,
          speed: r.speed,
          color: r.color,
          weight: r.weight,
          dashed: r.dashed,
          visibility: vis(r.visibility),
          waypoints: r.waypoints,
          description: r.description,
        }),
      );
    }
    for (const p of m.pins ?? []) pins.push({ note: p.note, mapId: m.id, x: p.x, y: p.y });
  }
  return {
    ...worldFields(w),
    maps,
    regions,
    fogs: [],
    routes,
    pins,
    assetDir,
    fallbackMapId: `${w.world.id}-overview`,
  };
}

function v2Map(m: MapModel, w: WorldModel, vis: (value: unknown) => EntityVisibility): MapDocument {
  const layers: MapLayer[] = m.layers.map((l, i) =>
    compact<MapLayer>({
      id: l.id,
      src: l.src,
      x: l.x,
      y: l.y,
      width: l.width,
      height: l.height,
      opacity: l.opacity ?? 1,
      zIndex: l.zIndex ?? i + 1,
      rotation: l.rotation,
      tileSrc: l.tileSrc,
    }),
  );
  const areas: SoundArea[] = (m.sound ?? []).map((a) =>
    compact<SoundArea>({
      id: a.id,
      regionId: a.regionId,
      points: a.points,
      // A ride-on area takes its region's visibility; only sound-only zones carry one.
      visibility: a.regionId === undefined ? vis(a.visibility) : undefined,
      name: a.name,
      bed: a.bed,
    }),
  );
  const soundscape: SoundscapeConfig | undefined =
    m.soundscape || areas.length > 0
      ? compact<SoundscapeConfig>({
          enabled: m.soundscape?.enabled,
          masterGain: m.soundscape?.masterGain,
          areas,
        })
      : undefined;
  return compact<MapDocument>({
    id: m.id,
    worldId: w.world.id,
    name: m.name,
    width: m.width,
    height: m.height,
    layers,
    scale: m.scale,
    grid: m.grid,
    oceanColor: m.oceanColor,
    water: w.water,
    soundscape,
    wrapX: m.wrapX,
    parent: m.parent,
    frame: m.frame ? { ...m.frame } : undefined,
    enterZoom: m.enterZoom,
    // R-32: the authored zoom range, for the viewer's zoom handoff. v2 only.
    zoom: { min: m.zoom.min, max: m.zoom.max },
  });
}
