/**
 * Schema v2 source files (ADR-0003, ADR-0004): the types and pure shape
 * validators for `_atlas/atlas.yaml` (the ocean), `<world>/_atlas/world.yaml`
 * (the map tree) and `_atlas/campaigns/<id>.yaml` (a campaign file).
 *
 * Each validator takes an already-parsed YAML value (no file IO) and returns
 * either the typed file or every structural error it found, each naming its
 * path (`maps[2].frame.width`). Structural means wrong types, missing ids,
 * missing required fields, a bad map `state` or a non-positive size.
 *
 * Visibility values are kept as written: an unknown string is not an error
 * here. The per-campaign resolver (R-11a) reads anything that isn't a valid
 * `EntityVisibility`, a missing value, or a campaign not named in a
 * per-campaign map, as `dm`. Only a value that isn't a string, or a
 * per-campaign entry that isn't a string, is rejected.
 *
 * Rules that span files (an unknown `parent`, cycles, duplicate map ids,
 * `onOcean` coverage, campaign keys that aren't listed campaigns, a v1/v2
 * mix) are the loader's (R-12), not this module's.
 *
 * Lives in `src/` so `scripts/` can import it, as `visibility.ts` does.
 */
import type {
  AssetCredit,
  CreditsConfig,
  EntityVisibility,
  ImportFolderConfig,
  MapScale,
  Point,
  RouteMode,
  SoundBed,
  WaterConfig,
  WorldCalendar,
} from "./schema";

export type CampaignId = string;
export type MapId = string;
export type NoteId = string;
export type WorldId = string;

/**
 * One visibility as written in a file. Usually an `EntityVisibility`, but kept
 * verbatim, so it may be any string; the resolver reads an unknown one as `dm`.
 */
export type WrittenVisibility = EntityVisibility | (string & {});

/**
 * A visibility value on a map, item or note entry: one value for every
 * campaign, or a map of campaign id to value (`{ main: player, sandbox: rumor }`).
 */
export type VisibilityValue = WrittenVisibility | Record<CampaignId, WrittenVisibility>;

// ---------------------------------------------------------------------------
// atlas.yaml
// ---------------------------------------------------------------------------

export interface OceanV2 {
  width: number;
  height: number;
  /** Sea style name (`default`). */
  sea: string;
}

/** Where a top-level map sits on the ocean, in ocean pixels. */
export interface OceanPlacementV2 {
  map: MapId;
  x: number;
  y: number;
  scale: number;
  rotation: number;
}

/** `<contentRoot>/_atlas/atlas.yaml`. */
export interface AtlasFileV2 {
  schemaVersion: 2;
  ocean: OceanV2;
  /** World folder ids. */
  worlds: WorldId[];
  /** Campaign ids; each has a file in `_atlas/campaigns/<id>.yaml`. */
  campaigns: CampaignId[];
  onOcean: OceanPlacementV2[];
}

// ---------------------------------------------------------------------------
// world.yaml
// ---------------------------------------------------------------------------

/** One image stacked on a map. v1's `MapLayer`, with `opacity` and `zIndex` optional. */
export interface LayerV2 {
  id: string;
  src: string;
  x: number;
  y: number;
  width: number;
  height: number;
  opacity?: number;
  zIndex?: number;
  rotation?: number;
  tileSrc?: string;
}

export interface ZoomRangeV2 {
  min: number;
  max: number;
}

/** A child map's rectangle in its parent's pixel space. */
export interface FrameV2 {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
}

/** v1's `Region`, without `mapId` (it sits under its map) and with a v2 visibility. */
export interface RegionV2 {
  id: string;
  name: string;
  /** Optional link to a note. */
  entityId?: string;
  color?: string;
  fillOpacity?: number;
  strokeOpacity?: number;
  points: Point[];
  visibility?: VisibilityValue;
}

export type WaypointV2 = Point | { entityId: string };

/** v1's route as written, without `mapId` and with a v2 visibility. */
export interface RouteV2 {
  id: string;
  name: string;
  mode?: RouteMode;
  speed?: number;
  color?: string;
  weight?: number;
  dashed?: boolean;
  waypoints: WaypointV2[];
  description?: string;
  visibility?: VisibilityValue;
}

/** A note's position on a map. Replaces frontmatter `atlas.placements` in v2. */
export interface PinV2 {
  note: NoteId;
  x: number;
  y: number;
  visibility?: VisibilityValue;
}

/**
 * v1's `SoundArea` with a v2 visibility. A ride-on area (`regionId`) takes its
 * region's verdict; a sound-only area has its own `points` and `visibility`.
 */
export interface SoundAreaV2 {
  id: string;
  regionId?: string;
  points?: Point[];
  visibility?: VisibilityValue;
  name?: string;
  bed: SoundBed;
}

/** One map in the map tree. A map with no `parent` sits on the ocean. */
export interface MapV2 {
  id: MapId;
  /** Missing means `dm` (resolved by R-11a). */
  visibility?: VisibilityValue;
  layers: LayerV2[];
  scale: MapScale;
  zoom: ZoomRangeV2;
  /** The parent map's id (same world). With a parent, `frame` and `enterZoom` are required. */
  parent?: MapId;
  frame?: FrameV2;
  /** The parent zoom at which the viewer enters this map. */
  enterZoom?: number;
  regions?: RegionV2[];
  routes?: RouteV2[];
  pins?: PinV2[];
  sound?: SoundAreaV2[];
}

/**
 * A `notes:` entry: per-campaign visibility for one note. It can only narrow
 * the note's frontmatter value (ADR-0004 rule 6). `basedOn` is the frontmatter
 * value it was written against; missing or different, the entry resolves to `dm`.
 */
export interface NoteOverride {
  visibility: VisibilityValue;
  basedOn?: WrittenVisibility;
  /** Map ids the note belongs to. */
  belongsTo?: MapId[];
}

/** `<contentRoot>/<world>/_atlas/world.yaml`. */
export interface WorldFileV2 {
  schemaVersion: 2;
  world: { id: WorldId; name: string };
  calendar?: WorldCalendar;
  credits?: CreditsConfig;
  assetCredits?: Record<string, AssetCredit>;
  /** Import folders (v1's `import:` block). */
  import?: ImportFolderConfig;
  water?: WaterConfig;
  maps: MapV2[];
  notes?: Record<NoteId, NoteOverride>;
}

// ---------------------------------------------------------------------------
// campaigns/<id>.yaml
// ---------------------------------------------------------------------------

/** `unknown`: the party hasn't found it (doesn't ship). `fogged`: ships with fog. `open`: ships whole. */
export type MapState = "unknown" | "fogged" | "open";

export const MAP_STATES: readonly MapState[] = ["unknown", "fogged", "open"];

/** One map's state in a campaign, with its fog when `fogged`. */
export interface CampaignMapV2 {
  state: MapState;
  reveals?: Point[][];
  conceals?: Point[][];
  featherPx?: number;
}

/**
 * How a campaign treats notes with no explicit entry for it (ADR-0004 question 5).
 * `vault`: the frontmatter value, narrowed by `notes:`. `hidden`: a note ships
 * only if its `notes:` entry names this campaign as `player` or `rumor`.
 */
export type CampaignNotesMode = "vault" | "hidden";

/** `<contentRoot>/_atlas/campaigns/<id>.yaml`, as validated. */
export interface CampaignFileV2 {
  id: CampaignId;
  name: string;
  /** Keyed by map id; a map not listed is `unknown` to this campaign. */
  maps: Record<MapId, CampaignMapV2>;
  /** Always set: a file with no `notes:` field reads as `hidden`, never `vault`. */
  notes: CampaignNotesMode;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export interface SchemaV2Error {
  /** Where the error is, e.g. `maps[2].frame.width`; `(root)` for the whole file. */
  path: string;
  message: string;
}

export type SchemaV2Result<T> = { ok: true; value: T } | { ok: false; errors: SchemaV2Error[] };

const ROOT = "(root)";
const ROUTE_MODES: readonly RouteMode[] = ["foot", "horse", "ship", "cart", "fly", "custom"];

type Obj = Record<string, unknown>;

function isObj(v: unknown): v is Obj {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** `maps` + `varn` -> `maps.varn`; a key that isn't a plain id is quoted: `maps["a b"]`. */
function join(path: string, key: string): string {
  if (/^[A-Za-z_][\w-]*$/.test(key)) return path === ROOT ? key : `${path}.${key}`;
  const seg = `[${JSON.stringify(key)}]`;
  return path === ROOT ? seg : `${path}${seg}`;
}

function idx(path: string, i: number): string {
  return path === ROOT ? `[${i}]` : `${path}[${i}]`;
}

/** Collects errors while reading one file. Every reader returns `undefined` on an error. */
class Reader {
  readonly errors: SchemaV2Error[] = [];

  fail(path: string, message: string): undefined {
    this.errors.push({ path, message });
    return undefined;
  }

  obj(v: unknown, path: string): Obj | undefined {
    return isObj(v) ? v : this.fail(path, `must be a mapping, got ${describe(v)}`);
  }

  str(o: Obj, key: string, path: string, required: boolean): string | undefined {
    const v = o[key];
    const p = join(path, key);
    if (v === undefined) return required ? this.fail(p, "is required") : undefined;
    if (typeof v !== "string") return this.fail(p, `must be a string, got ${describe(v)}`);
    if (required && v.trim() === "") return this.fail(p, "must not be empty");
    return v;
  }

  num(
    o: Obj,
    key: string,
    path: string,
    required: boolean,
    check?: "positive" | "nonNegative",
  ): number | undefined {
    const v = o[key];
    const p = join(path, key);
    if (v === undefined) return required ? this.fail(p, "is required") : undefined;
    if (typeof v !== "number" || !Number.isFinite(v)) {
      return this.fail(p, `must be a number, got ${describe(v)}`);
    }
    if (check === "positive" && v <= 0) return this.fail(p, `must be greater than 0, got ${v}`);
    if (check === "nonNegative" && v < 0) return this.fail(p, `must not be negative, got ${v}`);
    return v;
  }

  bool(o: Obj, key: string, path: string): boolean | undefined {
    const v = o[key];
    if (v === undefined) return undefined;
    return typeof v === "boolean" ? v : this.fail(join(path, key), `must be true or false, got ${describe(v)}`);
  }

  /** A required or optional array whose items are read by `item`; `undefined` if any item fails. */
  list<T>(
    o: Obj,
    key: string,
    path: string,
    required: boolean,
    item: (v: unknown, p: string) => T | undefined,
  ): T[] | undefined {
    const v = o[key];
    const p = join(path, key);
    if (v === undefined) return required ? this.fail(p, "is required") : undefined;
    if (!Array.isArray(v)) return this.fail(p, `must be a list, got ${describe(v)}`);
    const before = this.errors.length;
    const out = v.map((x, i) => item(x, idx(p, i)));
    return this.errors.length === before ? (out as T[]) : undefined;
  }

  /** A mapping whose values are read by `item`; `undefined` if any value fails. */
  record<T>(
    v: unknown,
    path: string,
    item: (v: unknown, p: string, key: string) => T | undefined,
  ): Record<string, T> | undefined {
    const o = this.obj(v, path);
    if (!o) return undefined;
    const before = this.errors.length;
    const out: Record<string, T> = {};
    for (const [k, x] of Object.entries(o)) {
      const r = item(x, join(path, k), k);
      if (r !== undefined) out[k] = r;
    }
    return this.errors.length === before ? out : undefined;
  }

  string(v: unknown, path: string): string | undefined {
    if (typeof v !== "string") return this.fail(path, `must be a string, got ${describe(v)}`);
    if (v.trim() === "") return this.fail(path, "must not be empty");
    return v;
  }

  point(v: unknown, path: string): Point | undefined {
    if (
      Array.isArray(v) &&
      v.length === 2 &&
      v.every((n) => typeof n === "number" && Number.isFinite(n))
    ) {
      return [v[0] as number, v[1] as number];
    }
    return this.fail(path, `must be a point [x, y], got ${describe(v)}`);
  }

  polygon(v: unknown, path: string): Point[] | undefined {
    if (!Array.isArray(v)) return this.fail(path, `must be a list of points, got ${describe(v)}`);
    const before = this.errors.length;
    const out = v.map((x, i) => this.point(x, idx(path, i)));
    return this.errors.length === before ? (out as Point[]) : undefined;
  }

  /** A visibility value, kept as written; only non-string values are rejected. */
  visibility(o: Obj, key: string, path: string, required: boolean): VisibilityValue | undefined {
    const v = o[key];
    const p = join(path, key);
    if (v === undefined) return required ? this.fail(p, "is required") : undefined;
    if (typeof v === "string") return v;
    if (!isObj(v)) {
      return this.fail(p, `must be a visibility or a mapping of campaign to visibility, got ${describe(v)}`);
    }
    return this.record(v, p, (x, xp) =>
      typeof x === "string" ? x : this.fail(xp, `must be a visibility string, got ${describe(x)}`),
    );
  }

  schemaVersion(o: Obj): 2 | undefined {
    const v = o.schemaVersion;
    if (v === undefined) return this.fail("schemaVersion", "is required (2)");
    return v === 2 ? 2 : this.fail("schemaVersion", `must be 2, got ${describe(v)}`);
  }
}

function describe(v: unknown): string {
  if (v === null) return "null";
  if (Array.isArray(v)) return "a list";
  if (typeof v === "object") return "a mapping";
  if (typeof v === "string") return JSON.stringify(v);
  return `${typeof v} ${String(v)}`;
}

function done<T>(r: Reader, value: T | undefined): SchemaV2Result<T> {
  if (r.errors.length > 0 || value === undefined) {
    return { ok: false, errors: r.errors.length > 0 ? r.errors : [{ path: ROOT, message: "invalid" }] };
  }
  return { ok: true, value };
}

/** Drop `undefined` optional fields so validated values compare cleanly. */
function compact<T extends object>(o: T): T {
  for (const k of Object.keys(o) as (keyof T)[]) if (o[k] === undefined) delete o[k];
  return o;
}

// --- atlas.yaml ------------------------------------------------------------

/** Validate a parsed `atlas.yaml`. */
export function validateAtlasFileV2(raw: unknown): SchemaV2Result<AtlasFileV2> {
  const r = new Reader();
  const o = r.obj(raw, ROOT);
  if (!o) return done<AtlasFileV2>(r, undefined);

  const schemaVersion = r.schemaVersion(o);
  const oceanRaw = o.ocean === undefined ? r.fail("ocean", "is required") : r.obj(o.ocean, "ocean");
  let ocean: OceanV2 | undefined;
  if (oceanRaw) {
    const width = r.num(oceanRaw, "width", "ocean", true, "positive");
    const height = r.num(oceanRaw, "height", "ocean", true, "positive");
    const sea = r.str(oceanRaw, "sea", "ocean", true);
    if (width !== undefined && height !== undefined && sea !== undefined) ocean = { width, height, sea };
  }
  const worlds = r.list(o, "worlds", ROOT, true, (v, p) => r.string(v, p));
  const campaigns = r.list(o, "campaigns", ROOT, true, (v, p) => r.string(v, p));
  const onOcean = r.list(o, "onOcean", ROOT, true, (v, p) => {
    const e = r.obj(v, p);
    if (!e) return undefined;
    const map = r.str(e, "map", p, true);
    const x = r.num(e, "x", p, true);
    const y = r.num(e, "y", p, true);
    const scale = r.num(e, "scale", p, true, "positive");
    const rotation = r.num(e, "rotation", p, true);
    if (map === undefined || x === undefined || y === undefined) return undefined;
    if (scale === undefined || rotation === undefined) return undefined;
    return { map, x, y, scale, rotation };
  });

  if (!schemaVersion || !ocean || !worlds || !campaigns || !onOcean) return done<AtlasFileV2>(r, undefined);
  return done(r, { schemaVersion, ocean, worlds, campaigns, onOcean });
}

// --- world.yaml ------------------------------------------------------------

function readLayer(r: Reader, v: unknown, p: string): LayerV2 | undefined {
  const o = r.obj(v, p);
  if (!o) return undefined;
  const before = r.errors.length;
  const layer = compact<LayerV2>({
    id: r.str(o, "id", p, true) as string,
    src: r.str(o, "src", p, true) as string,
    x: r.num(o, "x", p, true) as number,
    y: r.num(o, "y", p, true) as number,
    width: r.num(o, "width", p, true, "positive") as number,
    height: r.num(o, "height", p, true, "positive") as number,
    opacity: r.num(o, "opacity", p, false),
    zIndex: r.num(o, "zIndex", p, false),
    rotation: r.num(o, "rotation", p, false),
    tileSrc: r.str(o, "tileSrc", p, false),
  });
  return r.errors.length === before ? layer : undefined;
}

function readScale(r: Reader, o: Obj, p: string): MapScale | undefined {
  const sp = join(p, "scale");
  if (o.scale === undefined) return r.fail(sp, "is required");
  const s = r.obj(o.scale, sp);
  if (!s) return undefined;
  const unitsPerPixel = r.num(s, "unitsPerPixel", sp, true, "positive");
  const unitLabel = r.str(s, "unitLabel", sp, true);
  if (unitsPerPixel === undefined || unitLabel === undefined) return undefined;
  return { unitsPerPixel, unitLabel };
}

function readZoom(r: Reader, o: Obj, p: string): ZoomRangeV2 | undefined {
  const zp = join(p, "zoom");
  if (o.zoom === undefined) return r.fail(zp, "is required");
  const z = r.obj(o.zoom, zp);
  if (!z) return undefined;
  const min = r.num(z, "min", zp, true);
  const max = r.num(z, "max", zp, true);
  if (min === undefined || max === undefined) return undefined;
  if (min > max) return r.fail(zp, `min (${min}) must not be greater than max (${max})`);
  return { min, max };
}

function readFrame(r: Reader, v: unknown, p: string): FrameV2 | undefined {
  const f = r.obj(v, p);
  if (!f) return undefined;
  const x = r.num(f, "x", p, true);
  const y = r.num(f, "y", p, true);
  const width = r.num(f, "width", p, true, "positive");
  const height = r.num(f, "height", p, true, "positive");
  const rotation = r.num(f, "rotation", p, true);
  if (x === undefined || y === undefined || width === undefined) return undefined;
  if (height === undefined || rotation === undefined) return undefined;
  return { x, y, width, height, rotation };
}

function readRegion(r: Reader, v: unknown, p: string): RegionV2 | undefined {
  const o = r.obj(v, p);
  if (!o) return undefined;
  const before = r.errors.length;
  const region = compact<RegionV2>({
    id: r.str(o, "id", p, true) as string,
    name: r.str(o, "name", p, true) as string,
    entityId: r.str(o, "entityId", p, false),
    color: r.str(o, "color", p, false),
    fillOpacity: r.num(o, "fillOpacity", p, false),
    strokeOpacity: r.num(o, "strokeOpacity", p, false),
    points: (o.points === undefined
      ? r.fail(join(p, "points"), "is required")
      : r.polygon(o.points, join(p, "points"))) as Point[],
    visibility: r.visibility(o, "visibility", p, false),
  });
  return r.errors.length === before ? region : undefined;
}

function readWaypoint(r: Reader, v: unknown, p: string): WaypointV2 | undefined {
  if (isObj(v)) {
    const entityId = r.str(v, "entityId", p, true);
    return entityId === undefined ? undefined : { entityId };
  }
  return r.point(v, p);
}

function readRoute(r: Reader, v: unknown, p: string): RouteV2 | undefined {
  const o = r.obj(v, p);
  if (!o) return undefined;
  const before = r.errors.length;
  const mode = r.str(o, "mode", p, false);
  if (mode !== undefined && !(ROUTE_MODES as readonly string[]).includes(mode)) {
    r.fail(join(p, "mode"), `must be one of ${ROUTE_MODES.join(", ")}, got ${JSON.stringify(mode)}`);
  }
  const route = compact<RouteV2>({
    id: r.str(o, "id", p, true) as string,
    name: r.str(o, "name", p, true) as string,
    mode: mode as RouteMode | undefined,
    speed: r.num(o, "speed", p, false, "nonNegative"),
    color: r.str(o, "color", p, false),
    weight: r.num(o, "weight", p, false, "nonNegative"),
    dashed: r.bool(o, "dashed", p),
    waypoints: r.list(o, "waypoints", p, true, (x, xp) => readWaypoint(r, x, xp)) as WaypointV2[],
    description: r.str(o, "description", p, false),
    visibility: r.visibility(o, "visibility", p, false),
  });
  return r.errors.length === before ? route : undefined;
}

function readPin(r: Reader, v: unknown, p: string): PinV2 | undefined {
  const o = r.obj(v, p);
  if (!o) return undefined;
  const before = r.errors.length;
  const pin = compact<PinV2>({
    note: r.str(o, "note", p, true) as string,
    x: r.num(o, "x", p, true) as number,
    y: r.num(o, "y", p, true) as number,
    visibility: r.visibility(o, "visibility", p, false),
  });
  return r.errors.length === before ? pin : undefined;
}

function readBed(r: Reader, o: Obj, p: string): SoundBed | undefined {
  const bp = join(p, "bed");
  if (o.bed === undefined) return r.fail(bp, "is required");
  const b = r.obj(o.bed, bp);
  if (!b) return undefined;
  const before = r.errors.length;
  const bed = compact<SoundBed>({
    src: r.str(b, "src", bp, true) as string,
    srcFallback: r.str(b, "srcFallback", bp, false),
    gain: r.num(b, "gain", bp, false, "nonNegative"),
  });
  return r.errors.length === before ? bed : undefined;
}

function readSoundArea(r: Reader, v: unknown, p: string): SoundAreaV2 | undefined {
  const o = r.obj(v, p);
  if (!o) return undefined;
  const before = r.errors.length;
  const regionId = r.str(o, "regionId", p, false);
  const points = o.points === undefined ? undefined : r.polygon(o.points, join(p, "points"));
  if (regionId === undefined && o.points === undefined) {
    r.fail(p, "needs either regionId (ride-on) or points (sound-only)");
  }
  const area = compact<SoundAreaV2>({
    id: r.str(o, "id", p, true) as string,
    regionId,
    points,
    visibility: r.visibility(o, "visibility", p, false),
    name: r.str(o, "name", p, false),
    bed: readBed(r, o, p) as SoundBed,
  });
  return r.errors.length === before ? area : undefined;
}

function readMap(r: Reader, v: unknown, p: string): MapV2 | undefined {
  const o = r.obj(v, p);
  if (!o) return undefined;
  const before = r.errors.length;
  const parent = r.str(o, "parent", p, false);
  let frame: FrameV2 | undefined;
  let enterZoom: number | undefined;
  if (parent !== undefined) {
    frame =
      o.frame === undefined
        ? r.fail(join(p, "frame"), "is required on a map with a parent")
        : readFrame(r, o.frame, join(p, "frame"));
    enterZoom =
      o.enterZoom === undefined
        ? r.fail(join(p, "enterZoom"), "is required on a map with a parent")
        : r.num(o, "enterZoom", p, true);
  } else {
    if (o.frame !== undefined) r.fail(join(p, "frame"), "only a map with a parent has a frame");
    if (o.enterZoom !== undefined) r.fail(join(p, "enterZoom"), "only a map with a parent has an enterZoom");
  }
  const map = compact<MapV2>({
    id: r.str(o, "id", p, true) as string,
    visibility: r.visibility(o, "visibility", p, false),
    layers: r.list(o, "layers", p, true, (x, xp) => readLayer(r, x, xp)) as LayerV2[],
    scale: readScale(r, o, p) as MapScale,
    zoom: readZoom(r, o, p) as ZoomRangeV2,
    parent,
    frame,
    enterZoom,
    regions: r.list(o, "regions", p, false, (x, xp) => readRegion(r, x, xp)),
    routes: r.list(o, "routes", p, false, (x, xp) => readRoute(r, x, xp)),
    pins: r.list(o, "pins", p, false, (x, xp) => readPin(r, x, xp)),
    sound: r.list(o, "sound", p, false, (x, xp) => readSoundArea(r, x, xp)),
  });
  return r.errors.length === before ? map : undefined;
}

function readNoteOverride(r: Reader, v: unknown, p: string): NoteOverride | undefined {
  const o = r.obj(v, p);
  if (!o) return undefined;
  const before = r.errors.length;
  const basedOn = o.basedOn;
  if (basedOn !== undefined && typeof basedOn !== "string") {
    r.fail(join(p, "basedOn"), `must be a visibility string, got ${describe(basedOn)}`);
  }
  const entry = compact<NoteOverride>({
    visibility: r.visibility(o, "visibility", p, true) as VisibilityValue,
    basedOn: typeof basedOn === "string" ? basedOn : undefined,
    belongsTo: r.list(o, "belongsTo", p, false, (x, xp) => r.string(x, xp)),
  });
  return r.errors.length === before ? entry : undefined;
}

function readCalendar(r: Reader, v: unknown, p: string): WorldCalendar | undefined {
  const o = r.obj(v, p);
  if (!o) return undefined;
  const before = r.errors.length;
  const cal = compact<WorldCalendar>({
    name: r.str(o, "name", p, false),
    epochName: r.str(o, "epochName", p, false),
    daysPerWeek: r.num(o, "daysPerWeek", p, false, "positive"),
    months: r.list(o, "months", p, true, (x, xp) => {
      const m = r.obj(x, xp);
      if (!m) return undefined;
      const name = r.str(m, "name", xp, true);
      const days = r.num(m, "days", xp, true, "positive");
      return name === undefined || days === undefined ? undefined : { name, days };
    }) as WorldCalendar["months"],
  });
  return r.errors.length === before ? cal : undefined;
}

function readCredits(r: Reader, v: unknown, p: string): CreditsConfig | undefined {
  const o = r.obj(v, p);
  if (!o) return undefined;
  const before = r.errors.length;
  const credits = compact<CreditsConfig>({ badges: r.bool(o, "badges", p), page: r.bool(o, "page", p) });
  return r.errors.length === before ? credits : undefined;
}

function readAssetCredit(r: Reader, v: unknown, p: string): AssetCredit | undefined {
  const o = r.obj(v, p);
  if (!o) return undefined;
  const credit = r.str(o, "credit", p, true);
  const enabled = o.enabled;
  if (typeof enabled !== "boolean") {
    return r.fail(join(p, "enabled"), enabled === undefined ? "is required" : `must be true or false, got ${describe(enabled)}`);
  }
  return credit === undefined ? undefined : { credit, enabled };
}

function readImport(r: Reader, v: unknown, p: string): ImportFolderConfig | undefined {
  const o = r.obj(v, p);
  if (!o) return undefined;
  const fp = join(p, "folders");
  const folders = o.folders === undefined ? r.fail(fp, "is required") : r.record(o.folders, fp, (x, xp) => r.string(x, xp));
  const defaultFolder = r.str(o, "defaultFolder", p, true);
  return folders === undefined || defaultFolder === undefined ? undefined : { folders, defaultFolder };
}

function readWater(r: Reader, v: unknown, p: string): WaterConfig | undefined {
  const o = r.obj(v, p);
  if (!o) return undefined;
  const before = r.errors.length;
  const water = compact<WaterConfig>({
    enabled: r.bool(o, "enabled", p),
    intensity: r.num(o, "intensity", p, false, "nonNegative"),
    speed: r.num(o, "speed", p, false, "nonNegative"),
    crestColor: r.str(o, "crestColor", p, false),
  });
  return r.errors.length === before ? water : undefined;
}

function optional<T>(o: Obj, key: string, read: (v: unknown, p: string) => T | undefined): T | undefined {
  return o[key] === undefined ? undefined : read(o[key], key);
}

/** Validate a parsed v2 `world.yaml`. */
export function validateWorldFileV2(raw: unknown): SchemaV2Result<WorldFileV2> {
  const r = new Reader();
  const o = r.obj(raw, ROOT);
  if (!o) return done<WorldFileV2>(r, undefined);

  const schemaVersion = r.schemaVersion(o);
  let world: WorldFileV2["world"] | undefined;
  if (o.world === undefined) r.fail("world", "is required");
  else {
    const w = r.obj(o.world, "world");
    if (w) {
      const id = r.str(w, "id", "world", true);
      const name = r.str(w, "name", "world", true);
      if (id !== undefined && name !== undefined) world = { id, name };
    }
  }
  const before = r.errors.length;
  const file = compact<WorldFileV2>({
    schemaVersion: schemaVersion as 2,
    world: world as WorldFileV2["world"],
    calendar: optional(o, "calendar", (v, p) => readCalendar(r, v, p)),
    credits: optional(o, "credits", (v, p) => readCredits(r, v, p)),
    assetCredits: optional(o, "assetCredits", (v, p) => r.record(v, p, (x, xp) => readAssetCredit(r, x, xp))),
    import: optional(o, "import", (v, p) => readImport(r, v, p)),
    water: optional(o, "water", (v, p) => readWater(r, v, p)),
    maps: r.list(o, "maps", ROOT, true, (v, p) => readMap(r, v, p)) as MapV2[],
    notes: optional(o, "notes", (v, p) => r.record(v, p, (x, xp) => readNoteOverride(r, x, xp))),
  });
  return done(r, r.errors.length === before && schemaVersion && world ? file : undefined);
}

// --- campaigns/<id>.yaml ---------------------------------------------------

function readCampaignMap(r: Reader, v: unknown, p: string): CampaignMapV2 | undefined {
  const o = r.obj(v, p);
  if (!o) return undefined;
  const before = r.errors.length;
  const state = r.str(o, "state", p, true);
  if (state !== undefined && !(MAP_STATES as readonly string[]).includes(state)) {
    r.fail(join(p, "state"), `must be one of ${MAP_STATES.join(", ")}, got ${JSON.stringify(state)}`);
  }
  const polygons = (key: string) =>
    r.list(o, key, p, false, (x, xp) => r.polygon(x, xp));
  const entry = compact<CampaignMapV2>({
    state: state as MapState,
    reveals: polygons("reveals"),
    conceals: polygons("conceals"),
    featherPx: r.num(o, "featherPx", p, false, "nonNegative"),
  });
  return r.errors.length === before ? entry : undefined;
}

/**
 * Validate a parsed campaign file. A missing `maps:` reads as `{}` (every map
 * `unknown`); a missing `notes:` reads as `hidden`, never `vault` (fail closed).
 */
export function validateCampaignFileV2(raw: unknown): SchemaV2Result<CampaignFileV2> {
  const r = new Reader();
  const o = r.obj(raw, ROOT);
  if (!o) return done<CampaignFileV2>(r, undefined);

  const id = r.str(o, "id", ROOT, true);
  const name = r.str(o, "name", ROOT, true);
  const maps = o.maps === undefined ? {} : r.record(o.maps, "maps", (x, xp) => readCampaignMap(r, x, xp));
  let notes: CampaignNotesMode | undefined = "hidden";
  if (o.notes !== undefined) {
    notes =
      o.notes === "vault" || o.notes === "hidden"
        ? o.notes
        : r.fail("notes", `must be vault or hidden, got ${describe(o.notes)}`);
  }
  if (id === undefined || name === undefined || maps === undefined || notes === undefined) {
    return done<CampaignFileV2>(r, undefined);
  }
  return done(r, { id, name, maps, notes });
}
