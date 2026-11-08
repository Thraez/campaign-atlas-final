/**
 * Schema v2 source files (ADR-0003, ADR-0004): the types and pure shape
 * validators for `_atlas/atlas.yaml` (the ocean), `<world>/_atlas/world.yaml`
 * (the map tree) and `_atlas/campaigns/<id>.yaml` (a campaign file).
 *
 * Each validator takes an already-parsed YAML value (no file IO) and returns
 * either the typed file or every structural error it found, each naming its
 * path (`maps[2].frame.width`). Structural means wrong types, missing or
 * empty ids, missing required fields, unknown fields, a bad map `state`, a
 * non-positive size or a polygon with fewer than 3 points.
 *
 * Visibility values are kept as written: an unknown string is not an error
 * here. The per-campaign resolver (R-11a) reads anything that isn't a valid
 * `EntityVisibility`, a missing value, or a campaign not named in a
 * per-campaign map, as `dm`. Only a value that isn't a string, or a
 * per-campaign entry that isn't a string, is rejected.
 *
 * Items use v1's field names (`points`, `entityId`, `regionId`, `bed`,
 * `unitLabel`), not plan.md section 4's sketch names, so the migration copies
 * them unchanged.
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
  GridKind,
  GridOverlay,
  ImportFolderConfig,
  MapScale,
  Point,
  RouteMode,
  SoundBed,
  SoundscapeConfig,
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
  /** At least 3 points. */
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
 * region's verdict; a sound-only area has its own `points` (at least 3) and
 * `visibility`.
 */
export interface SoundAreaV2 {
  id: string;
  regionId?: string;
  points?: Point[];
  visibility?: VisibilityValue;
  name?: string;
  bed: SoundBed;
}

/**
 * A map's soundscape settings: v1's `soundscape:` block without `areas`, which
 * live in the map's `sound:` list. v1 `soundscape: { enabled, masterGain, areas }`
 * maps to v2 `soundscape: { enabled, masterGain }` plus `sound: areas`, losslessly.
 */
export type SoundscapeSettingsV2 = Omit<SoundscapeConfig, "areas">;

/** One map in the map tree. A map with no `parent` sits on the ocean. */
export interface MapV2 {
  id: MapId;
  name: string;
  /** The map's pixel size. */
  width: number;
  height: number;
  /** Missing means `dm` (resolved by R-11a). */
  visibility?: VisibilityValue;
  layers: LayerV2[];
  scale: MapScale;
  zoom: ZoomRangeV2;
  grid?: GridOverlay;
  oceanColor?: string;
  wrapX?: boolean;
  soundscape?: SoundscapeSettingsV2;
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
 * value it was written against; missing or different, the entry resolves to
 * `dm`, which is why it is optional here.
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
 * How a campaign treats notes with no explicit entry for it (ADR-0004).
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
const GRID_KINDS: readonly GridKind[] = ["square", "hex"];
/** Keys that would reach an object's prototype; never valid as a user-chosen id. */
const FORBIDDEN_KEYS: ReadonlySet<string> = new Set(["__proto__", "constructor", "prototype"]);

// The fields each object may have. Anything else is an "unknown field" error.
const KEYS = {
  atlas: ["schemaVersion", "ocean", "worlds", "campaigns", "onOcean"],
  ocean: ["width", "height", "sea"],
  onOcean: ["map", "x", "y", "scale", "rotation"],
  world: [
    "schemaVersion",
    "world",
    "calendar",
    "credits",
    "assetCredits",
    "import",
    "water",
    "maps",
    "notes",
  ],
  worldBlock: ["id", "name"],
  map: [
    "id",
    "name",
    "width",
    "height",
    "visibility",
    "layers",
    "scale",
    "zoom",
    "grid",
    "oceanColor",
    "wrapX",
    "soundscape",
    "parent",
    "frame",
    "enterZoom",
    "regions",
    "routes",
    "pins",
    "sound",
  ],
  layer: ["id", "src", "x", "y", "width", "height", "opacity", "zIndex", "rotation", "tileSrc"],
  scale: ["unitsPerPixel", "unitLabel"],
  zoom: ["min", "max"],
  grid: ["kind", "size", "color", "enabled"],
  soundscape: ["enabled", "masterGain"],
  frame: ["x", "y", "width", "height", "rotation"],
  region: ["id", "name", "entityId", "color", "fillOpacity", "strokeOpacity", "points", "visibility"],
  route: [
    "id",
    "name",
    "mode",
    "speed",
    "color",
    "weight",
    "dashed",
    "waypoints",
    "description",
    "visibility",
  ],
  waypoint: ["entityId"],
  pin: ["note", "x", "y", "visibility"],
  soundArea: ["id", "regionId", "points", "visibility", "name", "bed"],
  bed: ["src", "srcFallback", "gain"],
  noteOverride: ["visibility", "basedOn", "belongsTo"],
  calendar: ["name", "epochName", "daysPerWeek", "months"],
  month: ["name", "days"],
  credits: ["badges", "page"],
  assetCredit: ["credit", "enabled"],
  import: ["folders", "defaultFolder"],
  water: ["enabled", "intensity", "speed", "crestColor"],
  campaign: ["id", "name", "maps", "notes"],
  campaignMap: ["state", "reveals", "conceals", "featherPx"],
} as const satisfies Record<string, readonly string[]>;

type Obj = Record<string, unknown>;
type Check = "positive" | "nonNegative";

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

function describe(v: unknown): string {
  if (v === null) return "null";
  if (Array.isArray(v)) return "a list";
  if (typeof v === "object") return "a mapping";
  if (typeof v === "string") return JSON.stringify(v);
  return `${typeof v} ${String(v)}`;
}

/** Drop `undefined` optional fields so validated values compare cleanly. */
function compact<T extends object>(o: T): T {
  for (const k of Object.keys(o) as (keyof T)[]) if (o[k] === undefined) delete o[k];
  return o;
}

/**
 * Collects errors while reading one file. Every reader returns `undefined` on
 * an error; a composite reader returns its value only if nothing under it failed.
 */
class Reader {
  readonly errors: SchemaV2Error[] = [];

  fail(path: string, message: string): undefined {
    this.errors.push({ path, message });
    return undefined;
  }

  /** `value` if no error was added since `before`. */
  okSince<T>(before: number, value: T): T | undefined {
    return this.errors.length === before ? value : undefined;
  }

  /** A mapping with only the `allowed` fields; each other field is an error. */
  obj(v: unknown, path: string, allowed?: readonly string[]): Obj | undefined {
    if (!isObj(v)) return this.fail(path, `must be a mapping, got ${describe(v)}`);
    if (allowed) {
      for (const k of Object.keys(v)) if (!allowed.includes(k)) this.fail(join(path, k), "unknown field");
    }
    return v;
  }

  /** A nested mapping under `key`. */
  sub(o: Obj, key: string, path: string, required: boolean, allowed: readonly string[]): Obj | undefined {
    const p = join(path, key);
    if (o[key] === undefined) return required ? this.fail(p, "is required") : undefined;
    return this.obj(o[key], p, allowed);
  }

  /** A string field. Required ones must not be empty. */
  text(o: Obj, key: string, path: string, required: boolean): string | undefined {
    const v = o[key];
    const p = join(path, key);
    if (v === undefined) return required ? this.fail(p, "is required") : undefined;
    if (typeof v !== "string") return this.fail(p, `must be a string, got ${describe(v)}`);
    if (required && v.trim() === "") return this.fail(p, "must not be empty");
    return v;
  }

  /** An id field (an id, or a reference to one): never empty, even when optional. */
  id(o: Obj, key: string, path: string, required: boolean): string | undefined {
    if (o[key] === undefined) return required ? this.fail(join(path, key), "is required") : undefined;
    return this.idValue(o[key], join(path, key));
  }

  idValue(v: unknown, path: string): string | undefined {
    if (typeof v !== "string") return this.fail(path, `must be a string, got ${describe(v)}`);
    if (v.trim() === "") return this.fail(path, "must not be empty");
    return v;
  }

  num(o: Obj, key: string, path: string, required: boolean, check?: Check): number | undefined {
    const v = o[key];
    const p = join(path, key);
    if (v === undefined) return required ? this.fail(p, "is required") : undefined;
    if (typeof v !== "number" || !Number.isFinite(v)) {
      return this.fail(p, `must be a finite number, got ${describe(v)}`);
    }
    if (check === "positive" && v <= 0) return this.fail(p, `must be greater than 0, got ${v}`);
    if (check === "nonNegative" && v < 0) return this.fail(p, `must not be negative, got ${v}`);
    return v;
  }

  bool(o: Obj, key: string, path: string): boolean | undefined {
    const v = o[key];
    if (v === undefined || typeof v === "boolean") return v;
    return this.fail(join(path, key), `must be true or false, got ${describe(v)}`);
  }

  /** One of a fixed set of strings. */
  oneOf<T extends string>(o: Obj, key: string, path: string, required: boolean, values: readonly T[]) {
    const v = this.text(o, key, path, required);
    if (v === undefined || (values as readonly string[]).includes(v)) return v as T | undefined;
    return this.fail(join(path, key), `must be one of ${values.join(", ")}, got ${JSON.stringify(v)}`);
  }

  /** A list whose items are read by `item`; `undefined` if any item fails. */
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
    return this.okSince(before, out as T[]);
  }

  /**
   * A mapping keyed by user-chosen ids, its values read by `item`. Built on a
   * null prototype, and `__proto__`, `constructor` and `prototype` are refused
   * as keys, so no id can reach `Object.prototype`.
   */
  record<T>(v: unknown, path: string, item: (v: unknown, p: string) => T | undefined): Record<string, T> | undefined {
    const o = this.obj(v, path);
    if (!o) return undefined;
    const before = this.errors.length;
    const out = Object.create(null) as Record<string, T>;
    for (const [k, x] of Object.entries(o)) {
      const p = join(path, k);
      if (FORBIDDEN_KEYS.has(k)) {
        this.fail(p, "is a reserved name and can't be used as a key");
        continue;
      }
      if (k.trim() === "") {
        this.fail(p, "key must not be empty");
        continue;
      }
      const r = item(x, p);
      if (r !== undefined) out[k] = r;
    }
    return this.okSince(before, out);
  }

  point(v: unknown, path: string): Point | undefined {
    if (Array.isArray(v) && v.length === 2 && v.every((n) => typeof n === "number" && Number.isFinite(n))) {
      return [v[0] as number, v[1] as number];
    }
    return this.fail(path, `must be a point [x, y] of finite numbers, got ${describe(v)}`);
  }

  /** A list of points; with `minPoints`, a shorter list is an error. */
  polygon(v: unknown, path: string, minPoints = 0): Point[] | undefined {
    if (!Array.isArray(v)) return this.fail(path, `must be a list of points, got ${describe(v)}`);
    const before = this.errors.length;
    const out = v.map((x, i) => this.point(x, idx(path, i)));
    if (v.length < minPoints) this.fail(path, `needs at least ${minPoints} points, got ${v.length}`);
    return this.okSince(before, out as Point[]);
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

function done<T>(r: Reader, value: T | undefined): SchemaV2Result<T> {
  if (r.errors.length > 0 || value === undefined) {
    return { ok: false, errors: r.errors.length > 0 ? r.errors : [{ path: ROOT, message: "invalid" }] };
  }
  return { ok: true, value };
}

// --- atlas.yaml ------------------------------------------------------------

function readOceanPlacement(r: Reader, v: unknown, p: string): OceanPlacementV2 | undefined {
  const o = r.obj(v, p, KEYS.onOcean);
  if (!o) return undefined;
  const before = r.errors.length;
  return r.okSince(before, {
    map: r.id(o, "map", p, true) as string,
    x: r.num(o, "x", p, true) as number,
    y: r.num(o, "y", p, true) as number,
    scale: r.num(o, "scale", p, true, "positive") as number,
    rotation: r.num(o, "rotation", p, true) as number,
  });
}

/** Validate a parsed `atlas.yaml`. */
export function validateAtlasFileV2(raw: unknown): SchemaV2Result<AtlasFileV2> {
  const r = new Reader();
  const o = r.obj(raw, ROOT, KEYS.atlas);
  if (!o) return done<AtlasFileV2>(r, undefined);

  const schemaVersion = r.schemaVersion(o);
  const ocean = r.sub(o, "ocean", ROOT, true, KEYS.ocean);
  const file: AtlasFileV2 = {
    schemaVersion: schemaVersion as 2,
    ocean: (ocean && {
      width: r.num(ocean, "width", "ocean", true, "positive") as number,
      height: r.num(ocean, "height", "ocean", true, "positive") as number,
      sea: r.text(ocean, "sea", "ocean", true) as string,
    }) as OceanV2,
    worlds: r.list(o, "worlds", ROOT, true, (v, p) => r.idValue(v, p)) as WorldId[],
    campaigns: r.list(o, "campaigns", ROOT, true, (v, p) => r.idValue(v, p)) as CampaignId[],
    onOcean: r.list(o, "onOcean", ROOT, true, (v, p) => readOceanPlacement(r, v, p)) as OceanPlacementV2[],
  };
  return done(r, file);
}

// --- world.yaml ------------------------------------------------------------

function readLayer(r: Reader, v: unknown, p: string): LayerV2 | undefined {
  const o = r.obj(v, p, KEYS.layer);
  if (!o) return undefined;
  const before = r.errors.length;
  return r.okSince(
    before,
    compact<LayerV2>({
      id: r.id(o, "id", p, true) as string,
      src: r.text(o, "src", p, true) as string,
      x: r.num(o, "x", p, true) as number,
      y: r.num(o, "y", p, true) as number,
      width: r.num(o, "width", p, true, "positive") as number,
      height: r.num(o, "height", p, true, "positive") as number,
      opacity: r.num(o, "opacity", p, false, "nonNegative"),
      zIndex: r.num(o, "zIndex", p, false),
      rotation: r.num(o, "rotation", p, false),
      tileSrc: r.text(o, "tileSrc", p, false),
    }),
  );
}

function readScale(r: Reader, o: Obj, p: string): MapScale | undefined {
  const s = r.sub(o, "scale", p, true, KEYS.scale);
  if (!s) return undefined;
  const sp = join(p, "scale");
  const before = r.errors.length;
  return r.okSince(before, {
    unitsPerPixel: r.num(s, "unitsPerPixel", sp, true, "positive") as number,
    unitLabel: r.text(s, "unitLabel", sp, true) as string,
  });
}

function readZoom(r: Reader, o: Obj, p: string): ZoomRangeV2 | undefined {
  const z = r.sub(o, "zoom", p, true, KEYS.zoom);
  if (!z) return undefined;
  const zp = join(p, "zoom");
  const min = r.num(z, "min", zp, true);
  const max = r.num(z, "max", zp, true);
  if (min === undefined || max === undefined) return undefined;
  if (min > max) return r.fail(zp, `min (${min}) must not be greater than max (${max})`);
  return { min, max };
}

function readGrid(r: Reader, o: Obj, p: string): GridOverlay | undefined {
  const g = r.sub(o, "grid", p, false, KEYS.grid);
  if (!g) return undefined;
  const gp = join(p, "grid");
  const before = r.errors.length;
  return r.okSince(
    before,
    compact<GridOverlay>({
      kind: r.oneOf(g, "kind", gp, true, GRID_KINDS) as GridKind,
      size: r.num(g, "size", gp, true, "positive") as number,
      color: r.text(g, "color", gp, false),
      enabled: r.bool(g, "enabled", gp),
    }),
  );
}

function readSoundscape(r: Reader, o: Obj, p: string): SoundscapeSettingsV2 | undefined {
  const s = r.sub(o, "soundscape", p, false, KEYS.soundscape);
  if (!s) return undefined;
  const sp = join(p, "soundscape");
  const before = r.errors.length;
  return r.okSince(
    before,
    compact<SoundscapeSettingsV2>({
      enabled: r.bool(s, "enabled", sp),
      masterGain: r.num(s, "masterGain", sp, false, "nonNegative"),
    }),
  );
}

function readFrame(r: Reader, o: Obj, p: string): FrameV2 | undefined {
  const fp = join(p, "frame");
  if (o.frame === undefined) return r.fail(fp, "is required on a map with a parent");
  const f = r.obj(o.frame, fp, KEYS.frame);
  if (!f) return undefined;
  const before = r.errors.length;
  return r.okSince(before, {
    x: r.num(f, "x", fp, true) as number,
    y: r.num(f, "y", fp, true) as number,
    width: r.num(f, "width", fp, true, "positive") as number,
    height: r.num(f, "height", fp, true, "positive") as number,
    rotation: r.num(f, "rotation", fp, true) as number,
  });
}

function readPoints(r: Reader, o: Obj, p: string, required: boolean): Point[] | undefined {
  const pp = join(p, "points");
  if (o.points === undefined) return required ? r.fail(pp, "is required") : undefined;
  return r.polygon(o.points, pp, 3);
}

function readRegion(r: Reader, v: unknown, p: string): RegionV2 | undefined {
  const o = r.obj(v, p, KEYS.region);
  if (!o) return undefined;
  const before = r.errors.length;
  return r.okSince(
    before,
    compact<RegionV2>({
      id: r.id(o, "id", p, true) as string,
      name: r.text(o, "name", p, true) as string,
      entityId: r.id(o, "entityId", p, false),
      color: r.text(o, "color", p, false),
      fillOpacity: r.num(o, "fillOpacity", p, false, "nonNegative"),
      strokeOpacity: r.num(o, "strokeOpacity", p, false, "nonNegative"),
      points: readPoints(r, o, p, true) as Point[],
      visibility: r.visibility(o, "visibility", p, false),
    }),
  );
}

function readWaypoint(r: Reader, v: unknown, p: string): WaypointV2 | undefined {
  if (isObj(v)) {
    const o = r.obj(v, p, KEYS.waypoint);
    const entityId = o && r.id(o, "entityId", p, true);
    return entityId === undefined ? undefined : { entityId };
  }
  return r.point(v, p);
}

function readRoute(r: Reader, v: unknown, p: string): RouteV2 | undefined {
  const o = r.obj(v, p, KEYS.route);
  if (!o) return undefined;
  const before = r.errors.length;
  return r.okSince(
    before,
    compact<RouteV2>({
      id: r.id(o, "id", p, true) as string,
      name: r.text(o, "name", p, true) as string,
      mode: r.oneOf(o, "mode", p, false, ROUTE_MODES),
      speed: r.num(o, "speed", p, false, "nonNegative"),
      color: r.text(o, "color", p, false),
      weight: r.num(o, "weight", p, false, "nonNegative"),
      dashed: r.bool(o, "dashed", p),
      waypoints: r.list(o, "waypoints", p, true, (x, xp) => readWaypoint(r, x, xp)) as WaypointV2[],
      description: r.text(o, "description", p, false),
      visibility: r.visibility(o, "visibility", p, false),
    }),
  );
}

function readPin(r: Reader, v: unknown, p: string): PinV2 | undefined {
  const o = r.obj(v, p, KEYS.pin);
  if (!o) return undefined;
  const before = r.errors.length;
  return r.okSince(
    before,
    compact<PinV2>({
      note: r.id(o, "note", p, true) as string,
      x: r.num(o, "x", p, true) as number,
      y: r.num(o, "y", p, true) as number,
      visibility: r.visibility(o, "visibility", p, false),
    }),
  );
}

function readBed(r: Reader, o: Obj, p: string): SoundBed | undefined {
  const b = r.sub(o, "bed", p, true, KEYS.bed);
  if (!b) return undefined;
  const bp = join(p, "bed");
  const before = r.errors.length;
  return r.okSince(
    before,
    compact<SoundBed>({
      src: r.text(b, "src", bp, true) as string,
      srcFallback: r.text(b, "srcFallback", bp, false),
      gain: r.num(b, "gain", bp, false, "nonNegative"),
    }),
  );
}

function readSoundArea(r: Reader, v: unknown, p: string): SoundAreaV2 | undefined {
  const o = r.obj(v, p, KEYS.soundArea);
  if (!o) return undefined;
  const before = r.errors.length;
  if (o.regionId === undefined && o.points === undefined) {
    r.fail(p, "needs either regionId (ride-on) or points (sound-only)");
  }
  return r.okSince(
    before,
    compact<SoundAreaV2>({
      id: r.id(o, "id", p, true) as string,
      regionId: r.id(o, "regionId", p, false),
      points: readPoints(r, o, p, false),
      visibility: r.visibility(o, "visibility", p, false),
      name: r.text(o, "name", p, false),
      bed: readBed(r, o, p) as SoundBed,
    }),
  );
}

function readMap(r: Reader, v: unknown, p: string): MapV2 | undefined {
  const o = r.obj(v, p, KEYS.map);
  if (!o) return undefined;
  const before = r.errors.length;
  const hasParent = o.parent !== undefined;
  if (!hasParent) {
    if (o.frame !== undefined) r.fail(join(p, "frame"), "only a map with a parent has a frame");
    if (o.enterZoom !== undefined) r.fail(join(p, "enterZoom"), "only a map with a parent has an enterZoom");
  }
  const frame = hasParent ? readFrame(r, o, p) : undefined;
  const enterZoom = !hasParent
    ? undefined
    : o.enterZoom === undefined
      ? r.fail(join(p, "enterZoom"), "is required on a map with a parent")
      : r.num(o, "enterZoom", p, true);
  return r.okSince(
    before,
    compact<MapV2>({
      id: r.id(o, "id", p, true) as string,
      name: r.text(o, "name", p, true) as string,
      width: r.num(o, "width", p, true, "positive") as number,
      height: r.num(o, "height", p, true, "positive") as number,
      visibility: r.visibility(o, "visibility", p, false),
      layers: r.list(o, "layers", p, true, (x, xp) => readLayer(r, x, xp)) as LayerV2[],
      scale: readScale(r, o, p) as MapScale,
      zoom: readZoom(r, o, p) as ZoomRangeV2,
      grid: readGrid(r, o, p),
      oceanColor: r.text(o, "oceanColor", p, false),
      wrapX: r.bool(o, "wrapX", p),
      soundscape: readSoundscape(r, o, p),
      parent: r.id(o, "parent", p, false),
      frame,
      enterZoom,
      regions: r.list(o, "regions", p, false, (x, xp) => readRegion(r, x, xp)),
      routes: r.list(o, "routes", p, false, (x, xp) => readRoute(r, x, xp)),
      pins: r.list(o, "pins", p, false, (x, xp) => readPin(r, x, xp)),
      sound: r.list(o, "sound", p, false, (x, xp) => readSoundArea(r, x, xp)),
    }),
  );
}

function readNoteOverride(r: Reader, v: unknown, p: string): NoteOverride | undefined {
  const o = r.obj(v, p, KEYS.noteOverride);
  if (!o) return undefined;
  const before = r.errors.length;
  return r.okSince(
    before,
    compact<NoteOverride>({
      visibility: r.visibility(o, "visibility", p, true) as VisibilityValue,
      // A string kept as written, like any visibility; missing is allowed (rule 6 makes it `dm`).
      basedOn: r.text(o, "basedOn", p, false),
      belongsTo: r.list(o, "belongsTo", p, false, (x, xp) => r.idValue(x, xp)),
    }),
  );
}

function readCalendar(r: Reader, v: unknown, p: string): WorldCalendar | undefined {
  const o = r.obj(v, p, KEYS.calendar);
  if (!o) return undefined;
  const before = r.errors.length;
  return r.okSince(
    before,
    compact<WorldCalendar>({
      name: r.text(o, "name", p, false),
      epochName: r.text(o, "epochName", p, false),
      daysPerWeek: r.num(o, "daysPerWeek", p, false, "positive"),
      months: r.list(o, "months", p, true, (x, xp) => {
        const m = r.obj(x, xp, KEYS.month);
        if (!m) return undefined;
        const b = r.errors.length;
        return r.okSince(b, {
          name: r.text(m, "name", xp, true) as string,
          days: r.num(m, "days", xp, true, "positive") as number,
        });
      }) as WorldCalendar["months"],
    }),
  );
}

function readCredits(r: Reader, v: unknown, p: string): CreditsConfig | undefined {
  const o = r.obj(v, p, KEYS.credits);
  if (!o) return undefined;
  const before = r.errors.length;
  return r.okSince(before, compact<CreditsConfig>({ badges: r.bool(o, "badges", p), page: r.bool(o, "page", p) }));
}

/** v1 reads a missing `enabled` as `false` (`resolveAssetCredits`); so does v2. */
function readAssetCredit(r: Reader, v: unknown, p: string): AssetCredit | undefined {
  const o = r.obj(v, p, KEYS.assetCredit);
  if (!o) return undefined;
  const before = r.errors.length;
  const credit = r.text(o, "credit", p, true);
  const enabled = r.bool(o, "enabled", p) ?? false;
  return r.okSince(before, { credit: credit as string, enabled });
}

function readImport(r: Reader, v: unknown, p: string): ImportFolderConfig | undefined {
  const o = r.obj(v, p, KEYS.import);
  if (!o) return undefined;
  const before = r.errors.length;
  const fp = join(p, "folders");
  return r.okSince(before, {
    // Open by design: keys are note types, values folder names.
    folders: (o.folders === undefined
      ? r.fail(fp, "is required")
      : r.record(o.folders, fp, (x, xp) => r.idValue(x, xp))) as Record<string, string>,
    defaultFolder: r.id(o, "defaultFolder", p, true) as string,
  });
}

function readWater(r: Reader, v: unknown, p: string): WaterConfig | undefined {
  const o = r.obj(v, p, KEYS.water);
  if (!o) return undefined;
  const before = r.errors.length;
  return r.okSince(
    before,
    compact<WaterConfig>({
      enabled: r.bool(o, "enabled", p),
      intensity: r.num(o, "intensity", p, false, "nonNegative"),
      speed: r.num(o, "speed", p, false, "nonNegative"),
      crestColor: r.text(o, "crestColor", p, false),
    }),
  );
}

function optional<T>(o: Obj, key: string, read: (v: unknown, p: string) => T | undefined): T | undefined {
  return o[key] === undefined ? undefined : read(o[key], key);
}

/** Validate a parsed v2 `world.yaml`. */
export function validateWorldFileV2(raw: unknown): SchemaV2Result<WorldFileV2> {
  const r = new Reader();
  const o = r.obj(raw, ROOT, KEYS.world);
  if (!o) return done<WorldFileV2>(r, undefined);

  const schemaVersion = r.schemaVersion(o);
  const w = r.sub(o, "world", ROOT, true, KEYS.worldBlock);
  const file = compact<WorldFileV2>({
    schemaVersion: schemaVersion as 2,
    world: (w && { id: r.id(w, "id", "world", true), name: r.text(w, "name", "world", true) }) as WorldFileV2["world"],
    calendar: optional(o, "calendar", (v, p) => readCalendar(r, v, p)),
    credits: optional(o, "credits", (v, p) => readCredits(r, v, p)),
    assetCredits: optional(o, "assetCredits", (v, p) => r.record(v, p, (x, xp) => readAssetCredit(r, x, xp))),
    import: optional(o, "import", (v, p) => readImport(r, v, p)),
    water: optional(o, "water", (v, p) => readWater(r, v, p)),
    maps: r.list(o, "maps", ROOT, true, (v, p) => readMap(r, v, p)) as MapV2[],
    notes: optional(o, "notes", (v, p) => r.record(v, p, (x, xp) => readNoteOverride(r, x, xp))),
  });
  return done(r, file);
}

// --- campaigns/<id>.yaml ---------------------------------------------------

function readCampaignMap(r: Reader, v: unknown, p: string): CampaignMapV2 | undefined {
  const o = r.obj(v, p, KEYS.campaignMap);
  if (!o) return undefined;
  const before = r.errors.length;
  const polygons = (key: string) => r.list(o, key, p, false, (x, xp) => r.polygon(x, xp));
  return r.okSince(
    before,
    compact<CampaignMapV2>({
      state: r.oneOf(o, "state", p, true, MAP_STATES) as MapState,
      reveals: polygons("reveals"),
      conceals: polygons("conceals"),
      featherPx: r.num(o, "featherPx", p, false, "nonNegative"),
    }),
  );
}

/**
 * Validate a parsed campaign file. A missing `maps:` reads as `{}` (every map
 * `unknown`); a missing `notes:` reads as `hidden`, never `vault` (fail closed).
 */
export function validateCampaignFileV2(raw: unknown): SchemaV2Result<CampaignFileV2> {
  const r = new Reader();
  const o = r.obj(raw, ROOT, KEYS.campaign);
  if (!o) return done<CampaignFileV2>(r, undefined);

  const file: CampaignFileV2 = {
    id: r.id(o, "id", ROOT, true) as string,
    name: r.text(o, "name", ROOT, true) as string,
    maps: (o.maps === undefined
      ? Object.create(null)
      : r.record(o.maps, "maps", (x, xp) => readCampaignMap(r, x, xp))) as CampaignFileV2["maps"],
    notes:
      o.notes === undefined
        ? "hidden"
        : o.notes === "vault" || o.notes === "hidden"
          ? o.notes
          : (r.fail("notes", `must be vault or hidden, got ${describe(o.notes)}`) as never),
  };
  return done(r, file);
}
